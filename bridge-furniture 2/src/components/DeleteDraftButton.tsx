"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftAction } from "@/app/actions/orders";

export function DeleteDraftButton({ orderId, redirectTo }: { orderId: string; redirectTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="btn-danger w-full"
        onClick={() => {
          if (!confirm("حذف هذه المسودة نهائياً؟")) return;
          start(async () => {
            const r = await deleteDraftAction(orderId);
            if (!r.ok) setError(r.error);
            else router.push(redirectTo);
          });
        }}
      >
        حذف المسودة
      </button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </>
  );
}
