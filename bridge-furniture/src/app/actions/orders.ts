"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentProfileWithRole } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { t } from "@/i18n";
import type { ActionResult, OrderStatus } from "@/lib/types";

// شكل البيانات فقط؛ قواعد المحتوى (الكمية، السعر، اللون، الهاتف...) تتحقق منها قاعدة البيانات
const money = z.coerce.number().finite().min(0).max(10_000_000);
const OrderPayload = z.object({
  order_id: z.string().uuid().optional(),
  idempotency_key: z.string().uuid(),
  expected_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  customer: z.object({
    full_name: z.string().max(100),
    phone: z.string().max(20),
    phone2: z.string().max(20).optional().default(""),
    city: z.string().max(60),
    address: z.string().max(300),
  }),
  customer_notes: z.string().max(1000).optional().default(""),
  internal_notes: z.string().max(1000).optional().default(""),
  delivery_fee: money.default(0),
  deposit: money.default(0),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        color: z.string().max(40),
        quantity: z.coerce.number().int(),
        unit_price: money,
        notes: z.string().max(500).optional().default(""),
      })
    )
    .max(50),
});
export type OrderPayloadInput = z.input<typeof OrderPayload>;

function normalizePhone(v: string) {
  return v.replace(/[\s\-()]/g, "");
}

async function save(input: OrderPayloadInput) {
  const parsed = OrderPayload.safeParse(input);
  if (!parsed.success) return { error: t.errors.invalid_payload } as const;
  const p = parsed.data;
  p.customer.phone = normalizePhone(p.customer.phone);
  p.customer.phone2 = normalizePhone(p.customer.phone2 ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_order_draft", { p });
  if (error) return { error: friendlyError(error) } as const;
  return { orderId: data as string, supabase } as const;
}

export async function saveDraftAction(input: OrderPayloadInput): Promise<ActionResult<{ orderId: string }>> {
  if (!(await currentProfileWithRole("super_admin", "sales", "returns"))) return { ok: false, error: t.errors.forbidden };
  const r = await save(input);
  if ("error" in r) return { ok: false, error: r.error! };
  revalidatePath("/", "layout");
  return { ok: true, data: { orderId: r.orderId } };
}

/** حفظ ثم إرسال. آمن ضد الضغط المزدوج: نفس رمز الإرسال يعيد نفس الطلبية ونفس الرقم. */
export async function submitOrderAction(
  input: OrderPayloadInput
): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  if (!(await currentProfileWithRole("super_admin", "sales", "returns"))) return { ok: false, error: t.errors.forbidden };
  const r = await save(input);
  if ("error" in r) return { ok: false, error: r.error! };
  const { data, error } = await r.supabase.rpc("submit_order", { p_order_id: r.orderId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { orderId: r.orderId, orderNumber: (data as { order_number: string }).order_number } };
}

export async function deleteDraftAction(orderId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: t.errors.invalid_payload };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_draft", { p_order_id: orderId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

const STATUSES = ["new", "received", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"] as const;

export async function changeStatusAction(orderId: string, status: OrderStatus, note?: string): Promise<ActionResult> {
  const ok =
    z.string().uuid().safeParse(orderId).success &&
    (STATUSES as readonly string[]).includes(status) &&
    (note ?? "").length <= 300;
  if (!ok) return { ok: false, error: t.errors.invalid_payload };
  if (!(await currentProfileWithRole("super_admin", "factory_admin"))) return { ok: false, error: t.errors.forbidden };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_order_status", {
    p_order_id: orderId,
    p_new: status,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recordPaymentAction(_prev: ActionResult<{ status: string }>, formData: FormData): Promise<ActionResult<{ status: string }>> {
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      amount: z.coerce.number().positive().max(10_000_000),
      note: z.string().max(300),
      method: z.enum(["cash", "transfer", "cheque", "card"]),
    })
    .safeParse({
      orderId: formData.get("orderId"),
      amount: String(formData.get("amount") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]/g, ""),
      note: formData.get("note") ?? "",
      method: formData.get("method") ?? "cash",
    });
  if (!parsed.success) return { ok: false, error: t.errors.invalid_amount };
  if (!(await currentProfileWithRole("super_admin", "accountant", "sales"))) return { ok: false, error: t.errors.forbidden };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_order_id: parsed.data.orderId,
    p_amount: Math.round(parsed.data.amount * 100) / 100,
    p_note: parsed.data.note || null,
    p_method: parsed.data.method,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { status: String((data as { status?: string } | null)?.status ?? "confirmed") } };
}
