"use client";
import { useActionState, useEffect, useRef } from "react";
import { createEmployeeAction, resetPasswordAction, updateEmployeeAction } from "@/app/actions/employees";
import { useFeedback } from "@/components/ui/Feedback";
import { t } from "@/i18n";
import type { ActionResult, AppRole } from "@/lib/types";

/** يعرض نتيجة العملية كإشعار مؤقت بعد كل إرسال */
function useResultToast(state: ActionResult, pending: boolean, success: string, onSuccess?: () => void) {
  const { toast } = useFeedback();
  const sent = useRef(false);
  useEffect(() => {
    if (!sent.current || pending) return;
    sent.current = false;
    if (state.ok) {
      toast(success);
      onSuccess?.();
    } else toast(state.error, "error");
  }, [state, pending, success, toast, onSuccess]);
  return sent;
}

function RolePicker({ name, defaultValue, disabled }: { name: string; defaultValue: AppRole; disabled?: boolean }) {
  const roles: { v: AppRole; hint: string }[] = [
    { v: "sales", hint: "يسجّل الطلبيات ويتابع حالتها" },
    { v: "factory_admin", hint: "يرى المنتجات والكميات فقط ويغيّر الحالة" },
    { v: "returns", hint: "يدخل المرتجعات ويرى مرتجعاته فقط" },
    { v: "accountant", hint: "يرى المالية ويؤكد الدفعات، بدون إدارة" },
    { v: "super_admin", hint: "صلاحيات كاملة" },
  ];
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2" disabled={disabled}>
      <legend className="label">الدور</legend>
      {roles.map((r) => (
        <label key={r.v} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface p-3 has-[:checked]:border-walnut-500 has-[:checked]:bg-walnut-50">
          <input type="radio" name={name} value={r.v} defaultChecked={defaultValue === r.v} className="mt-1 h-4 w-4 accent-walnut-600" />
          <span>
            <span className="block font-semibold">{t.roles[r.v]}</span>
            <span className="block text-[12px] text-muted">{r.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CreateEmployeeForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createEmployeeAction, { ok: true });
  const ref = useRef<HTMLFormElement>(null);
  const sent = useResultToast(state, pending, "تم إنشاء الحساب. سلّم الموظف اسم المستخدم وكلمة المرور.", () => ref.current?.reset());
  return (
    <form ref={ref} action={(fd) => { sent.current = true; action(fd); }} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
      <label className="block">
        <span className="label">الاسم الكامل *</span>
        <input name="full_name" required className="field" />
      </label>
      <label className="block">
        <span className="label">الهاتف</span>
        <input name="phone" dir="ltr" inputMode="tel" className="field text-left" />
      </label>
      <label className="block">
        <span className="label">اسم المستخدم للدخول * <span className="font-normal text-muted">— إنجليزي صغير</span></span>
        <input name="username" required dir="ltr" autoCapitalize="none" autoCorrect="off" pattern="[a-z0-9_.\-]{3,32}" placeholder="ahmad" className="field text-left" />
      </label>
      <label className="block">
        <span className="label">كلمة مرور أولية *</span>
        <input name="password" type="text" required minLength={10} dir="ltr" autoComplete="new-password" className="field text-left" />
        <span className="hint">10 أحرف على الأقل، حروف وأرقام. سلّمها للموظف شخصياً.</span>
      </label>
      <div className="sm:col-span-2"><RolePicker name="role" defaultValue="sales" /></div>
      <div className="sm:col-span-2">
        <button disabled={pending} className="btn-primary w-full sm:w-auto">{pending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}</button>
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
  const sent = useResultToast(state, pending, "تم حفظ بيانات الموظف.");
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={employee.id} />
      <label className="block">
        <span className="label">الاسم الكامل</span>
        <input name="full_name" required defaultValue={employee.full_name} className="field" />
      </label>
      <label className="block">
        <span className="label">الهاتف</span>
        <input name="phone" dir="ltr" defaultValue={employee.phone ?? ""} className="field text-left" />
      </label>
      <div className="sm:col-span-2">
        <RolePicker name="role" defaultValue={employee.role} disabled={isSelf} />
        {isSelf && <input type="hidden" name="role" value={employee.role} />}
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">صلاحيات إضافية <span className="font-normal text-muted">— لموظفي المبيعات</span></legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(t.permissions) as (keyof typeof t.permissions)[]).map((p) => (
            <label key={p} className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" name="permissions" value={p} defaultChecked={employee.permissions.includes(p)} className="h-5 w-5 accent-walnut-600" />
              {t.permissions[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2.5 text-[15px] sm:col-span-2">
        <input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={isSelf} className="h-5 w-5 accent-walnut-600" />
        الحساب مفعّل <span className="text-sm text-muted">— إزالة العلامة توقف الدخول فوراً</span>
        {isSelf && <input type="hidden" name="is_active" value="on" />}
      </label>
      <div className="sm:col-span-2">
        <button disabled={pending} className="btn-primary w-full sm:w-auto">{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(resetPasswordAction, { ok: true });
  const ref = useRef<HTMLFormElement>(null);
  const sent = useResultToast(state, pending, "تم تعيين كلمة المرور الجديدة.", () => ref.current?.reset());
  return (
    <form ref={ref} action={(fd) => { sent.current = true; action(fd); }} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <input type="hidden" name="id" value={id} />
      <label className="block min-w-48 flex-1">
        <span className="label">كلمة مرور جديدة</span>
        <input name="password" type="text" required minLength={10} dir="ltr" autoComplete="new-password" className="field text-left" />
      </label>
      <button disabled={pending} className="btn-secondary">تعيين كلمة المرور</button>
    </form>
  );
}
