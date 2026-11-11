"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteExpenseAction } from "@/app/actions/finance";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import { EXPENSE_CATEGORIES, type ExpenseItem } from "@/lib/expenses";
import { formatDate, formatILS } from "@/lib/format";

export function ExpenseList({ items }: { items: ExpenseItem[] }) {
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {items.map((x) => (
        <Row key={x.id} x={x} />
      ))}
    </ul>
  );
}

function Row({ x }: { x: ExpenseItem }) {
  const c = EXPENSE_CATEGORIES.find((k) => k.key === x.category) ?? EXPENSE_CATEGORIES[3];
  const [busy, start] = useTransition();
  const { confirm, toast } = useFeedback();
  const router = useRouter();

  async function remove() {
    const { ok } = await confirm({
      title: "حذف المصروف؟",
      message: `${c.label} — ${formatILS(Number(x.amount))} بتاريخ ${formatDate(x.spent_on)}`,
      confirmLabel: "حذف",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteExpenseAction(x.id);
      if (r.ok) {
        toast("تم حذف المصروف.");
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <li className={`flex items-center gap-3 p-3.5 ${busy ? "opacity-50" : ""}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
        <Icon name={c.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{c.label}</span>
          <span className="font-bold ltr-nums">{formatILS(Number(x.amount))}</span>
        </div>
        <div className="truncate text-[13px] text-muted">
          {formatDate(x.spent_on)}
          {x.note ? ` · ${x.note}` : ""}
          {x.by ? ` · سجّله ${x.by}` : ""}
        </div>
      </div>
      <button type="button" onClick={remove} disabled={busy} className="btn-ghost btn-sm shrink-0 text-rose-700" aria-label="حذف المصروف">
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </li>
  );
}
