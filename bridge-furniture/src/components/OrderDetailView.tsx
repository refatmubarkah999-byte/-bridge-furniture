import { StatusBadge, DelayedBadge } from "@/components/StatusBadge";
import { ProductThumb } from "@/components/ProductThumb";
import { formatDate, formatDateTime, formatILS } from "@/lib/format";
import { t } from "@/i18n";
import type { OrderDetail } from "@/lib/types";

/** تفاصيل الطلبية الكاملة — للمالك ولموظف المبيعات صاحبها فقط (البيانات من get_order_detail) */
export function OrderDetailView({
  order,
  images,
  timeZone,
  actions,
  paymentsSlot,
}: {
  order: OrderDetail;
  images: Record<string, string>;
  timeZone: string;
  actions?: React.ReactNode;
  paymentsSlot?: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold ltr-nums">{order.order_number ?? t.status.draft}</h1>
            <StatusBadge status={order.status} />
            {order.is_delayed && <DelayedBadge />}
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k={t.common.deliveryDate} v={formatDate(order.expected_delivery_date)} />
            <Row k="موظف المبيعات" v={order.created_by.full_name} />
            <Row k="أُنشئت" v={formatDateTime(order.created_at, timeZone)} />
            <Row k="أُرسلت" v={formatDateTime(order.submitted_at, timeZone)} />
            <Row k="استلمها المصنع" v={formatDateTime(order.acknowledged_at, timeZone)} />
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">الزبون</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="الاسم" v={order.customer.full_name || "—"} />
            <Row k="المدينة" v={order.customer.city || "—"} />
            <Row k="الهاتف" v={order.customer.phone ? <a className="ltr-nums underline" href={`tel:${order.customer.phone}`}>{order.customer.phone}</a> : "—"} />
            <Row k="هاتف إضافي" v={order.customer.phone2 ? <a className="ltr-nums underline" href={`tel:${order.customer.phone2}`}>{order.customer.phone2}</a> : "—"} />
            <div className="sm:col-span-2"><Row k="العنوان" v={order.customer.address || "—"} /></div>
          </dl>
          {(order.customer_notes || order.internal_notes) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {order.customer_notes && <Note title="ملاحظات الزبون" text={order.customer_notes} />}
              {order.internal_notes && <Note title="ملاحظات داخلية" text={order.internal_notes} />}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">المنتجات</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-2xl border border-line p-3">
                <ProductThumb url={item.image_path ? images[item.image_path] : null} alt={item.model} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-lg font-semibold">{item.model} <span className="text-muted">— {item.color}</span></div>
                    <div className="font-bold ltr-nums">{formatILS(item.line_total)}</div>
                  </div>
                  <div className="text-sm text-muted ltr-nums">{item.quantity} × {formatILS(item.unit_price)}</div>
                  {item.notes && <div className="mt-1 text-sm">ملاحظة: {item.notes}</div>}
                </div>
              </li>
            ))}
            {order.items.length === 0 && <li className="text-muted">لا منتجات.</li>}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">سجل الحالات</h2>
          {order.history.length === 0 ? (
            <p className="text-sm text-muted">لم تُرسل بعد.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {order.history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{formatDateTime(h.changed_at, timeZone)}</span>
                  <span>{h.from ? `${t.status[h.from]} ← ` : ""}<b>{t.status[h.to]}</b></span>
                  <span className="text-muted">— {h.changed_by}</span>
                  {h.note && <span className="text-muted">({h.note})</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        {actions && <section className="card no-print p-5">{actions}</section>}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">الحساب</h2>
          <dl className="space-y-2 text-sm">
            <Money k="مجموع المنتجات" v={order.totals.subtotal} />
            <Money k="رسوم التوصيل" v={order.totals.delivery_fee} />
            <Money k="المجموع الكلي" v={order.totals.total} strong />
            <Money k="المدفوع" v={order.totals.paid} />
            <Money k="المتبقي" v={order.totals.remaining} strong danger={order.totals.remaining > 0} />
          </dl>
          {order.payments.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {p.kind === "deposit" ? "عربون" : "دفعة"} — {formatDateTime(p.paid_at, timeZone)}
                    {p.note ? ` — ${p.note}` : ""}
                  </span>
                  <span className="ltr-nums">{formatILS(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {paymentsSlot}
        </section>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{k}:</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Money({ k, v, strong, danger }: { k: string; v: number; strong?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-bold" : ""} ${danger ? "text-rose-700" : ""}`}>
      <dt>{k}</dt>
      <dd className="ltr-nums">{formatILS(v)}</dd>
    </div>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-walnut-50 p-3 text-sm">
      <div className="mb-1 font-semibold">{title}</div>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
