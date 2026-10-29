import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signImagePaths } from "@/lib/images";
import type { OrderDetail } from "@/lib/types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadOrderDetail(supabase: SupabaseClient, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.rpc("get_order_detail", { p_order_id: id });
  if (error || !data) return null;
  const order = data as OrderDetail;
  order.totals = {
    subtotal: Number(order.totals.subtotal),
    delivery_fee: Number(order.totals.delivery_fee),
    total: Number(order.totals.total),
    paid: Number(order.totals.paid),
    remaining: Number(order.totals.remaining),
  };
  order.deposit = Number(order.deposit);
  const images = await signImagePaths(supabase, order.items.map((i) => i.image_path));
  return { order, images };
}
