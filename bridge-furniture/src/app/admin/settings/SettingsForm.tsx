"use client";
import { useActionState, useEffect, useRef } from "react";
import { updateSettingsAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/ui/Feedback";
import type { ActionResult } from "@/lib/types";

export function SettingsForm({ settings }: { settings: { company_name: string; timezone: string; order_prefix: string } }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateSettingsAction, { ok: true });
  const { toast } = useFeedback();
  const sent = useRef(false);
  useEffect(() => {
    if (!sent.current || pending) return;
    sent.current = false;
    if (state.ok) toast("تم حفظ الإعدادات.");
    else toast(state.error, "error");
  }, [state, pending, toast]);
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="space-y-5">
      <label className="block">
        <span className="label">اسم الشركة</span>
        <input name="company_name" defaultValue={settings.company_name} className="field" />
        <span className="hint">يظهر في أعلى أوراق الطباعة.</span>
      </label>
      <label className="block">
        <span className="label">المنطقة الزمنية</span>
        <select name="timezone" defaultValue={settings.timezone} className="field">
          <option value="Asia/Hebron">توقيت فلسطين (Asia/Hebron)</option>
          <option value="Asia/Gaza">توقيت غزة (Asia/Gaza)</option>
          <option value="Asia/Jerusalem">توقيت القدس (Asia/Jerusalem)</option>
        </select>
        <span className="hint">كل التواريخ والأوقات وحساب التأخير تتبع هذا التوقيت.</span>
      </label>
      <label className="block">
        <span className="label">بادئة رقم الطلبية</span>
        <input name="order_prefix" defaultValue={settings.order_prefix} dir="ltr" maxLength={5} className="field w-32 text-left" />
        <span className="hint">مثال: BR تعطي أرقاماً مثل BR-1052. التغيير يؤثر على الطلبيات الجديدة فقط.</span>
      </label>
      <button disabled={pending} className="btn-primary w-full sm:w-auto">{pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button>
    </form>
  );
}
