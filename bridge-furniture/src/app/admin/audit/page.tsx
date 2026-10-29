import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { t } from "@/i18n";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/Bits";

const DETAIL_LABELS: Record<string, string> = {
  order_number: "الطلبية", from: "من", to: "إلى", amount: "المبلغ", username: "المستخدم", role: "الدور", name: "الاسم", note: "ملاحظة", method: "الطريقة", status: "الحالة",
};
const STATUS_WORD = (v: string) =>
  (t.status as Record<string, string>)[v] ??
  (t.roles as Record<string, string>)[v] ??
  (t.paymentStatus as Record<string, string>)[v] ??
  (t.paymentMethod as Record<string, string>)[v] ??
  v;

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
  payment_confirmed: "تأكيد دفعة",
  payment_rejected: "رفض دفعة",
  cost_updated: "تعديل تكلفة موديل",
  catalog_created: "إضافة كتالوج",
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
    <div className="page max-w-4xl">
      <PageHeader title={t.nav.audit} subtitle="آخر 200 عملية في النظام" back={{ href: "/admin/settings", label: t.nav.settings }} />
      {rows.length === 0 ? (
        <EmptyState icon="shield" title="لا توجد عمليات بعد" text="ستظهر هنا كل عملية مهمة مع اسم من قام بها ووقتها." />
      ) : (
        <ol className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const details = Object.entries(r.details ?? {}).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
            return (
              <li key={r.id} className="flex items-start gap-3 p-4">
                <Avatar name={r.actor?.full_name ?? "النظام"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">
                      {r.actor?.full_name ?? "النظام"} <span className="font-normal text-muted">·</span> {ACTIONS[r.action] ?? r.action}
                    </span>
                    <time className="text-[13px] text-muted">{formatDateTime(r.created_at, settings.timezone)}</time>
                  </div>
                  {details.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {details.map(([k, v]) => (
                        <span key={k} className="rounded-full bg-canvas px-2.5 py-0.5 text-xs text-muted ring-1 ring-line">
                          {DETAIL_LABELS[k] ?? k}: <span className="font-semibold text-ink">{STATUS_WORD(String(v))}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
