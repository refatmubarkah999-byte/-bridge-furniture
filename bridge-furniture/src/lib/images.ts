import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_BUCKET = "product-images";

/** روابط مؤقتة (ساعة واحدة) لصور المنتجات من المخزن الخاص */
export async function signImagePaths(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (!unique.length) return {};
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(unique, 3600);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}
