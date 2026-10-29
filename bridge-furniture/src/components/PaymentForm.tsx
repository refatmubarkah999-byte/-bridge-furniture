"use client";
import { useActionState, useEffect, useRef } from "react";
import { recordPaymentAction } from "@/app/actions/orders";
import type { ActionResult } from "@/lib/types";

export function PaymentForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(recordPaymentAction, { ok: true });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !pending) ref.current?.reset();
  }, [state, pending]);

  return (
    <form ref={ref} action={action} className="no-print mt-4 space-y-2 border-t border-line pt-4">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="text-sm font-semibold">تسجيل دفعة</div>
      <div className="flex gap-2">
        <input name="amount" inputMode="decimal" required placeholder="المبلغ ₪" dir="ltr" className="field text-left ltr-nums" />
        <button disabled={pending} className="btn-primary shrink-0">حفظ</button>
      </div>
      <input name="note" maxLength={300} placeholder="ملاحظة (اختياري)" className="field" />
      {!state.ok && <p className="text-sm text-rose-700">{state.error}</p>}
    </form>
  );
}
