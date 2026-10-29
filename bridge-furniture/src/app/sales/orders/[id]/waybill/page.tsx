import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { formatDateTime } from "@/lib/format";
import { WaybillView } from "@/components/WaybillView";

export const metadata = { title: "بوليصة" };

export default async function SalesWaybill({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("sales");
  const supabase = await createClient();
  const [loaded, settings] = await Promise.all([loadOrderDetail(supabase, id), getSettings()]);
  if (!loaded) notFound();
  if (loaded.order.status === "draft") redirect(`/sales/orders/${id}`);
  return (
    <WaybillView
      order={loaded.order}
      companyName={settings.company_name}
      backHref={`/sales/orders/${id}`}
      printedAt={formatDateTime(new Date().toISOString(), settings.timezone)}
      promo={{ url: settings.promo_url, text: settings.promo_text }}
    />
  );
}
