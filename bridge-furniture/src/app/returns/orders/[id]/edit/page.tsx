import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { loadOrderDetail } from "@/lib/orders";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui/Bits";

export const metadata = { title: "مسودة مرتجع" };

/** تعديل المسودة فقط — بعد الإرسال لا تعديل (القاعدة ترفض ذلك أيضاً) */
export default async function EditReturnDraft({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [loaded, products, settings] = await Promise.all([loadOrderDetail(supabase, id), loadCatalog(supabase), getSettings()]);
  if (!loaded) notFound();
  if (!loaded.order.can_edit || loaded.order.status !== "draft") redirect(`/returns/orders/${id}`);
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/returns?tab=drafts", label: "المسودات" }} title="مسودة مرتجع" subtitle="أكمل البيانات ثم أرسلها" />
      </div>
      <OrderForm products={products} initial={loaded.order} basePath="/returns" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
