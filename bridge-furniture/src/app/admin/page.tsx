import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { periodRange } from "@/lib/format";
import { DashboardView, type DashboardStats } from "@/components/DashboardView";
import type { OrderRow } from "@/lib/types";

export const metadata = { title: "لوحة التحكم" };

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const [settings, profile] = await Promise.all([getSettings(), requireRole("super_admin")]);
  const period = sp.period ?? (sp.from || sp.to ? "custom" : "today");
  const range = periodRange(period, settings.timezone, sp.from, sp.to);
  const supabase = await createClient();

  const [statsRes, delayedRes, newRes, recentRes, pendingRes] = await Promise.all([
    supabase.rpc("admin_dashboard_stats", { p_from: range.from ?? null, p_to: range.to ?? null }),
    supabase.rpc("search_orders", { p_delayed_only: true, p_limit: 5, p_kind: "regular" }),
    supabase.rpc("search_orders", { p_status: "new", p_limit: 5, p_kind: "regular" }),
    supabase.rpc("search_orders", { p_limit: 8 }),
    supabase.rpc("finance_payments", { p_status: "pending", p_limit: 300 }),
  ]);
  const pendingRows = (pendingRes.data ?? []) as { amount: number }[];

  return (
    <DashboardView
      name={profile.full_name}
      stats={statsRes.data as DashboardStats | null}
      delayed={(delayedRes.data ?? []) as OrderRow[]}
      unacknowledged={(newRes.data ?? []) as OrderRow[]}
      recent={(recentRes.data ?? []) as OrderRow[]}
      period={period}
      range={range}
      timeZone={settings.timezone}
      pendingPayments={{ count: pendingRows.length, amount: pendingRows.reduce((s, r) => s + Number(r.amount), 0) }}
    />
  );
}
