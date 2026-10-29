"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftAction } from "@/app/actions/orders";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";

export function DeleteDraftButton({ orderId, redirectTo }: { orderId: string; redirectTo: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-danger w-full"
      onClick={async () => {
        const { ok } = await confirm({
          title: "حذف المسودة؟",
          message: "ستُحذف المسودة وبيانات الزبون فيها نهائياً.",
          confirmLabel: "حذف",
          tone: "danger",
        });
        if (!ok) return;
        start(async () => {
          const r = await deleteDraftAction(orderId);
          if (!r.ok) return toast(r.error, "error");
          toast("تم حذف المسودة.");
          router.push(redirectTo);
        });
      }}
    >
      <Icon name="trash" className="h-5 w-5" />
      حذف المسودة
    </button>
  );
}
