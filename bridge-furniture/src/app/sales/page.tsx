import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OrdersTable } from "@/components/OrdersTable";
import type { OrderRow } from "@/lib/types";
import { t } from "@/i18n";

export const metadata = { title: "طلبياتي" };

export default async function SalesHome({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "drafts" ? "drafts" : "sent";
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_orders", {
    p_query: sp.q?.slice(0, 80) || null,
    p_status: tab === "drafts" ? "draft" : null,
    p_limit: 100,
  });
  const rows = (data ?? []) as OrderRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.nav.myOrders}</h1>
        <Link href="/sales/orders/new" className="btn-primary">+ {t.nav.newOrder}</Link>
      </div>
      <div className="flex gap-2">
        <Link href="/sales" className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${tab === "sent" ? "bg-walnut-600 text-white ring-walnut-600" : "bg-white ring-line"}`}>
          المرسلة
        </Link>
        <Link href="/sales?tab=drafts" className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${tab === "drafts" ? "bg-walnut-600 text-white ring-walnut-600" : "bg-white ring-line"}`}>
          المسودات
        </Link>
      </div>
      <form className="flex gap-2">
        {tab === "drafts" && <input type="hidden" name="tab" value="drafts" />}
        <input name="q" defaultValue={sp.q} placeholder="رقم الطلبية، اسم الزبون، الهاتف" className="field" />
        <button className="btn-secondary">{t.common.search}</button>
      </form>
      <OrdersTable rows={rows} hrefBase="/sales/orders" showSales={false} />
    </div>
  );
}
