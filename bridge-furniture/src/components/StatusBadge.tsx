import { t } from "@/i18n";
import type { OrderStatus } from "@/lib/types";

const styles: Record<OrderStatus, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-300",
  new: "bg-sky-50 text-sky-800 ring-sky-300",
  received: "bg-indigo-50 text-indigo-800 ring-indigo-300",
  preparing: "bg-amber-50 text-amber-800 ring-amber-300",
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  out_for_delivery: "bg-violet-50 text-violet-800 ring-violet-300",
  delivered: "bg-green-100 text-green-900 ring-green-400",
  cancelled: "bg-rose-50 text-rose-800 ring-rose-300",
};

const dots: Record<OrderStatus, string> = {
  draft: "bg-stone-400",
  new: "bg-sky-500",
  received: "bg-indigo-500",
  preparing: "bg-amber-500",
  ready: "bg-emerald-500",
  out_for_delivery: "bg-violet-500",
  delivered: "bg-green-700",
  cancelled: "bg-rose-500",
};

// اللون + الاسم مكتوباً دائماً، فلا يعتمد الفهم على اللون وحده
export function StatusBadge({ status, large = false }: { status: OrderStatus; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${styles[status]} ${
        large ? "px-3 py-1.5 text-base" : "px-2.5 py-1 text-sm"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${dots[status]}`} aria-hidden="true" />
      {t.status[status]}
    </span>
  );
}

export function DelayedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-1 text-sm font-semibold text-white">
      {t.common.delayed}
    </span>
  );
}
