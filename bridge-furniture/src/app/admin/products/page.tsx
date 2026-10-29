import { createClient } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/catalog";
import { ProductsView } from "./ProductsView";

export const metadata = { title: "الموديلات" };

export default async function ProductsPage() {
  const supabase = await createClient();
  const products = await loadCatalog(supabase);
  return <ProductsView products={products} />;
}
