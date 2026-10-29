import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** سجل تدقيق للعمليات التي تتم خارج دوال القاعدة (إدارة الحسابات والكتالوج) */
export async function writeAudit(actorId: string, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  try {
    await createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, entity, entity_id: entityId, details });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
