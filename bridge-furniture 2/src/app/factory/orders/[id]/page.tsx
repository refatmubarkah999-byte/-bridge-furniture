import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImagePaths } from "@/lib/images";
import { formatDate } from "@/lib/format";
import { StatusBadge, DelayedBadge } from "@/components/StatusBadge";
import { StatusActions } from "@/components/StatusActions";
import { ProductThumb } from "@/components/ProductThumb";
import type { FactoryOrder } from "@/lib/types";

export const metadata = { title: "طلبية" };

export default async function FactoryOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("factory_get_order", { p_order_id: id });
  const order = ((data ?? []) as FactoryOrder[])[0];
  if (!order) notFound();
  const images = await signImagePaths(supabase, order.items.map((i) => i.image_path));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/factory" className="mb-4 inline-block text-muted hover:text-ink">→ الطلبيات الواردة</Link>
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold ltr-nums">{order.order_number}</h1>
          <StatusBadge status={order.status} large />
        </div>
        <div className={`mb-5 flex items-center gap-2 text-lg ${order.is_delayed ? "font-semibold text-rose-700" : ""}`}>
          تاريخ التسليم: {formatDate(order.expected_delivery_date)}
          {order.is_delayed && <DelayedBadge />}
        </div>
        <ul className="mb-6 space-y-3">
          {order.items.map((item) => (
            <li key={item.position} className="flex items-center gap-4 rounded-2xl border border-line p-3">
              <ProductThumb url={item.image_path ? images[item.image_path] : null} alt={item.model} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold">{item.model}</div>
                <div className="text-lg text-muted">{item.color}</div>
              </div>
              <div className="text-3xl font-bold ltr-nums">×{item.quantity}</div>
            </li>
          ))}
        </ul>
        <StatusActions orderId={order.order_id} orderNumber={order.order_number} status={order.status} mode="factory" />
        <Link href={`/factory/orders/${order.order_id}/print`} className="btn-secondary mt-3 w-full">
          طباعة ورقة المصنع
        </Link>
      </div>
    </div>
  );
}
