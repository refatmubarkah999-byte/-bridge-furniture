import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { FinanceNav, PeriodBar } from "@/components/finance/FinanceNav";
import { formatDateTime, formatILS, periodRange } from "@/lib/format";
import { orderHref } from "@/lib/nav";
import type { OrderStatus } from "@/lib/types";

export const metadata = { title: "أرباح الطلبيات" };

type Row = {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  submitted_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  sales_name: string;
  total: number;
  cost: number;
  profit: number;
  paid: number;
  pending: number;
  remaining: number;
  items_missing_cost: number;
};

export default async function FinanceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; q?: string; due?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireRole("super_admin", "accountant");
  const settings = await getSettings();
  const period = sp.period ?? (sp.from || sp.to ? "custom" : "month");
  const range = periodRange(period, settings.timezone, sp.from, sp.to);
  const due = sp.due === "1";
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_orders", {
    p_from: range.from ?? null,
    p_to: range.to ?? null,
    p_query: sp.q?.slice(0, 80) || null,
    p_only_due: due,
    p_limit: 200,
  });
  const rows = (data ?? []) as Row[];
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const extra = { q: sp.q, due: due ? "1" : undefined };
  const toggleDue = new URLSearchParams(Object.entries({ period, from: sp.from, to: sp.to, q: sp.q, due: due ? undefined : "1" }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="page">
      <PageHeader title="أرباح الطلبيات" subtitle={`${rows.length} طلبية · ربح ${formatILS(sum("profit"))} · متبقي ${formatILS(sum("remaining"))}`} />
      <FinanceNav active="orders" />
      <PeriodBar basePath="/finance/orders" period={period} range={range} extra={extra} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/finance/orders" className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="period" value={period} />
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          {due && <input type="hidden" name="due" value="1" />}
          <label className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute inset-y-0 right-3 my-auto h-5 w-5 text-muted" />
            <input name="q" defaultValue={sp.q} placeholder="رقم الطلبية، اسم الزبون أو هاتفه" className="field pr-10" />
          </label>
          <button className="btn-primary">بحث</button>
        </form>
        <Link href={`/finance/orders?${toggleDue}`} aria-pressed={due} className="chip">
          <Icon name="wallet" className="h-4 w-4" />
          عليها متبقي فقط
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="list" title="لا طلبيات" text={due ? "لا يوجد متبقي على أي طلبية في هذه الفترة." : "لا طلبيات مرسلة في هذه الفترة."} />
      ) : (
        <>
          {/* الهاتف: بطاقات */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.order_id}>
                <Link href={orderHref(profile.role, r.order_id)} className="card-interactive block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold ltr-nums">{r.order_number}</div>
                      <div className="truncate text-[14px]">{r.customer_name}</div>
                      <div className="text-[12px] text-muted">{r.sales_name} · {formatDateTime(r.submitted_at, settings.timezone)}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                    <Cell k="المجموع" v={r.total} />
                    <Cell k="الربح" v={r.profit} tone={Number(r.profit) < 0 ? "rose" : "emerald"} flag={r.items_missing_cost > 0} />
                    <Cell k="المتبقي" v={r.remaining} tone={Number(r.remaining) > 0 ? "amber" : undefined} pending={Number(r.pending)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* الكمبيوتر: جدول */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-canvas/60 text-right text-[13px] text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">الطلبية</th>
                  <th className="px-3 py-3 font-semibold">الزبون</th>
                  <th className="px-3 py-3 font-semibold">المجموع</th>
                  <th className="px-3 py-3 font-semibold">التكلفة</th>
                  <th className="px-3 py-3 font-semibold">الربح</th>
                  <th className="px-3 py-3 font-semibold">المدفوع</th>
                  <th className="px-3 py-3 font-semibold">المتبقي</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const href = orderHref(profile.role, r.order_id);
                  return (
                    <tr key={r.order_id} className="hover:bg-walnut-50/50">
                      <td className="px-4 py-3">
                        <Link href={href} className="font-bold ltr-nums hover:text-walnut-700">{r.order_number}</Link>
                        <div className="text-[12px] text-muted">{formatDateTime(r.submitted_at, settings.timezone)}</div>
                      </td>
                      <td className="px-3 py-3">
                        {r.customer_name}
                        <div className="text-[12px] text-muted">{r.sales_name}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold ltr-nums">{formatILS(r.total)}</td>
                      <td className="px-3 py-3 text-muted ltr-nums">
                        {formatILS(r.cost)}
                        {r.items_missing_cost > 0 && <span className="mr-1 text-[11px] font-bold text-amber-700" title="منتجات بدون تكلفة">!</span>}
                      </td>
                      <td className={`px-3 py-3 font-bold ltr-nums ${Number(r.profit) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatILS(r.profit)}</td>
                      <td className="px-3 py-3 ltr-nums">
                        {formatILS(r.paid)}
                        {Number(r.pending) > 0 && <div className="text-[12px] text-amber-700">+ {formatILS(r.pending)} معلّق</div>}
                      </td>
                      <td className={`px-3 py-3 font-semibold ltr-nums ${Number(r.remaining) > 0 ? "text-amber-800" : "text-muted"}`}>{formatILS(r.remaining)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-line bg-canvas/60 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>المجموع</td>
                  <td className="px-3 py-3 ltr-nums">{formatILS(sum("total"))}</td>
                  <td className="px-3 py-3 ltr-nums">{formatILS(sum("cost"))}</td>
                  <td className="px-3 py-3 ltr-nums">{formatILS(sum("profit"))}</td>
                  <td className="px-3 py-3 ltr-nums">{formatILS(sum("paid"))}</td>
                  <td className="px-3 py-3 ltr-nums">{formatILS(sum("remaining"))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ k, v, tone, flag, pending }: { k: string; v: number; tone?: "rose" | "emerald" | "amber"; flag?: boolean; pending?: number }) {
  const cls = tone === "rose" ? "text-rose-700" : tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-800" : "";
  return (
    <div>
      <div className="text-[11px] text-muted">{k}{flag ? " *" : ""}</div>
      <div className={`text-[14px] font-bold ltr-nums ${cls}`}>{formatILS(v)}</div>
      {pending ? <div className="text-[11px] text-amber-700">{formatILS(pending)} معلّق</div> : null}
    </div>
  );
}
