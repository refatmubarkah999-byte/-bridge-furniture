import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui/Bits";

export const metadata = { title: "طلبية جديدة" };

export default async function AdminNewOrder() {
  const supabase = await createClient();
  const [products, settings] = await Promise.all([loadCatalog(supabase), getSettings()]);
  return (
    <>
      <div className="mx-auto max-w-3xl"><PageHeader back={{ href: "/admin/orders", label: "الطلبيات" }} title="طلبية جديدة" subtitle="أربع خطوات: الزبون، المنتجات، التسليم، ثم الإرسال" /></div>
      <OrderForm products={products} basePath="/admin" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
