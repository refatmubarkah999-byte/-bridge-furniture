import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { isIsoDate } from "@/lib/format";
import { OrdersTable } from "@/components/OrdersTable";
import { OrdersFilters } from "@/components/OrdersFilters";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
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
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; sales?: string; delayed?: string; page?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : null;
  const supabase = await createClient();
  const settings = await getSettings();

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
      p_kind: sp.kind === "return" || sp.kind === "regular" ? sp.kind : null,
    }),
    supabase.from("profiles").select("id, full_name").in("role", ["sales", "super_admin", "returns"]).order("full_name"),
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
    <div className="page">
      <PageHeader
        title={t.nav.orders}
        subtitle={status ? t.status[status] : sp.delayed === "1" ? "المتأخرة عن موعد التسليم" : sp.kind === "return" ? "المرتجعات (بأسعارها)" : "كل الطلبيات المرسلة والمرتجعات"}
        actions={
          <Link href="/admin/orders/new" className="btn-primary hidden md:inline-flex">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
            {t.nav.newOrder}
          </Link>
        }
      />
      <OrdersFilters sp={sp} sales={sales} />

      {ordersRes.error ? (
        <EmptyState icon="alert" title="تعذّر تحميل الطلبيات" text={friendlyError(ordersRes.error)} />
      ) : (
        <OrdersTable
          rows={rows}
          hrefBase="/admin/orders"
          timeZone={settings.timezone}
          empty={{ title: t.common.noResults, text: "غيّر البحث أو الفلاتر.", action: <Link href="/admin/orders" className="btn-secondary">مسح الفلاتر</Link> }}
        />
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-4 flex justify-between">
          {page > 1 ? <Link href={pageHref(page - 1)} className="btn-secondary"><Icon name="chevronRight" className="h-5 w-5" />السابق</Link> : <span />}
          {hasMore && <Link href={pageHref(page + 1)} className="btn-secondary">التالي<Icon name="chevronLeft" className="h-5 w-5" /></Link>}
        </div>
      )}
    </div>
  );
}
