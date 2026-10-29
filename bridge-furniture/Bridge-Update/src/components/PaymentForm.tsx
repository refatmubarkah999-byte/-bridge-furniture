"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { recordPaymentAction } from "@/app/actions/orders";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import { formatILS } from "@/lib/format";
import { t } from "@/i18n";
import type { ActionResult, PaymentMethod } from "@/lib/types";

const METHODS: PaymentMethod[] = ["cash", "transfer", "cheque", "card"];

/**
 * تسجيل دفعة. المالك والمحاسب: تُعتمد فوراً. موظف المبيعات: تبقى "بانتظار التأكيد".
 * `available` = المتبقي ناقص ما ينتظر التأكيد (الحد الأقصى المسموح).
 */
export function PaymentForm({ orderId, available, isFinance }: { orderId: string; available: number; isFinance: boolean }) {
  const [state, action, pending] = useActionState<ActionResult<{ status: string }>, FormData>(recordPaymentAction, { ok: true });
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    if (!sent.current || pending) return;
    sent.current = false;
    if (state.ok) {
      setAmount("");
      setMethod("cash");
      setOpen(false);
      toast(state.data?.status === "pending" ? "تم تسجيل الدفعة، وهي بانتظار تأكيد المالك." : "تم تسجيل الدفعة.");
    } else {
      toast(state.error, "error");
    }
  }, [state, pending, toast]);

  if (available <= 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn-secondary no-print mt-4 w-full" onClick={() => setOpen(true)}>
        <Icon name="plus" className="h-5 w-5" />
        {isFinance ? "تسجيل دفعة" : "استلمت دفعة من الزبون"}
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        sent.current = true;
        fd.set("method", method);
        action(fd);
      }}
      className="no-print mt-4 space-y-3 rounded-2xl bg-canvas p-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block">
        <span className="label flex items-center justify-between">
          <span>المبلغ (₪)</span>
          <button type="button" className="text-[13px] font-semibold text-walnut-700" onClick={() => setAmount(String(available))}>
            كل المتبقي <span className="ltr-nums">{formatILS(available)}</span>
          </button>
        </span>
        <input
          name="amount"
          inputMode="decimal"
          required
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          dir="ltr"
          className="field text-left ltr-nums"
        />
      </label>
      <div>
        <span className="label">طريقة الدفع</span>
        <div className="grid grid-cols-4 gap-1.5">
          {METHODS.map((m) => (
            <button key={m} type="button" aria-pressed={method === m} className="chip justify-center px-1 text-[13px]" onClick={() => setMethod(m)}>
              {t.paymentMethod[m]}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">ملاحظة <span className="font-normal text-muted">— اختياري</span></span>
        <input
          name="note"
          maxLength={300}
          placeholder={method === "cheque" ? "رقم الشيك، البنك، تاريخ الصرف" : method === "transfer" ? "اسم البنك أو رقم الحوالة" : "مثال: عند التسليم"}
          className="field"
        />
      </label>
      {!isFinance && (
        <p className="flex items-start gap-2 text-[13px] text-muted">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          الدفعة تُحسب على الزبون بعد أن يؤكد المالك استلام المبلغ.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>إلغاء</button>
        <button disabled={pending} className="btn-primary">{pending ? "جارٍ…" : "حفظ الدفعة"}</button>
      </div>
    </form>
  );
}
