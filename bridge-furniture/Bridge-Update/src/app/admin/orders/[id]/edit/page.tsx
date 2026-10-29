import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { loadOrderDetail } from "@/lib/orders";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";

export const metadata = { title: "تعديل الطلبية" };

export default async function AdminEditOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [loaded, products, settings] = await Promise.all([loadOrderDetail(supabase, id), loadCatalog(supabase), getSettings()]);
  if (!loaded) notFound();
  if (!loaded.order.can_edit) redirect(`/admin/orders/${id}`);
  const o = loaded.order;
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={{ href: `/admin/orders/${id}`, label: "تفاصيل الطلبية" }}
          title={o.order_number ? <>تعديل <span className="ltr-nums">{o.order_number}</span></> : "مسودة طلبية"}
          subtitle={o.order_number ? undefined : "أكمل البيانات ثم أرسلها"}
        />
        {o.status !== "draft" && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            الطلبية مُرسلة: أي تعديل على المنتجات أو التاريخ يصل كإشعار إلى المصنع ويُسجَّل في سجل التدقيق.
          </p>
        )}
      </div>
      <OrderForm products={products} initial={o} basePath="/admin" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
