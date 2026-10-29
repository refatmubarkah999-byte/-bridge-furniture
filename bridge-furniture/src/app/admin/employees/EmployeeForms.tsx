"use client";
import { useActionState, useRef } from "react";
import { createEmployeeAction, resetPasswordAction, updateEmployeeAction } from "@/app/actions/employees";
import { t } from "@/i18n";
import type { ActionResult, AppRole } from "@/lib/types";

function Status({ state, pending, done }: { state: ActionResult; pending: boolean; done: boolean }) {
  if (!state.ok) return <span className="text-sm text-rose-700">{state.error}</span>;
  if (done && !pending) return <span className="text-sm text-emerald-700">تم الحفظ.</span>;
  return null;
}

export function CreateEmployeeForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createEmployeeAction, { ok: true });
  const sent = useRef(false);
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="grid gap-3 sm:grid-cols-2" autoComplete="off">
      <label className="block">
        <span className="label">الاسم الكامل *</span>
        <input name="full_name" required className="field" />
      </label>
      <label className="block">
        <span className="label">اسم المستخدم للدخول * (إنجليزي)</span>
        <input name="username" required dir="ltr" autoCapitalize="none" pattern="[a-z0-9_.\-]{3,32}" className="field text-left" />
      </label>
      <label className="block">
        <span className="label">الهاتف</span>
        <input name="phone" dir="ltr" inputMode="tel" className="field text-left" />
      </label>
      <label className="block">
        <span className="label">الدور *</span>
        <select name="role" required defaultValue="sales" className="field">
          <option value="sales">{t.roles.sales}</option>
          <option value="factory_admin">{t.roles.factory_admin}</option>
          <option value="super_admin">{t.roles.super_admin}</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">كلمة مرور أولية * (10 أحرف على الأقل، حروف وأرقام)</span>
        <input name="password" type="text" required minLength={10} dir="ltr" autoComplete="new-password" className="field text-left" />
        <span className="mt-1 block text-xs text-muted">سلّمها للموظف شخصياً، واطلب منه عدم مشاركتها.</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="btn-primary">{pending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}</button>
        <Status state={state} pending={pending} done={sent.current} />
      </div>
    </form>
  );
}

export function EditEmployeeForm({
  employee,
  isSelf,
}: {
  employee: { id: string; full_name: string; phone: string | null; role: AppRole; is_active: boolean; permissions: string[] };
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateEmployeeAction, { ok: true });
  const sent = useRef(false);
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={employee.id} />
      <label className="block">
        <span className="label">الاسم الكامل</span>
        <input name="full_name" required defaultValue={employee.full_name} className="field" />
      </label>
      <label className="block">
        <span className="label">الهاتف</span>
        <input name="phone" dir="ltr" defaultValue={employee.phone ?? ""} className="field text-left" />
      </label>
      <label className="block">
        <span className="label">الدور</span>
        <select name="role" defaultValue={employee.role} disabled={isSelf} className="field">
          <option value="sales">{t.roles.sales}</option>
          <option value="factory_admin">{t.roles.factory_admin}</option>
          <option value="super_admin">{t.roles.super_admin}</option>
        </select>
        {isSelf && <input type="hidden" name="role" value={employee.role} />}
      </label>
      <label className="flex items-center gap-2 self-end pb-3">
        <input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={isSelf} className="h-5 w-5" />
        الحساب مفعّل
        {isSelf && <input type="hidden" name="is_active" value="on" />}
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="label">صلاحيات إضافية (لموظفي المبيعات)</legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(t.permissions) as (keyof typeof t.permissions)[]).map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input type="checkbox" name="permissions" value={p} defaultChecked={employee.permissions.includes(p)} className="h-5 w-5" />
              {t.permissions[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="btn-primary">{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
        <Status state={state} pending={pending} done={sent.current} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(resetPasswordAction, { ok: true });
  const sent = useRef(false);
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <input type="hidden" name="id" value={id} />
      <label className="block flex-1">
        <span className="label">كلمة مرور جديدة</span>
        <input name="password" type="text" required minLength={10} dir="ltr" autoComplete="new-password" className="field text-left" />
      </label>
      <button disabled={pending} className="btn-secondary">تعيين كلمة المرور</button>
      <Status state={state} pending={pending} done={sent.current} />
    </form>
  );
}
