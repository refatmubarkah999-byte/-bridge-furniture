import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signImagePaths } from "@/lib/images";
import type { CatalogProduct } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  standard_price: number;
  is_active: boolean;
  product_colors: { name: string; is_active: boolean }[];
  product_images: { storage_path: string; is_primary: boolean }[];
};

/** الكتالوج كاملاً مع روابط مؤقتة للصورة الرئيسية لكل موديل (للمالك والمبيعات فقط بحسب RLS) */
export async function loadCatalog(supabase: SupabaseClient): Promise<CatalogProduct[]> {
  const { data } = await supabase
    .from("products")
    .select("id, name, standard_price, is_active, product_colors(name, is_active), product_images(storage_path, is_primary)")
    .order("is_active", { ascending: false })
    .order("name");
  const rows = (data ?? []) as Row[];
  const primary = (r: Row) => r.product_images.find((i) => i.is_primary)?.storage_path ?? null;
  const urls = await signImagePaths(supabase, rows.map(primary));
  return rows.map((r) => {
    const path = primary(r);
    return {
      id: r.id,
      name: r.name,
      standard_price: Number(r.standard_price),
      is_active: r.is_active,
      colors: [...r.product_colors].sort((a, b) => a.name.localeCompare(b.name, "ar")),
      image_path: path,
      image_url: path ? urls[path] ?? null : null,
    };
  });
}
