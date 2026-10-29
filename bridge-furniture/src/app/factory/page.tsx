import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { signImagePaths } from "@/lib/images";
import { isIsoDate } from "@/lib/format";
import { FactoryBoard } from "@/components/FactoryBoard";
import { friendlyError } from "@/lib/errors";
import { ORDER_FLOW, type FactoryOrder, type OrderStatus } from "@/lib/types";

export const metadata = { title: "الطلبيات الواردة" };

const VALID: string[] = [...ORDER_FLOW, "cancelled", "all"];

export default async function FactoryHome({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const status = (VALID.includes(sp.status ?? "") ? sp.status : "active") as OrderStatus | "active" | "all";
  const supabase = await createClient();
  const settings = await getSettings();

  // البيانات تأتي من بوابة المصنع فقط — لا استعلام مباشر على أي جدول.
  // نجلب كل الحالات مرة واحدة لحساب عدّادات التبويبات، ثم نفلتر للعرض.
  const { data, error } = await supabase.rpc("factory_list_orders", {
    p_status: null,
    p_from: isIsoDate(sp.from) ? sp.from : null,
    p_to: isIsoDate(sp.to) ? sp.to : null,
    p_query: sp.q?.slice(0, 50) || null,
    p_limit: 200,
    p_offset: 0,
  });
  const orders = (data ?? []) as FactoryOrder[];
  const images = await signImagePaths(supabase, orders.flatMap((o) => o.items.map((i) => i.image_path)));

  return (
    <FactoryBoard
      orders={orders}
      images={images}
      timeZone={settings.timezone}
      status={status}
      q={sp.q}
      from={sp.from}
      to={sp.to}
      error={error ? friendlyError(error) : undefined}
    />
  );
}
