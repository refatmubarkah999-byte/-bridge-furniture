import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { loadOrderDetail } from "@/lib/orders";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";

export const metadata = { title: "تعديل الطلبية" };

export default async function SalesEditOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [loaded, products, settings] = await Promise.all([loadOrderDetail(supabase, id), loadCatalog(supabase), getSettings()]);
  if (!loaded) notFound();
  if (!loaded.order.can_edit) redirect(`/sales/orders/${id}`);
  const o = loaded.order;
  return (
    <>
      <h1 className="mx-auto mb-4 max-w-3xl text-2xl font-bold">
        {o.order_number ? <>تعديل الطلبية <span className="ltr-nums">{o.order_number}</span></> : "مسودة طلبية"}
      </h1>
      <OrderForm products={products} initial={o} basePath="/sales" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
