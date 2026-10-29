"use client";
import { useActionState, useRef } from "react";
import { updateSettingsAction } from "@/app/actions/settings";
import type { ActionResult } from "@/lib/types";

export function SettingsForm({ settings }: { settings: { company_name: string; timezone: string; order_prefix: string } }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateSettingsAction, { ok: true });
  const sent = useRef(false);
  return (
    <form action={(fd) => { sent.current = true; action(fd); }} className="space-y-4">
      <label className="block">
        <span className="label">اسم الشركة</span>
        <input name="company_name" defaultValue={settings.company_name} className="field" />
      </label>
      <label className="block">
        <span className="label">المنطقة الزمنية</span>
        <select name="timezone" defaultValue={settings.timezone} className="field">
          <option value="Asia/Hebron">توقيت فلسطين (Asia/Hebron)</option>
          <option value="Asia/Gaza">توقيت غزة (Asia/Gaza)</option>
          <option value="Asia/Jerusalem">توقيت القدس (Asia/Jerusalem)</option>
        </select>
        <span className="mt-1 block text-xs text-muted">كل التواريخ والأوقات وحساب التأخير تتبع هذا التوقيت.</span>
      </label>
      <label className="block">
        <span className="label">بادئة رقم الطلبية</span>
        <input name="order_prefix" defaultValue={settings.order_prefix} dir="ltr" maxLength={5} className="field w-32 text-left" />
        <span className="mt-1 block text-xs text-muted">مثال: BR تعطي أرقاماً مثل BR-1052. التغيير يؤثر على الطلبيات الجديدة فقط.</span>
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">حفظ</button>
        {!state.ok && <span className="text-sm text-rose-700">{state.error}</span>}
        {state.ok && sent.current && !pending && <span className="text-sm text-emerald-700">تم الحفظ.</span>}
      </div>
    </form>
  );
}
