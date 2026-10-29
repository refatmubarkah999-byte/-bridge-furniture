import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { SalesHomeView } from "@/components/SalesHomeView";
import type { OrderRow } from "@/lib/types";

export const metadata = { title: "طلبياتي" };

export default async function SalesHome({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "drafts" ? "drafts" : "sent";
  const q = sp.q?.slice(0, 80) || null;
  const [profile, settings, supabase] = await Promise.all([requireRole("sales"), getSettings(), createClient()]);
  const [sentRes, draftsRes] = await Promise.all([
    supabase.rpc("search_orders", { p_query: q, p_status: null, p_limit: 100 }),
    supabase.rpc("search_orders", { p_query: q, p_status: "draft", p_limit: 100 }),
  ]);
  return (
    <SalesHomeView
      name={profile.full_name}
      tab={tab}
      q={sp.q}
      sent={(sentRes.data ?? []) as OrderRow[]}
      drafts={(draftsRes.data ?? []) as OrderRow[]}
      timeZone={settings.timezone}
    />
  );
}
