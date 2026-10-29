import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * عميل بصلاحيات كاملة (service_role) — للخادم فقط.
 * يُستخدم حصراً لإدارة حسابات الدخول (إنشاء، تعطيل، تغيير كلمة المرور)
 * وبعد التحقق من أن المستدعي هو المالك.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
