import { StatusBadge, DueChip, StatusStepper } from "@/components/StatusBadge";
import { ZoomImage } from "@/components/ZoomImage";
import { Icon } from "@/components/Icon";
import { SectionCard } from "@/components/ui/Bits";
import { daysUntil, formatDate, formatDateTime, formatILS, modelsLabel, piecesLabel } from "@/lib/format";
import { t } from "@/i18n";
import { PaymentStatusBadge } from "@/components/PaymentBits";
import { ReviewPaymentButtons } from "@/components/ReviewPaymentButtons";
import { ReturnBadge } from "@/components/ReturnBadge";
import type { OrderDetail } from "@/lib/types";
import { ColorSpec } from "@/components/ColorSpec";
import { colorText } from "@/lib/color";

/** تفاصيل الطلبية الكاملة — للمالك ولموظف المبيعات صاحبها فقط (البيانات من get_order_detail) */
export function OrderDetailView({
  order,
  images,
  timeZone,
  actions,
  paymentsSlot,
  canReview = false,
}: {
  order: OrderDetail;
  images: Record<string, string>;
  timeZone: string;
  actions?: React.ReactNode;
  paymentsSlot?: React.ReactNode;
  /** المالك والمحاسب: أزرار تأكيد/رفض الدفعات المعلّقة */
  canReview?: boolean;
}) {
  const closed = ["draft", "delivered", "cancelled"].includes(order.status);
  const days = daysUntil(order.expected_delivery_date, timeZone);
  const pieces = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
      <div className="min-w-0 space-y-4">
        <section className="card space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-muted">{order.kind === "return" ? "الموعد المتوقع" : "موعد التسليم"}</div>
              <div className={`text-xl font-bold ${order.is_delayed ? "text-rose-700" : ""}`}>{formatDate(order.expected_delivery_date)}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {order.kind === "return" && <ReturnBadge />}
              <StatusBadge status={order.status} large />
              <DueChip days={days} done={closed} />
            </div>
          </div>
          <StatusStepper status={order.status} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[14px] sm:grid-cols-4">
            <Meta k={order.kind === "return" ? "موظف المرتجعات" : "موظف المبيعات"} v={order.created_by.full_name} />
            <Meta k="أُرسلت" v={formatDateTime(order.submitted_at, timeZone)} />
            <Meta k={order.kind === "return" ? "استُلم" : "استلمها المصنع"} v={formatDateTime(order.acknowledged_at, timeZone)} />
            <Meta k="أُنشئت" v={formatDateTime(order.created_at, timeZone)} />
          </dl>
        </section>

        <SectionCard title="الزبون" icon="user">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-bold">{order.customer.full_name || "—"}</div>
              <div className="mt-1 flex items-start gap-1.5 text-[15px] text-ink/80">
                <Icon name="mapPin" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span>
                  {order.customer.city && <b className="font-semibold">{order.customer.city}</b>}
                  {order.customer.address && <> — {order.customer.address}</>}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[order.customer.phone, order.customer.phone2].filter(Boolean).map((p) => (
                <a key={p} href={`tel:${p}`} className="btn-secondary btn-sm">
                  <Icon name="phone" className="h-4 w-4" />
                  <span className="ltr-nums">{p}</span>
                </a>
              ))}
            </div>
          </div>
          {(order.customer_notes || order.internal_notes) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {order.customer_notes && <Note title="ملاحظات الزبون" text={order.customer_notes} />}
              {order.internal_notes && <Note title="ملاحظات داخلية" text={order.internal_notes} />}
            </div>
          )}
        </SectionCard>

        <SectionCard title="المنتجات" icon="box" actions={<span className="text-sm text-muted">{modelsLabel(order.items.length)} · {piecesLabel(pieces)}</span>}>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <ZoomImage url={item.image_path ? images[item.image_path] : null} alt={item.model} caption={`${item.model} — ${colorText(item)}`} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <div className="text-lg font-bold">{item.model}</div>
                    <div className="font-bold ltr-nums">{formatILS(item.line_total)}</div>
                  </div>
                  <div className="mt-1"><ColorSpec item={item} /></div>
                  <div className="mt-0.5 text-sm text-muted ltr-nums">{item.quantity} × {formatILS(item.unit_price)}</div>
                  {item.notes && (
                    <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-[13px]">
                      <Icon name="note" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                      {item.notes}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {order.items.length === 0 && <li className="text-muted">لا منتجات.</li>}
          </ul>
        </SectionCard>

        <SectionCard title="سجل الحالات" icon="clock">
          {order.history.length === 0 ? (
            <p className="text-sm text-muted">لم تُرسل بعد.</p>
          ) : (
            <ol className="relative space-y-4 pr-5 before:absolute before:inset-y-1 before:right-[5px] before:w-0.5 before:bg-line">
              {[...order.history].reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -right-5 top-1.5 h-3 w-3 rounded-full ring-4 ring-surface ${i === 0 ? "bg-walnut-600" : "bg-line-strong"}`} />
                  <div className="text-[15px]">
                    <b>{t.status[h.to]}</b>
                    {h.from && <span className="text-muted"> — من {t.status[h.from]}</span>}
                  </div>
                  <div className="text-[13px] text-muted">
                    {formatDateTime(h.changed_at, timeZone)} · {h.changed_by}
                  </div>
                  {h.note && <div className="mt-1 text-[13px] text-ink/80">“{h.note}”</div>}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {actions && <section className="card no-print p-4 sm:p-5">{actions}</section>}
        {order.kind === "return" ? (
          <SectionCard title="قيمة المرتجع" icon="wallet">
            <dl className="space-y-2.5 text-[15px]">
              <Money k="مجموع المنتجات" v={order.totals.subtotal} />
              <Money k="رسوم" v={order.totals.delivery_fee} />
              <div className="border-t border-line pt-2.5"><Money k="القيمة الكلية" v={order.totals.total} strong /></div>
            </dl>
            <p className="mt-3 text-[12px] text-muted">المرتجعات لا تُحسب ضمن المبيعات ولا يُسجَّل عليها متبقٍ على الزبون.</p>
          </SectionCard>
        ) : (
        <SectionCard title="الحساب" icon="wallet">
            <dl className="space-y-2.5 text-[15px]">
              <Money k="مجموع المنتجات" v={order.totals.subtotal} />
              <Money k="رسوم التوصيل" v={order.totals.delivery_fee} />
              <div className="border-t border-line pt-2.5"><Money k="المجموع الكلي" v={order.totals.total} strong /></div>
              <Money k="المدفوع (مؤكد)" v={order.totals.paid} />
              {order.totals.pending > 0 && (
                <div className="flex items-center justify-between text-amber-800">
                  <dt className="flex items-center gap-1.5"><Icon name="clock" className="h-4 w-4" />بانتظار التأكيد</dt>
                  <dd className="font-semibold ltr-nums">{formatILS(order.totals.pending)}</dd>
                </div>
              )}
            </dl>
            <div className={`mt-3 flex items-center justify-between rounded-xl px-3.5 py-3 ${order.totals.remaining > 0 ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
              <span className="font-semibold">{order.totals.remaining > 0 ? "المتبقي على الزبون" : "مدفوعة بالكامل"}</span>
              <span className="text-lg font-bold ltr-nums">{formatILS(order.totals.remaining)}</span>
            </div>
            {order.payments.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className={p.status === "pending" ? "rounded-xl bg-amber-50/70 p-2.5 ring-1 ring-amber-200" : ""}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <b className="font-semibold">{p.kind === "deposit" ? "عربون" : "دفعة"}</b>
                          <span className="text-[12px] text-muted">{t.paymentMethod[p.method] ?? ""}</span>
                          {p.status !== "confirmed" && <PaymentStatusBadge status={p.status} />}
                        </span>
                        <span className="block text-[12px] text-muted">
                          {formatDateTime(p.paid_at, timeZone)} · {p.recorded_by}
                          {p.note ? ` · ${p.note}` : ""}
                        </span>
                        {p.status === "rejected" && p.review_note && (
                          <span className="block text-[12px] text-rose-700">السبب: {p.review_note}</span>
                        )}
                      </span>
                      <span className={`shrink-0 font-semibold ltr-nums ${p.status === "rejected" ? "text-muted line-through" : ""}`}>{formatILS(p.amount)}</span>
                    </div>
                    {canReview && p.status === "pending" && order.status !== "draft" && (
                      <ReviewPaymentButtons paymentId={p.id} amount={p.amount} recordedBy={p.recorded_by} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {paymentsSlot}
          </SectionCard>
        )}
        {order.finance && <ProfitCard order={order} />}
      </aside>
    </div>
  );
}

/** التكلفة والربح — يظهر للمالك والمحاسب فقط (القاعدة لا ترسله لغيرهما أصلاً) */
function ProfitCard({ order }: { order: OrderDetail }) {
  const f = order.finance!;
  const margin = order.totals.total > 0 ? Math.round((f.profit / order.totals.total) * 100) : 0;
  return (
    <SectionCard title="الربح" icon="chart">
      <dl className="space-y-2.5 text-[15px]">
        <Money k="المجموع" v={order.totals.total} />
        <Money k="تكلفة المنتجات" v={f.cost} />
      </dl>
      <div className={`mt-3 flex items-center justify-between rounded-xl px-3.5 py-3 ${f.profit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
        <span className="font-semibold">الربح <span className="text-sm font-normal">({margin}%)</span></span>
        <span className="text-lg font-bold ltr-nums">{formatILS(f.profit)}</span>
      </div>
      {f.items_missing_cost > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-amber-800">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {f.items_missing_cost === 1 ? "منتج واحد" : `${f.items_missing_cost} منتجات`} بدون تكلفة مسجّلة، فالربح أعلى من الحقيقي. أضف التكلفة من صفحة «التكاليف».
        </p>
      )}
    </SectionCard>
  );
}

export function SubmittedBanner({
  number,
  newHref,
  listHref,
  kind = "regular",
}: {
  number: string;
  newHref: string;
  listHref: string;
  kind?: "regular" | "return";
}) {
  const R = kind === "return";
  return (
    <section className="no-print mb-5 flex flex-col items-center gap-3 rounded-3xl bg-emerald-700 p-6 text-center text-white sm:flex-row sm:text-right">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <Icon name="checkCircle" className="h-8 w-8" />
      </span>
      <div className="flex-1">
        <div className="text-sm text-emerald-100">{R ? "تم الإرسال بنجاح ووصل إشعار للمالك" : "تم الإرسال بنجاح ووصل إشعار للمصنع"}</div>
        <div className="text-2xl font-bold">{R ? "المرتجع" : "الطلبية"} <span className="ltr-nums">{number}</span></div>
      </div>
      <div className="flex gap-2">
        <a href={newHref} className="btn bg-white text-emerald-800 hover:bg-emerald-50">
          <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
          {R ? "مرتجع جديد" : "طلبية جديدة"}
        </a>
        <a href={listHref} className="btn border border-white/30 text-white hover:bg-white/10">القائمة</a>
      </div>
    </section>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="text-[14px] font-semibold leading-snug">{v}</dd>
    </div>
  );
}

function Money({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-lg font-bold" : ""}`}>
      <dt className={strong ? "" : "text-ink/75"}>{k}</dt>
      <dd className="ltr-nums">{formatILS(v)}</dd>
    </div>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-walnut-50 p-3 text-sm">
      <div className="mb-1 font-semibold">{title}</div>
      <p className="whitespace-pre-line text-ink/85">{text}</p>
    </div>
  );
}
