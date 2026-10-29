import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/format";
import { OrdersTable } from "@/components/OrdersTable";
import { friendlyError } from "@/lib/errors";
import { UUID_RE } from "@/lib/orders";
import { ORDER_FLOW, type OrderRow, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

export const metadata = { title: "الطلبيات" };

const PAGE = 50;
const STATUSES: OrderStatus[] = [...ORDER_FLOW, "cancelled", "draft"];

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; sales?: string; delayed?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : null;
  const supabase = await createClient();

  const [ordersRes, salesRes] = await Promise.all([
    supabase.rpc("search_orders", {
      p_query: sp.q?.slice(0, 80) || null,
      p_status: status,
      p_from: isIsoDate(sp.from) ? sp.from : null,
      p_to: isIsoDate(sp.to) ? sp.to : null,
      p_sales: sp.sales && UUID_RE.test(sp.sales) ? sp.sales : null,
      p_limit: PAGE + 1,
      p_offset: (page - 1) * PAGE,
      p_delayed_only: sp.delayed === "1",
    }),
    supabase.from("profiles").select("id, full_name").in("role", ["sales", "super_admin"]).order("full_name"),
  ]);
  const all = (ordersRes.data ?? []) as OrderRow[];
  const rows = all.slice(0, PAGE);
  const hasMore = all.length > PAGE;
  const sales = (salesRes.data ?? []) as { id: string; full_name: string }[];

  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    params.set("page", String(p));
    return `/admin/orders?${params}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.nav.orders}</h1>
        <Link href="/admin/orders/new" className="btn-primary">+ {t.nav.newOrder}</Link>
      </div>

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="رقم، اسم زبون، هاتف، مدينة، موديل" className="field lg:col-span-2" />
        <select name="status" defaultValue={status ?? ""} className="field">
          <option value="">كل الحالات (عدا المسودات)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t.status[s]}</option>
          ))}
        </select>
        <select name="sales" defaultValue={sp.sales ?? ""} className="field">
          <option value="">كل الموظفين</option>
          {sales.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="field ltr-nums" aria-label="من تاريخ" />
        <input type="date" name="to" defaultValue={sp.to} className="field ltr-nums" aria-label="إلى تاريخ" />
        <label className="flex items-center gap-2 text-sm lg:col-span-2">
          <input type="checkbox" name="delayed" value="1" defaultChecked={sp.delayed === "1"} className="h-5 w-5" />
          المتأخرة فقط
        </label>
        <div className="flex gap-2 lg:col-span-4 lg:justify-end">
          <Link href="/admin/orders" className="btn-secondary">مسح</Link>
          <button className="btn-primary">{t.common.search}</button>
        </div>
      </form>
      <p className="text-xs text-muted">التاريخ هنا هو تاريخ إرسال الطلبية.</p>

      {ordersRes.error ? (
        <p className="card p-6 text-rose-700">{friendlyError(ordersRes.error)}</p>
      ) : (
        <OrdersTable rows={rows} hrefBase="/admin/orders" />
      )}

      <div className="flex justify-between">
        {page > 1 ? <Link href={pageHref(page - 1)} className="btn-secondary">→ السابق</Link> : <span />}
        {hasMore && <Link href={pageHref(page + 1)} className="btn-secondary">التالي ←</Link>}
      </div>
    </div>
  );
}
