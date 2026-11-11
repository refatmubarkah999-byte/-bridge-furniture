"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpenseAction } from "@/app/actions/finance";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { formatILS } from "@/lib/format";

/** إضافة مصروف: النوع، المبلغ، التاريخ، ملاحظة */
export function ExpenseForm({ today }: { today: string }) {
  const [category, setCategory] = useState<ExpenseCategory>("ads");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();
  const n = Number(amount.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]/g, ""));
  const valid = amount.trim() !== "" && Number.isFinite(n) && n > 0;
  const cat = EXPENSE_CATEGORIES.find((c) => c.key === category)!;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return toast("اكتب المبلغ.", "error");
    start(async () => {
      const r = await addExpenseAction({ spent_on: date, category, amount, note });
      if (r.ok) {
        toast(`تم تسجيل ${cat.label}: ${formatILS(n)}`);
        setAmount("");
        setNote("");
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-4">
      <div>
        <span className="label">نوع المصروف</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-right text-[14px] font-semibold aria-pressed:border-walnut-500 aria-pressed:bg-walnut-50"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.tone}`}>
                <Icon name={c.icon} className="h-4 w-4" />
              </span>
              {c.label}
            </button>
          ))}
        </div>
        <span className="hint">{cat.hint}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <label className="block">
          <span className="label">المبلغ (₪) *</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0" className="field text-left ltr-nums" />
        </label>
        <label className="block">
          <span className="label">التاريخ</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="field" />
        </label>
        <label className="block">
          <span className="label">ملاحظة</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={category === "salaries" ? "اسم الموظف / شهر…" : "مثلاً: حملة فيسبوك للكنب"} className="field" />
        </label>
      </div>
      <button disabled={busy || !valid} className="btn-primary w-full sm:w-auto">
        <Icon name="plus" className="h-5 w-5" />
        {busy ? "جارٍ الحفظ…" : "تسجيل المصروف"}
      </button>
    </form>
  );
}
