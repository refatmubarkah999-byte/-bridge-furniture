import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { loadOrderDetail } from "@/lib/orders";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui/Bits";

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
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={{ href: o.order_number ? `/sales/orders/${id}` : "/sales?tab=drafts", label: o.order_number ? "تفاصيل الطلبية" : "المسودات" }}
          title={o.order_number ? <>تعديل <span className="ltr-nums">{o.order_number}</span></> : "مسودة طلبية"}
          subtitle={o.order_number ? undefined : "أكمل البيانات ثم أرسلها"}
        />
      </div>
      <OrderForm products={products} initial={o} basePath="/sales" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
