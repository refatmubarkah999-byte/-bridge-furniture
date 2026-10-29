"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentProfileWithRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

async function guard() {
  const me = await currentProfileWithRole("super_admin");
  return me ? { me, supabase: await createClient() } : null;
}
function done() {
  revalidatePath("/admin/catalogs");
  return { ok: true } as const;
}

export async function createCatalogAction(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (n.length < 1 || n.length > 60) return { ok: false, error: "اكتب اسم الكتالوج (حتى 60 حرفاً)." };
  const g = await guard();
  if (!g) return { ok: false, error: t.errors.forbidden };
  const { data, error } = await g.supabase.from("fabric_catalogs").insert({ name: n }).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "يوجد كتالوج بنفس الاسم." : t.errors.generic };
  await writeAudit(g.me.id, "catalog_created", "catalog", data.id, { name: n });
  return done();
}

export async function updateCatalogAction(catalogId: string, patch: { name?: string; is_active?: boolean }): Promise<ActionResult> {
  if (!id.safeParse(catalogId).success) return { ok: false, error: t.errors.invalid_payload };
  const clean: { name?: string; is_active?: boolean } = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 1 || n.length > 60) return { ok: false, error: "اكتب اسم الكتالوج (حتى 60 حرفاً)." };
    clean.name = n;
  }
  if (patch.is_active !== undefined) clean.is_active = !!patch.is_active;
  const g = await guard();
  if (!g) return { ok: false, error: t.errors.forbidden };
  const { error } = await g.supabase.from("fabric_catalogs").update(clean).eq("id", catalogId);
  if (error) return { ok: false, error: error.code === "23505" ? "يوجد كتالوج بنفس الاسم." : t.errors.generic };
  return done();
}

/** إضافة رقم لون أو عدة أرقام دفعة واحدة: "07 بيج، 12، 25 رمادي" */
export async function addColorsAction(catalogId: string, input: string): Promise<ActionResult> {
  if (!id.safeParse(catalogId).success) return { ok: false, error: t.errors.invalid_payload };
  const rows = toLatin(input)
    .split(/[,،\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [code, ...rest] = p.split(/\s+/);
      return { catalog_id: catalogId, code: code.slice(0, 20), name: rest.join(" ").slice(0, 40) || null };
    });
  if (!rows.length) return { ok: false, error: "اكتب رقم اللون، مثل: 07 أو 07 بيج." };
  if (rows.length > 100) return { ok: false, error: "حتى 100 لون في المرة." };
  const unique = Array.from(new Map(rows.map((r) => [r.code, r])).values());
  const g = await guard();
  if (!g) return { ok: false, error: t.errors.forbidden };
  const { error } = await g.supabase.from("catalog_colors").upsert(unique, { onConflict: "catalog_id,code" });
  if (error) return { ok: false, error: t.errors.generic };
  return done();
}

export async function updateColorAction(colorId: string, patch: { name?: string; is_active?: boolean }): Promise<ActionResult> {
  if (!id.safeParse(colorId).success) return { ok: false, error: t.errors.invalid_payload };
  const clean: { name?: string | null; is_active?: boolean } = {};
  if (patch.name !== undefined) clean.name = patch.name.trim().slice(0, 40) || null;
  if (patch.is_active !== undefined) clean.is_active = !!patch.is_active;
  const g = await guard();
  if (!g) return { ok: false, error: t.errors.forbidden };
  const { error } = await g.supabase.from("catalog_colors").update(clean).eq("id", colorId);
  if (error) return { ok: false, error: t.errors.generic };
  return done();
}

/** الحذف آمن: الطلبيات السابقة تحتفظ بنسخة من الكتالوج ورقم اللون */
export async function deleteColorAction(colorId: string): Promise<ActionResult> {
  if (!id.safeParse(colorId).success) return { ok: false, error: t.errors.invalid_payload };
  const g = await guard();
  if (!g) return { ok: false, error: t.errors.forbidden };
  const { error } = await g.supabase.from("catalog_colors").delete().eq("id", colorId);
  if (error) return { ok: false, error: t.errors.generic };
  return done();
}
