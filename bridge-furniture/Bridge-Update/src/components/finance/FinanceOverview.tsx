import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader, SectionCard } from "@/components/ui/Bits";
import { FinanceNav, PeriodBar, FINANCE_PERIODS } from "@/components/finance/FinanceNav";
import { MonthlyChart, type MonthRow } from "@/components/finance/MonthlyChart";
import { formatDate, formatILS } from "@/lib/format";
import { t } from "@/i18n";
import type { PaymentMethod } from "@/lib/types";

export type FinanceSummary = {
  orders: number;
  sales: number;
  items_revenue: number;
  delivery_fees: number;
  cost: number;
  profit: number;
  items_missing_cost: number;
  collected: number;
  collected_by_method: Partial<Record<PaymentMethod, number>>;
  pending: { count: number; amount: number };
  outstanding: number;
  outstanding_orders: number;
  by_model: { model: string; qty: number; revenue: number; cost: number; profit: number; missing_cost: boolean }[];
  by_sales: { name: string; orders: number; sales: number; profit: number; collected: number }[];
  by_month: MonthRow[];
  returns?: { count: number; total: number };
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function FinanceOverview({
  s,
  period,
  range,
}: {
  s: FinanceSummary;
  period: string;
  range: { from?: string; to?: string };
}) {
  const periodLabel = period === "custom" ? `${formatDate(range.from)} — ${formatDate(range.to)}` : FINANCE_PERIODS.find((p) => p.key === period)?.label ?? "";
  const margin = pct(s.profit, s.sales);
  const methods = (Object.keys(t.paymentMethod) as PaymentMethod[]).filter((m) => Number(s.collected_by_method[m] ?? 0) > 0);

  return (
    <div className="page">
      <PageHeader title="المالية" subtitle={`${periodLabel} · ${s.orders} طلبية`} />
      <FinanceNav active="overview" pending={s.pending.count} />
      <PeriodBar basePath="/finance" period={period} range={range} />

      {s.pending.count > 0 && (
        <Link href="/finance/payments" className="card-interactive mb-4 flex items-center gap-3 border-amber-300 bg-amber-50 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <Icon name="clock" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-amber-950">
              {s.pending.count === 1 ? "دفعة واحدة" : `${s.pending.count} دفعات`} بانتظار تأكيدك
            </span>
            <span className="block text-sm text-amber-900">
              مجموعها <span className="ltr-nums font-semibold">{formatILS(s.pending.amount)}</span> — لا تُحسب حتى تؤكد أنها وصلت
            </span>
          </span>
          <Icon name="chevronLeft" className="h-5 w-5 text-amber-800" />
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon="chart" label="المبيعات" value={formatILS(s.sales)} sub={`${s.orders} طلبية`} />
        <Kpi icon="sparkle" label="الربح" value={formatILS(s.profit)} sub={`هامش ${margin}% · التكلفة ${formatILS(s.cost)}`} tone={s.profit < 0 ? "rose" : "emerald"} />
        <Kpi icon="wallet" label="المحصّل" value={formatILS(s.collected)} sub="دفعات مؤكدة في الفترة" />
        <Kpi
          icon="alert"
          label="مستحق على الزبائن"
          value={formatILS(s.outstanding)}
          sub={`${s.outstanding_orders} طلبية · كل الفترات`}
          tone={s.outstanding > 0 ? "amber" : undefined}
          href="/finance/orders?due=1&period=all"
        />
      </div>

      {s.items_missing_cost > 0 && (
        <Link href="/finance/costs" className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {s.items_missing_cost === 1 ? "منتج واحد" : `${s.items_missing_cost} منتجات`} في هذه الفترة بدون تكلفة مسجّلة، فالربح المعروض أعلى من الحقيقي.{" "}
            <b className="underline">أضف التكاليف</b>
          </span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="حسب الشهر" icon="calendar">
            <MonthlyChart rows={s.by_month.map((m) => ({ month: m.month, sales: Number(m.sales), profit: Number(m.profit), collected: Number(m.collected) }))} />
          </SectionCard>

          <SectionCard title="الربح حسب الموديل" icon="box">
            {s.by_model.length === 0 ? (
              <p className="text-sm text-muted">لا مبيعات في هذه الفترة.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[520px] text-[14px]">
                  <thead className="text-right text-[13px] text-muted">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 font-semibold sm:px-2">الموديل</th>
                      <th className="px-2 py-2 font-semibold">القطع</th>
                      <th className="px-2 py-2 font-semibold">المبيعات</th>
                      <th className="px-2 py-2 font-semibold">التكلفة</th>
                      <th className="px-4 py-2 font-semibold sm:px-2">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.by_model.map((m) => {
                      const mp = pct(Number(m.profit), Number(m.revenue));
                      return (
                        <tr key={m.model}>
                          <td className="px-4 py-2.5 font-semibold sm:px-2">
                            {m.model}
                            {m.missing_cost && <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-900">بدون تكلفة</span>}
                          </td>
                          <td className="px-2 py-2.5 tabular">{m.qty}</td>
                          <td className="px-2 py-2.5 ltr-nums">{formatILS(m.revenue)}</td>
                          <td className="px-2 py-2.5 ltr-nums text-muted">{formatILS(m.cost)}</td>
                          <td className="px-4 py-2.5 sm:px-2">
                            <span className={`font-bold ltr-nums ${Number(m.profit) < 0 ? "text-rose-700" : ""}`}>{formatILS(m.profit)}</span>
                            <span className="mr-1 text-[12px] text-muted">{mp}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <SectionCard title="تفصيل المبيعات" icon="note">
            <dl className="space-y-2.5 text-[15px]">
              <Line k="المنتجات" v={s.items_revenue} />
              <Line k="رسوم التوصيل" v={s.delivery_fees} />
              <div className="border-t border-line pt-2.5"><Line k="المجموع" v={s.sales} strong /></div>
              <Line k="تكلفة المنتجات" v={-s.cost} />
              <div className="border-t border-line pt-2.5"><Line k="الربح الإجمالي" v={s.profit} strong /></div>
            </dl>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              الربح = المبيعات − تكلفة الموديلات. لا يشمل مصاريف أخرى (إيجار، رواتب، توصيل…). الطلبيات الملغية غير محسوبة.
            </p>
            {s.returns && s.returns.count > 0 && (
              <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-violet-50 p-2.5 text-[13px] text-violet-900">
                <Icon name="undo" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  المرتجعات في الفترة: {s.returns.count} بقيمة <b className="ltr-nums">{formatILS(s.returns.total)}</b> — غير داخلة في المبيعات والربح.
                </span>
              </p>
            )}
          </SectionCard>

          <SectionCard title="المحصّل حسب الطريقة" icon="wallet">
            {methods.length === 0 ? (
              <p className="text-sm text-muted">لا دفعات مؤكدة في هذه الفترة.</p>
            ) : (
              <ul className="space-y-2.5">
                {methods.map((m) => {
                  const v = Number(s.collected_by_method[m] ?? 0);
                  return (
                    <li key={m}>
                      <div className="flex justify-between text-[14px]">
                        <span>{t.paymentMethod[m]}</span>
                        <span className="font-semibold ltr-nums">{formatILS(v)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-walnut-500" style={{ width: `${pct(v, s.collected)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="حسب الموظف" icon="users">
            {s.by_sales.length === 0 ? (
              <p className="text-sm text-muted">لا طلبيات في هذه الفترة.</p>
            ) : (
              <ul className="divide-y divide-line">
                {s.by_sales.map((r) => (
                  <li key={r.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <span className="font-bold ltr-nums">{formatILS(r.sales)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[12px] text-muted">
                      <span>{r.orders} طلبية</span>
                      <span>ربح <span className="ltr-nums">{formatILS(r.profit)}</span></span>
                      <span>محصّل <span className="ltr-nums">{formatILS(r.collected)}</span></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "amber" | "rose";
  href?: string;
}) {
  const iconCls = { emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700" }[tone ?? "emerald"];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone ? iconCls : "bg-walnut-50 text-walnut-700"}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <div className={`mt-2 text-[21px] font-bold leading-none ltr-nums sm:text-2xl ${tone === "rose" ? "text-rose-700" : ""}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</div>}
    </>
  );
  return href ? <Link href={href} className="card-interactive block p-4">{body}</Link> : <div className="card p-4">{body}</div>;
}

function Line({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}>
      <dt className={strong ? "" : "text-ink/75"}>{k}</dt>
      <dd className="ltr-nums">{v < 0 ? `− ${formatILS(-v)}` : formatILS(v)}</dd>
    </div>
  );
}
