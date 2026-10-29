import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { signImagePaths } from "@/lib/images";
import { daysUntil } from "@/lib/format";
import { FactoryOrderDetail } from "@/components/FactoryOrderDetail";
import type { FactoryOrder } from "@/lib/types";

export const metadata = { title: "طلبية" };

export default async function FactoryOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, settings] = await Promise.all([supabase.rpc("factory_get_order", { p_order_id: id }), getSettings()]);
  const order = ((data ?? []) as FactoryOrder[])[0];
  if (!order) notFound();
  const images = await signImagePaths(supabase, order.items.map((i) => i.image_path));
  return <FactoryOrderDetail order={order} images={images} days={daysUntil(order.expected_delivery_date, settings.timezone)} />;
}
