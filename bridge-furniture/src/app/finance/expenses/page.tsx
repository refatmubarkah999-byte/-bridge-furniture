import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { periodRange, todayInTz, formatDate, formatILS } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { FinanceNav, PeriodBar, FINANCE_PERIODS } from "@/components/finance/FinanceNav";
import { ExpenseForm } from "@/components/finance/ExpenseForm";
import { ExpenseList } from "@/components/finance/ExpenseList";
import { EXPENSE_CATEGORIES, type ExpensesSummary } from "@/lib/expenses";

export const metadata = { title: "المصاريف" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const period = sp.period ?? (sp.from || sp.to ? "custom" : "month");
  const range = periodRange(period, settings.timezone, sp.from, sp.to);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_expenses", { p_from: range.from ?? null, p_to: range.to ?? null });
  const s = data as ExpensesSummary | null;
  const periodLabel = period === "custom" ? `${formatDate(range.from)} — ${formatDate(range.to)}` : FINANCE_PERIODS.find((p) => p.key === period)?.label ?? "";

  return (
    <div className="page max-w-3xl">
      <PageHeader title="المصاريف" subtitle={s ? `${periodLabel} · المجموع ${formatILS(Number(s.total))}` : periodLabel} />
      <FinanceNav active="expenses" />

      <section className="mb-5">
        <h2 className="mb-2 text-[15px] font-bold">مصروف جديد</h2>
        <ExpenseForm today={todayInTz(settings.timezone)} />
      </section>

      <PeriodBar basePath="/finance/expenses" period={period} range={range} />

      {error || !s ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-rose-800">{friendlyError(error)}</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c.key} className="card p-3.5">
                <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.tone}`}>
                    <Icon name={c.icon} className="h-4 w-4" />
                  </span>
                  {c.label}
                </div>
                <div className="mt-2 text-xl font-bold ltr-nums">{formatILS(Number(s.by_category[c.key] ?? 0))}</div>
              </div>
            ))}
          </div>
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-canvas p-3.5 text-sm text-muted ring-1 ring-line">
            <Icon name="note" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
            المصاريف تنطرح من ربح البضاعة، وبيطلع "صافي الربح" بصفحة التقرير. بس المالك والمحاسب بشوفوها.
          </p>
          {s.items.length === 0 ? (
            <EmptyState icon="wallet" title="ما في مصاريف بهالفترة" text="سجّل أول مصروف من فوق." />
          ) : (
            <ExpenseList items={s.items} />
          )}
        </>
      )}
    </div>
  );
}
