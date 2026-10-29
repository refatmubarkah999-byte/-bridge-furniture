"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentProfileWithRole } from "@/lib/auth";
import { IMAGE_BUCKET } from "@/lib/images";
import { writeAudit } from "@/lib/audit";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/types";

const MAX_IMAGE = 5 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const ProductSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم الموديل").max(80),
  standard_price: z.coerce.number().min(0).max(1_000_000),
  colors: z
    .string()
    .transform((s) => Array.from(new Set(s.split(/[,،\n]/).map((c) => c.trim()).filter(Boolean))))
    .pipe(z.array(z.string().max(40)).max(30)),
});

/** يتحقق من أن الملف صورة فعلاً (من أول بايتات الملف، لا من اسمه فقط) */
async function validateImage(file: File): Promise<string | null> {
  if (file.size > MAX_IMAGE) return "حجم الصورة أكبر من 5 ميغابايت.";
  const ext = MIME_EXT[file.type];
  if (!ext) return "الصورة يجب أن تكون JPG أو PNG أو WebP.";
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  if (!(isJpg || isPng || isWebp)) return "الملف ليس صورة صالحة.";
  return null;
}

async function uploadPrimaryImage(supabase: Awaited<ReturnType<typeof createClient>>, productId: string, file: File) {
  const path = `products/${productId}/${crypto.randomUUID()}.${MIME_EXT[file.type]}`;
  const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return upErr.message;
  // الصور القديمة تبقى في المخزن لأن الطلبيات السابقة تشير إليها
  await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId).eq("is_primary", true);
  const { error } = await supabase.from("product_images").insert({ product_id: productId, storage_path: path, is_primary: true });
  return error?.message ?? null;
}

export async function createProductAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentProfileWithRole("super_admin");
  if (!me) return { ok: false, error: t.errors.forbidden };
  const parsed = ProductSchema.safeParse({
    name: formData.get("name"),
    standard_price: formData.get("standard_price"),
    colors: formData.get("colors") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.invalid_payload };
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const bad = await validateImage(image);
    if (bad) return { ok: false, error: bad };
  }

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .insert({ name: parsed.data.name, standard_price: parsed.data.standard_price })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "يوجد موديل بنفس الاسم." : t.errors.generic };

  await supabase.from("product_colors").insert(parsed.data.colors.map((name) => ({ product_id: product.id, name })));
  if (image instanceof File && image.size > 0) {
    const err = await uploadPrimaryImage(supabase, product.id, image);
    if (err) return { ok: false, error: "تم حفظ الموديل لكن فشل رفع الصورة. حاول رفعها من التعديل." };
  }
  await writeAudit(me.id, "product_created", "product", product.id, { name: parsed.data.name });
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function updateProductAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentProfileWithRole("super_admin");
  if (!me) return { ok: false, error: t.errors.forbidden };
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t.errors.invalid_payload };
  const parsed = ProductSchema.safeParse({
    name: formData.get("name"),
    standard_price: formData.get("standard_price"),
    colors: formData.get("colors") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.invalid_payload };
  const isActive = formData.get("is_active") === "on";
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const bad = await validateImage(image);
    if (bad) return { ok: false, error: bad };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ name: parsed.data.name, standard_price: parsed.data.standard_price, is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "يوجد موديل بنفس الاسم." : t.errors.generic };

  // مزامنة الألوان: المحذوف يُوقف (لا يُحذف)، والجديد يُضاف أو يُعاد تفعيله
  const { data: existing } = await supabase.from("product_colors").select("name, is_active").eq("product_id", id);
  const wanted = new Set(parsed.data.colors);
  const have = new Map((existing ?? []).map((c) => [c.name as string, c.is_active as boolean]));
  const toDisable = [...have.keys()].filter((n) => !wanted.has(n) && have.get(n));
  const toEnable = [...wanted].filter((n) => have.has(n) && !have.get(n));
  const toAdd = [...wanted].filter((n) => !have.has(n));
  if (toDisable.length) await supabase.from("product_colors").update({ is_active: false }).eq("product_id", id).in("name", toDisable);
  if (toEnable.length) await supabase.from("product_colors").update({ is_active: true }).eq("product_id", id).in("name", toEnable);
  if (toAdd.length) await supabase.from("product_colors").insert(toAdd.map((name) => ({ product_id: id, name })));

  if (image instanceof File && image.size > 0) {
    const err = await uploadPrimaryImage(supabase, id, image);
    if (err) return { ok: false, error: "فشل رفع الصورة." };
  }
  await writeAudit(me.id, "product_updated", "product", id, {
    name: parsed.data.name,
    standard_price: parsed.data.standard_price,
    is_active: isActive,
  });
  revalidatePath("/admin/products");
  return { ok: true };
}
