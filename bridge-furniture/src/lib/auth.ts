import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/types";

export function homeFor(role: AppRole) {
  if (role === "super_admin") return "/admin";
  if (role === "factory_admin") return "/factory";
  if (role === "accountant") return "/finance";
  if (role === "returns") return "/returns";
  return "/sales";
}

/** المستخدم الحالي وملفه — مرة واحدة لكل طلب */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});

/** للصفحات: يعيد التوجيه إن لم يكن الدور مسموحاً */
export async function requireRole(...roles: AppRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?disabled=1");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

/** للعمليات (Server Actions): يُرجع null بدل إعادة التوجيه. القاعدة تتحقق مرة ثانية على أي حال. */
export async function currentProfileWithRole(...roles: AppRole[]): Promise<Profile | null> {
  const profile = await getProfile();
  if (!profile || !profile.is_active || !roles.includes(profile.role)) return null;
  return profile;
}

export const getSettings = cache(async () => {
  const supabase = await createClient();
  // "*" حتى لا تتعطل الإعدادات إذا لم يُشغَّل ملف قاعدة البيانات الأحدث بعد
  const { data } = await supabase.from("app_settings").select("*").maybeSingle();
  return {
    company_name: (data?.company_name as string) ?? "Bridge Furniture",
    timezone: (data?.timezone as string) ?? "Asia/Hebron",
    order_prefix: (data?.order_prefix as string) ?? "BR",
    promo_url: (data?.promo_url as string | null | undefined) ?? null,
    promo_text: (data?.promo_text as string | null | undefined) ?? null,
  };
});
