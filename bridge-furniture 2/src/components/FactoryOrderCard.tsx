import Link from "next/link";
import { StatusBadge, DelayedBadge } from "@/components/StatusBadge";
import { StatusActions } from "@/components/StatusActions";
import { ProductThumb } from "@/components/ProductThumb";
import { formatDate } from "@/lib/format";
import type { FactoryOrder } from "@/lib/types";

/** بطاقة طلبية المصنع: الحقول السبعة المسموحة فقط */
export function FactoryOrderCard({ order, images }: { order: FactoryOrder; images: Record<string, string> }) {
  return (
    <article className={`card flex flex-col p-4 ${order.is_delayed ? "border-rose-300" : ""}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <Link href={`/factory/orders/${order.order_id}`} className="text-2xl font-bold ltr-nums hover:underline">
          {order.order_number}
        </Link>
        <StatusBadge status={order.status} />
      </header>
      <div className={`mb-3 flex items-center gap-2 text-base ${order.is_delayed ? "font-semibold text-rose-700" : "text-muted"}`}>
        <span>التسليم:</span>
        <span>{formatDate(order.expected_delivery_date)}</span>
        {order.is_delayed && <DelayedBadge />}
      </div>
      <ul className="mb-4 space-y-2">
        {order.items.map((item) => (
          <li key={item.position} className="flex items-center gap-3 rounded-xl bg-canvas p-2">
            <ProductThumb url={item.image_path ? images[item.image_path] : null} alt={item.model} />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{item.model}</div>
              <div className="text-muted">{item.color}</div>
            </div>
            <div className="text-2xl font-bold ltr-nums">×{item.quantity}</div>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <StatusActions orderId={order.order_id} orderNumber={order.order_number} status={order.status} mode="factory" compact />
      </div>
    </article>
  );
}
