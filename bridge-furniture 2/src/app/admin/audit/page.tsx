import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { t } from "@/i18n";

export const metadata = { title: "سجل التدقيق" };

const ACTIONS: Record<string, string> = {
  order_submitted: "إرسال طلبية",
  order_updated: "تعديل طلبية مُرسلة",
  status_changed: "تغيير حالة",
  payment_recorded: "تسجيل دفعة",
  employee_created: "إنشاء حساب موظف",
  employee_updated: "تعديل موظف",
  password_reset: "إعادة تعيين كلمة مرور",
  product_created: "إضافة موديل",
  product_updated: "تعديل موديل",
  settings_updated: "تعديل الإعدادات",
};

type Row = { id: number; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; actor: { full_name: string } | null };

export default async function AuditPage() {
  const settings = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, details, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">{t.nav.audit}</h1>
      <p className="text-sm text-muted">آخر 200 عملية.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-walnut-50 text-right text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">الوقت</th>
              <th className="px-4 py-3 font-medium">من</th>
              <th className="px-4 py-3 font-medium">العملية</th>
              <th className="px-4 py-3 font-medium">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(r.created_at, settings.timezone)}</td>
                <td className="px-4 py-2.5">{r.actor?.full_name ?? "النظام"}</td>
                <td className="px-4 py-2.5">{ACTIONS[r.action] ?? r.action}</td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {Object.entries(r.details ?? {})
                    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
