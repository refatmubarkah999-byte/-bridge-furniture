import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { periodRange } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { FinanceOverview, type FinanceSummary } from "@/components/finance/FinanceOverview";

export const metadata = { title: "المالية" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const period = sp.period ?? (sp.from || sp.to ? "custom" : "month");
  const range = periodRange(period, settings.timezone, sp.from, sp.to);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_summary", { p_from: range.from ?? null, p_to: range.to ?? null });
  if (error || !data) {
    return (
      <div className="page">
        <p className="rounded-2xl bg-rose-50 p-4 text-rose-800">{friendlyError(error)}</p>
      </div>
    );
  }
  return <FinanceOverview s={data as FinanceSummary} period={period} range={range} />;
}
