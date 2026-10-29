"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction } from "@/app/actions/orders";
import { nextStatus, prevStatus, type OrderStatus } from "@/lib/types";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import { STATUS_STYLE } from "@/components/StatusBadge";
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
  const { confirm, toast } = useFeedback();
  const [pending, startTransition] = useTransition();
  const next = nextStatus(status);
  const prev = prevStatus(status);

  function apply(target: OrderStatus, note?: string) {
    startTransition(async () => {
      const r = await changeStatusAction(orderId, target, note);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast(`${orderNumber}: ${t.status[target]}`);
      router.refresh();
    });
  }

  async function onNext() {
    if (!next) return;
    const label = t.nextAction[next as keyof typeof t.nextAction];
    const { ok } = await confirm({
      title: label,
      message: `ستصبح حالة الطلبية ${orderNumber} "${t.status[next]}"، وسيصل إشعار للإدارة.`,
      confirmLabel: label,
      tone: next === "delivered" ? "success" : "primary",
    });
    if (ok) apply(next);
  }

  async function onBack() {
    if (!prev) return;
    const { ok, note } = await confirm({
      title: `إرجاع إلى "${t.status[prev]}"`,
      message: "استعمل هذا لتصحيح خطأ في الحالة. سيُسجَّل التغيير في سجل الطلبية.",
      confirmLabel: "إرجاع الحالة",
      note: { label: "السبب (اختياري)", placeholder: "مثال: ضُغط الزر بالخطأ" },
    });
    if (ok) apply(prev, note);
  }

  async function onCancel() {
    const { ok, note } = await confirm({
      title: `إلغاء الطلبية ${orderNumber}؟`,
      message: "لا يمكن التراجع عن الإلغاء. سيصل إشعار للمصنع ولموظف المبيعات.",
      confirmLabel: "نعم، ألغِ الطلبية",
      cancelLabel: "لا، رجوع",
      tone: "danger",
      note: { label: "سبب الإلغاء", placeholder: "مثال: طلب الزبون", required: true },
    });
    if (ok) apply("cancelled", note);
  }

  if (status === "draft") return null;

  if (!next && mode === "factory") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-canvas py-3 text-[15px] font-semibold text-muted">
        <Icon name={status === "cancelled" ? "ban" : "checkCircle"} className="h-5 w-5" />
        {status === "cancelled" ? "الطلبية ملغية" : "اكتملت الطلبية"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {next && (
        <button
          type="button"
          disabled={pending}
          onClick={onNext}
          className={`${next === "delivered" ? "btn-success" : "btn-primary"} w-full ${compact ? "" : "btn-lg"}`}
        >
          {pending ? (
            <Icon name="refresh" className="h-5 w-5 animate-spin" />
          ) : (
            <Icon name={STATUS_STYLE[next].icon} className="h-5 w-5" strokeWidth={2.2} />
          )}
          {pending ? "جارٍ التحديث…" : t.nextAction[next as keyof typeof t.nextAction]}
        </button>
      )}
      {mode === "admin" && (prev || (status !== "delivered" && status !== "cancelled")) && (
        <div className="grid grid-cols-2 gap-2">
          {prev ? (
            <button type="button" disabled={pending} className="btn-secondary btn-sm" onClick={onBack}>
              <Icon name="undo" className="h-4 w-4" />
              رجوع خطوة
            </button>
          ) : (
            <span />
          )}
          {status !== "delivered" && status !== "cancelled" && (
            <button type="button" disabled={pending} className="btn-danger btn-sm" onClick={onCancel}>
              <Icon name="ban" className="h-4 w-4" />
              إلغاء الطلبية
            </button>
          )}
        </div>
      )}
    </div>
  );
}
