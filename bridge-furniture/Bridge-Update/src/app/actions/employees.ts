"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentProfileWithRole } from "@/lib/auth";
import { usernameToEmail } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/types";

const roleSchema = z.enum(["super_admin", "factory_admin", "sales", "accountant", "returns"]);
const passwordSchema = z
  .string()
  .min(10, "كلمة المرور 10 أحرف على الأقل")
  .max(72)
  .regex(/[A-Za-z]/, "كلمة المرور يجب أن تحتوي حروفاً")
  .regex(/[0-9]/, "كلمة المرور يجب أن تحتوي أرقاماً");
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => v === "" || /^\+?[0-9]{9,15}$/.test(v), "رقم الهاتف غير صالح");

const CreateSchema = z.object({
  full_name: z.string().trim().min(2, "اكتب الاسم الكامل").max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.-]{3,32}$/, "اسم المستخدم: حروف إنجليزية صغيرة وأرقام فقط (3 إلى 32)"),
  phone: phoneSchema,
  role: roleSchema,
  password: passwordSchema,
});

const BAN_FOREVER = "876000h"; // 100 سنة

export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentProfileWithRole("super_admin");
  if (!me) return { ok: false, error: t.errors.forbidden };
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.invalid_payload };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(d.username),
    password: d.password,
    email_confirm: true,
    app_metadata: { role: d.role },
  });
  if (error || !created.user) {
    return { ok: false, error: /already|exists|registered/i.test(error?.message ?? "") ? t.errors.username_taken : t.errors.generic };
  }

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username: d.username,
    full_name: d.full_name,
    phone: d.phone || null,
    role: d.role,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: pErr.code === "23505" ? t.errors.username_taken : t.errors.generic };
  }
  await writeAudit(me.id, "employee_created", "profile", created.user.id, { username: d.username, role: d.role });
  revalidatePath("/admin/employees");
  return { ok: true };
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  role: roleSchema,
  is_active: z.boolean(),
  permissions: z.array(z.enum(["view_all_orders", "edit_submitted_orders"])),
});

export async function updateEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentProfileWithRole("super_admin");
  if (!me) return { ok: false, error: t.errors.forbidden };
  const parsed = UpdateSchema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone") ?? "",
    role: formData.get("role"),
    is_active: formData.get("is_active") === "on",
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.invalid_payload };
  const d = parsed.data;

  // التعديل عبر دالة القاعدة (تتحقق أن المستدعي مالك، وتمنع تعطيل النفس، وتسجّل في التدقيق)
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_employee", {
    p_user_id: d.id,
    p_full_name: d.full_name,
    p_phone: d.phone || null,
    p_role: d.role,
    p_is_active: d.is_active,
    p_permissions: d.permissions,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  // إيقاف الحساب يقطع الدخول فوراً على مستوى نظام الدخول أيضاً
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(d.id, {
    ban_duration: d.is_active ? "none" : BAN_FOREVER,
    app_metadata: { role: d.role },
  });
  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function resetPasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentProfileWithRole("super_admin");
  if (!me) return { ok: false, error: t.errors.forbidden };
  const id = String(formData.get("id") ?? "");
  const pw = passwordSchema.safeParse(formData.get("password"));
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: t.errors.invalid_payload };
  if (!pw.success) return { ok: false, error: pw.error.issues[0]?.message ?? t.errors.invalid_payload };
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: pw.data });
  if (error) return { ok: false, error: t.errors.generic };
  await writeAudit(me.id, "password_reset", "profile", id);
  return { ok: true };
}
