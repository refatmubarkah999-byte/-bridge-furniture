import { createClient } from "@/lib/supabase/server";
import { loadFabricCatalogs } from "@/lib/catalog";
import { CatalogsManager } from "./CatalogsManager";

export const metadata = { title: "الكتالوجات" };

export default async function CatalogsPage() {
  const supabase = await createClient();
  const catalogs = await loadFabricCatalogs(supabase);
  return <CatalogsManager catalogs={catalogs} />;
}
