import Link from "next/link";
import { StatusBadge, DueChip, StatusStepper } from "@/components/StatusBadge";
import { StatusActions } from "@/components/StatusActions";
import { ZoomImage } from "@/components/ZoomImage";
import { Icon } from "@/components/Icon";
import { formatDate, modelsLabel, piecesLabel } from "@/lib/format";
import type { FactoryOrder } from "@/lib/types";
import { ColorSpec } from "@/components/ColorSpec";
import { colorText } from "@/lib/color";
import { FactoryNotes } from "@/components/FactoryNotes";

/** بطاقة طلبية المصنع: الحقول السبعة المسموحة فقط */
export function FactoryOrderCard({
  order,
  images,
  days,
}: {
  order: FactoryOrder;
  images: Record<string, string>;
  days: number | null;
}) {
  const closed = order.status === "delivered" || order.status === "cancelled";
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <article
      className={`card flex flex-col overflow-hidden ${
        order.status === "new" ? "ring-2 ring-sky-300" : order.is_delayed ? "ring-2 ring-rose-300" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <Link href={`/factory/orders/${order.order_id}`} className="text-[22px] font-bold leading-none ltr-nums hover:text-walnut-700">
            {order.order_number}
          </Link>
          <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] ${order.is_delayed ? "font-semibold text-rose-700" : "text-muted"}`}>
            <Icon name="calendar" className="h-4 w-4" />
            {formatDate(order.expected_delivery_date)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={order.status} />
          <DueChip days={days} done={closed} />
        </div>
      </header>

      <div className="px-4">
        <StatusStepper status={order.status} compact />
      </div>

      <ul className="space-y-2 p-4">
        {order.items.map((item) => (
          <li key={item.position} className="flex items-center gap-3 rounded-2xl bg-canvas p-2.5">
            <ZoomImage
              url={item.image_path ? images[item.image_path] : null}
              alt={item.model}
              caption={`${item.model} — ${colorText(item)}`}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">{item.model}</div>
              <div className="mt-1"><ColorSpec item={item} /></div>
            </div>
            <div className="flex flex-col items-center rounded-xl bg-surface px-3 py-1.5 ring-1 ring-line">
              <span className="text-2xl font-bold leading-none tabular">{item.quantity}</span>
              <span className="mt-0.5 text-[11px] text-muted">قطعة</span>
            </div>
          </li>
        ))}
      </ul>

      {(order.customer_notes || order.internal_notes) && (
        <div className="px-4 pb-3">
          <FactoryNotes customerNotes={order.customer_notes} internalNotes={order.internal_notes} compact />
        </div>
      )}

      <footer className="mt-auto space-y-2 border-t border-line p-4">
        {order.items.length > 1 && (
          <div className="text-center text-[13px] text-muted">
            {modelsLabel(order.items.length)} · {piecesLabel(totalQty)}
          </div>
        )}
        <StatusActions orderId={order.order_id} orderNumber={order.order_number} status={order.status} mode="factory" compact />
      </footer>
    </article>
  );
}
