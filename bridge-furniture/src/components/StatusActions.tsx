"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction } from "@/app/actions/orders";
import { nextStatus, prevStatus, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

/**
 * أزرار تغيير الحالة.
 * المصنع: زر كبير واحد للخطوة التالية فقط.
 * المالك: الخطوة التالية + الرجوع خطوة + الإلغاء.
 * القاعدة تتحقق من الانتقال مرة ثانية، فالأزرار هنا للراحة فقط.
 */
export function StatusActions({
  orderId,
  orderNumber,
  status,
  mode,
  compact = false,
}: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  mode: "factory" | "admin";
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(status);
  const prev = prevStatus(status);

  function run(target: OrderStatus, message: string, askNote = false) {
    setError(null);
    let note: string | undefined;
    if (askNote) {
      const v = prompt(message + "\nسبب (اختياري):");
      if (v === null) return;
      note = v;
    } else if (!confirm(message)) {
      return;
    }
    startTransition(async () => {
      const r = await changeStatusAction(orderId, target, note);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  if (status === "draft") return null;

  return (
    <div className="space-y-2">
      {next && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(next, `${orderNumber}: ${t.nextAction[next as keyof typeof t.nextAction]}؟`)}
          className={`btn-primary w-full ${compact ? "" : "min-h-14 text-lg"}`}
        >
          {pending ? "جارٍ التحديث…" : t.nextAction[next as keyof typeof t.nextAction]}
        </button>
      )}
      {mode === "admin" && (
        <div className="flex flex-wrap gap-2">
          {prev && (
            <button type="button" disabled={pending} className="btn-secondary flex-1 text-sm"
              onClick={() => run(prev, `إرجاع ${orderNumber} إلى "${t.status[prev]}"؟`, true)}>
              رجوع إلى {t.status[prev]}
            </button>
          )}
          {status !== "delivered" && status !== "cancelled" && (
            <button type="button" disabled={pending} className="btn-danger flex-1 text-sm"
              onClick={() => run("cancelled", `إلغاء الطلبية ${orderNumber}؟ سيصل إشعار للمصنع.`, true)}>
              إلغاء الطلبية
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
