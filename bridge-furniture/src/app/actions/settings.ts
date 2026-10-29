"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/types";

const Schema = z.object({
  company_name: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(3).max(64),
  order_prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, "البادئة حروف إنجليزية كبيرة فقط (1 إلى 5)"),
  promo_url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "الرابط يجب أن يبدأ بـ https://")
    .optional()
    .default(""),
  promo_text: z.string().trim().max(80).optional().default(""),
});

export async function updateSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.invalid_payload };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_settings", {
    p_company_name: parsed.data.company_name,
    p_timezone: parsed.data.timezone,
    p_order_prefix: parsed.data.order_prefix,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  const promo = await supabase.rpc("update_promo", {
    p_url: parsed.data.promo_url || null,
    p_text: parsed.data.promo_text || null,
  });
  if (promo.error) return { ok: false, error: friendlyError(promo.error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
