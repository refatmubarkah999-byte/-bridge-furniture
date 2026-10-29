"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { updateSettingsAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/ui/Feedback";
import type { ActionResult } from "@/lib/types";

export function SettingsForm({
  settings,
}: {
  settings: { company_name: string; timezone: string; order_prefix: string; promo_url: string | null; promo_text: string | null };
}) {
  const [promoUrl, setPromoUrl] = useState(settings.promo_url ?? "");
  const [promoText, setPromoText] = useState(settings.promo_text ?? "");
  const validUrl = /^https?:\/\/\S+$/i.test(promoUrl.trim());
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
      <fieldset className="space-y-4 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">الدعاية على البوليصة</legend>
        <p className="text-sm text-muted">باركود مربع (QR) يُطبع على كل بوليصة، يمسحه الزبون بكاميرا الجوال فيفتح صفحتك.</p>
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-4">
            <label className="block">
              <span className="label">رابط صفحتك</span>
              <input id="promo_url" name="promo_url" value={promoUrl} onChange={(e) => setPromoUrl(e.target.value)} dir="ltr" inputMode="url" placeholder="https://instagram.com/..." className="field text-left" />
              <span className="hint">إنستغرام، فيسبوك، واتساب أو موقعك. اتركه فارغاً لإخفاء الباركود.</span>
            </label>
            <label className="block">
              <span className="label">نص بجانب الباركود <span className="font-normal text-muted">— اختياري</span></span>
              <input id="promo_text" name="promo_text" value={promoText} onChange={(e) => setPromoText(e.target.value)} maxLength={80} placeholder="تابعونا على إنستغرام" className="field" />
            </label>
          </div>
          {validUrl && (
            <div className="flex items-center gap-3 justify-self-start rounded-xl border border-line bg-white p-3 text-black">
              <QrCode value={promoUrl.trim()} size={88} />
              <div className="text-[13px] leading-snug">
                <div className="font-bold">امسح الكود</div>
                {promoText.trim() && <div>{promoText.trim()}</div>}
              </div>
            </div>
          )}
        </div>
      </fieldset>
      <button disabled={pending} className="btn-primary w-full sm:w-auto">{pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button>
    </form>
  );
}
