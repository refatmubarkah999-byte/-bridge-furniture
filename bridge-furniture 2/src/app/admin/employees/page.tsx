import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { CreateEmployeeForm, EditEmployeeForm, ResetPasswordForm } from "./EmployeeForms";
import { t } from "@/i18n";
import type { AppRole } from "@/lib/types";

export const metadata = { title: "الموظفون" };

type Row = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  last_seen_at: string | null;
  user_permissions: { permission: string }[];
};

export default async function EmployeesPage() {
  const me = await requireRole("super_admin");
  const settings = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, phone, role, is_active, last_seen_at, user_permissions!user_permissions_user_id_fkey(permission)")
    .order("is_active", { ascending: false })
    .order("full_name");
  const rows = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">{t.nav.employees}</h1>
      <p className="text-sm text-muted">
        لكل موظف حساب خاص به. لا تشارك الحسابات. كلمات المرور يحفظها نظام الدخول مشفّرة ولا يراها أحد، ولا حتى المالك.
      </p>

      <details className="card p-4">
        <summary className="cursor-pointer text-lg font-bold">+ إضافة موظف</summary>
        <div className="mt-4"><CreateEmployeeForm /></div>
      </details>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={`card p-4 ${r.is_active ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">{r.full_name} {r.id === me.id && <span className="text-sm text-muted">(أنت)</span>}</div>
                <div className="text-sm text-muted">
                  <span className="ltr-nums">{r.username}</span> · {t.roles[r.role]}
                  {!r.is_active && <span className="mr-2 rounded-full bg-rose-100 px-2 text-rose-700">موقوف</span>}
                </div>
              </div>
              <div className="text-xs text-muted">آخر نشاط: {formatDateTime(r.last_seen_at, settings.timezone)}</div>
            </div>
            {r.role === "sales" && r.user_permissions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.user_permissions.map((p) => (
                  <span key={p.permission} className="rounded-full bg-walnut-50 px-2 py-0.5 text-xs ring-1 ring-line">
                    {t.permissions[p.permission as keyof typeof t.permissions]}
                  </span>
                ))}
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-walnut-700">تعديل</summary>
              <div className="mt-3 space-y-4">
                <EditEmployeeForm
                  employee={{ ...r, permissions: r.user_permissions.map((p) => p.permission) }}
                  isSelf={r.id === me.id}
                />
                <ResetPasswordForm id={r.id} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
