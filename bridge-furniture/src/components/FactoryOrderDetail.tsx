import Link from "next/link";
import { StatusBadge, DueChip, StatusStepper } from "@/components/StatusBadge";
import { StatusActions } from "@/components/StatusActions";
import { ZoomImage } from "@/components/ZoomImage";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { formatDate } from "@/lib/format";
import type { FactoryOrder } from "@/lib/types";
import { ColorSpec } from "@/components/ColorSpec";
import { colorText } from "@/lib/color";
import { FactoryNotes } from "@/components/FactoryNotes";

export function FactoryOrderDetail({
  order,
  images,
  days,
}: {
  order: FactoryOrder;
  images: Record<string, string>;
  days: number | null;
}) {
  const closed = order.status === "delivered" || order.status === "cancelled";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back={{ href: "/factory", label: "الطلبيات الواردة" }}
        title={<span className="ltr-nums">{order.order_number}</span>}
        actions={
          <Link href={`/factory/orders/${order.order_id}/print`} className="btn-secondary btn-sm">
            <Icon name="print" className="h-4 w-4" />
            ورقة المصنع
          </Link>
        }
      />

      <section className="card mb-4 space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium text-muted">تاريخ التسليم</div>
            <div className={`text-xl font-bold ${order.is_delayed ? "text-rose-700" : ""}`}>{formatDate(order.expected_delivery_date)}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={order.status} large />
            <DueChip days={days} done={closed} />
          </div>
        </div>
        <StatusStepper status={order.status} />
      </section>

      <section className="card mb-4 p-4 sm:p-5">
        <h2 className="section-title mb-3">المنتجات ({order.items.length})</h2>
        <ul className="space-y-3">
          {order.items.map((item) => (
            <li key={item.position} className="flex items-center gap-4 rounded-2xl border border-line p-3">
              <ZoomImage url={item.image_path ? images[item.image_path] : null} alt={item.model} caption={`${item.model} — ${colorText(item)}`} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold">{item.model}</div>
                <div className="mt-1.5"><ColorSpec item={item} size="lg" /></div>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-canvas px-4 py-2">
                <span className="text-3xl font-bold leading-none tabular">{item.quantity}</span>
                <span className="mt-1 text-xs text-muted">قطعة</span>
              </div>
            </li>
          ))}
        </ul>
        {(order.customer_notes || order.internal_notes) && (
          <div className="mt-4">
            <FactoryNotes customerNotes={order.customer_notes} internalNotes={order.internal_notes} />
          </div>
        )}
      </section>

      <div className="no-print sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-canvas/90 py-2 backdrop-blur md:bottom-4">
        <StatusActions orderId={order.order_id} orderNumber={order.order_number} status={order.status} mode="factory" />
      </div>
    </div>
  );
}
