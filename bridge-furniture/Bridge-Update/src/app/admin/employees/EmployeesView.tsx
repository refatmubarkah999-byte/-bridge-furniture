import { Avatar, PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { formatDateTime } from "@/lib/format";
import { CreateEmployeeForm, EditEmployeeForm, ResetPasswordForm } from "./EmployeeForms";
import { t } from "@/i18n";
import type { AppRole } from "@/lib/types";

export type EmployeeRow = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  last_seen_at: string | null;
  user_permissions: { permission: string }[];
};

const ROLE_STYLE: Record<AppRole, string> = {
  super_admin: "bg-walnut-600 text-white",
  factory_admin: "bg-amber-100 text-amber-900",
  sales: "bg-sky-50 text-sky-800",
  accountant: "bg-emerald-50 text-emerald-800",
  returns: "bg-violet-50 text-violet-800",
};

export function EmployeesView({ rows, meId, timeZone }: { rows: EmployeeRow[]; meId: string; timeZone: string }) {
  const groups: { role: AppRole; title: string }[] = [
    { role: "sales", title: "موظفو المبيعات" },
    { role: "factory_admin", title: "إدارة المصنع" },
    { role: "returns", title: "المرتجعات" },
    { role: "accountant", title: "المحاسبة" },
    { role: "super_admin", title: "المالك والإدارة" },
  ];
  return (
    <div className="page max-w-5xl">
      <PageHeader title={t.nav.employees} subtitle={`${rows.filter((r) => r.is_active).length} حساب فعّال`} />

      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-canvas p-3.5 text-sm text-muted ring-1 ring-line">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
        لكل موظف حساب خاص به، ولا تُشارك الحسابات. كلمات المرور محفوظة مشفّرة ولا يراها أحد، ولا حتى المالك.
      </p>

      <details className="card mb-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-bold hover:bg-walnut-50">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-walnut-600 text-white">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
          </span>
          إضافة موظف
        </summary>
        <div className="border-t border-line p-4"><CreateEmployeeForm /></div>
      </details>

      <div className="space-y-6">
        {groups.map((g) => {
          const list = rows.filter((r) => r.role === g.role);
          if (!list.length) return null;
          return (
            <section key={g.role}>
              <h2 className="mb-2 px-1 text-sm font-bold text-muted">{g.title} ({list.length})</h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.map((r) => (
                  <li key={r.id} className={r.is_active ? "" : "bg-canvas/60"}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-walnut-50/60">
                        <Avatar name={r.full_name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-bold ${r.is_active ? "" : "text-muted line-through"}`}>{r.full_name}</span>
                            {r.id === meId && <span className="text-xs text-muted">(أنت)</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_STYLE[r.role]}`}>{t.roles[r.role]}</span>
                            {!r.is_active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">موقوف</span>}
                          </div>
                          <div className="mt-0.5 text-[13px] text-muted">
                            <span className="ltr-nums">@{r.username}</span>
                            {" · "}آخر نشاط: {r.last_seen_at ? formatDateTime(r.last_seen_at, timeZone) : "لم يدخل بعد"}
                          </div>
                          {r.role === "sales" && r.user_permissions.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.user_permissions.map((p) => (
                                <span key={p.permission} className="rounded-full bg-walnut-50 px-2 py-0.5 text-[11px] font-semibold text-walnut-700 ring-1 ring-walnut-200">
                                  {t.permissions[p.permission as keyof typeof t.permissions]}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Icon name="chevronDown" className="h-5 w-5 text-muted transition group-open:rotate-180" />
                      </summary>
                      <div className="space-y-4 border-t border-line bg-canvas/50 p-4">
                        <EditEmployeeForm employee={{ ...r, permissions: r.user_permissions.map((p) => p.permission) }} isSelf={r.id === meId} />
                        <ResetPasswordForm id={r.id} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
