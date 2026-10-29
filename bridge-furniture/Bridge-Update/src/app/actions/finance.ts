"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentProfileWithRole } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/types";

/** تأكيد أو رفض دفعة سجّلها موظف مبيعات */
export async function reviewPaymentAction(paymentId: string, approve: boolean, note?: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(paymentId).success || (note ?? "").length > 300) {
    return { ok: false, error: t.errors.invalid_payload };
  }
  if (!(await currentProfileWithRole("super_admin", "accountant"))) return { ok: false, error: t.errors.forbidden };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** تكلفة الموديل (للحساب الربح). تنطبق على الطلبيات التي تُحفظ بعد التعديل */
export async function setProductCostAction(productId: string, cost: string): Promise<ActionResult> {
  const clean = cost.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]/g, "");
  const parsed = z.coerce.number().min(0).max(1_000_000).safeParse(clean);
  if (!z.string().uuid().safeParse(productId).success || !parsed.success || clean === "") {
    return { ok: false, error: t.errors.invalid_amount };
  }
  if (!(await currentProfileWithRole("super_admin", "accountant"))) return { ok: false, error: t.errors.forbidden };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_cost", {
    p_product_id: productId,
    p_cost: Math.round(parsed.data * 100) / 100,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/finance", "layout");
  return { ok: true };
}
