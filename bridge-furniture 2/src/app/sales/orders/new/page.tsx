import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { todayInTz } from "@/lib/format";
import { OrderForm } from "@/components/OrderForm";

export const metadata = { title: "طلبية جديدة" };

export default async function SalesNewOrder() {
  const supabase = await createClient();
  const [products, settings] = await Promise.all([loadCatalog(supabase), getSettings()]);
  return (
    <>
      <h1 className="mx-auto mb-4 max-w-3xl text-2xl font-bold">طلبية جديدة</h1>
      <OrderForm products={products} basePath="/sales" minDate={todayInTz(settings.timezone)} />
    </>
  );
}
