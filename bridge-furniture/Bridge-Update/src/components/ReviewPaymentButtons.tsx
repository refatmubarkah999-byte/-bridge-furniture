"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewPaymentAction } from "@/app/actions/finance";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import { formatILS } from "@/lib/format";

/** أزرار تأكيد/رفض دفعة بانتظار التأكيد (للمالك والمحاسب) */
export function ReviewPaymentButtons({
  paymentId,
  amount,
  recordedBy,
  compact = false,
}: {
  paymentId: string;
  amount: number;
  recordedBy: string;
  compact?: boolean;
}) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const [busy, start] = useTransition();

  async function run(approve: boolean) {
    const { ok, note } = await confirm(
      approve
        ? {
            title: `تأكيد استلام ${formatILS(amount)}`,
            message: `تأكد أن المبلغ وصلك فعلاً من ${recordedBy}. بعد التأكيد يُخصم من المتبقي على الزبون.`,
            confirmLabel: "نعم، وصلني المبلغ",
            tone: "success",
          }
        : {
            title: "رفض الدفعة؟",
            message: "الدفعة لن تُحسب، وسيصل الموظف إشعار بالسبب.",
            confirmLabel: "رفض الدفعة",
            tone: "danger",
            note: { label: "السبب", placeholder: "مثال: المبلغ لم يصل", required: true },
          }
    );
    if (!ok) return;
    start(async () => {
      const r = await reviewPaymentAction(paymentId, approve, note);
      if (r.ok) {
        toast(approve ? "تم تأكيد الدفعة." : "تم رفض الدفعة.");
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <div className={`flex gap-2 ${compact ? "" : "mt-2"}`}>
      <button type="button" disabled={busy} className="btn-success btn-sm flex-1" onClick={() => run(true)}>
        <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
        تأكيد
      </button>
      <button type="button" disabled={busy} className="btn-ghost btn-sm text-rose-700" onClick={() => run(false)}>
        <Icon name="x" className="h-4 w-4" />
        رفض
      </button>
    </div>
  );
}
