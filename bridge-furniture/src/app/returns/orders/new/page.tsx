import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog, loadFabricCatalogs } from "@/lib/catalog";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui/Bits";

export const metadata = { title: "مرتجع جديد" };

export default async function NewReturn() {
  const supabase = await createClient();
  const [products, catalogs, settings] = await Promise.all([loadCatalog(supabase), loadFabricCatalogs(supabase), getSettings()]);
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/returns", label: "مرتجعاتي" }} title="مرتجع جديد" subtitle="الزبون، المنتجات والأسعار والكميات، ثم الإرسال للمالك" />
      </div>
      <OrderForm products={products} catalogs={catalogs} basePath="/returns" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
