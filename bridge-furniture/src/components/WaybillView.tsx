"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Barcode } from "@/components/Barcode";
import { QrCode } from "@/components/QrCode";
import { formatDate, formatILS, modelsLabel, piecesLabel } from "@/lib/format";
import { colorText } from "@/lib/color";
import type { OrderDetail } from "@/lib/types";

type Size = "label" | "a4";

/**
 * بوليصة التوصيل: بيانات الزبون والمبلغ المطلوب تحصيله.
 * للمالك وموظف المبيعات فقط (الصفحة موجودة تحت /admin و/sales، والقاعدة تتحقق من حق رؤية الطلبية).
 */
export function WaybillView({
  order,
  companyName,
  backHref,
  printedAt,
  promo,
}: {
  order: OrderDetail;
  companyName: string;
  backHref: string;
  printedAt: string;
  promo?: { url: string | null; text: string | null };
}) {
  const [showQr, setShowQr] = useState(!!promo?.url);
  const due = Math.max(0, Math.round((order.totals.remaining - order.totals.pending) * 100) / 100);
  const [size, setSize] = useState<Size>("a4");
  const [amount, setAmount] = useState(String(due));
  const [showNotes, setShowNotes] = useState(!!order.customer_notes);
  const value = Math.max(0, Number(amount.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, "")) || 0);
  const copies = size === "a4" ? ["نسخة المندوب", "نسخة الزبون"] : [null];

  return (
    <div className="page max-w-3xl">
      <style>{`
        @page { size: ${size === "label" ? "100mm 150mm" : "A4"}; margin: ${size === "label" ? "3mm" : "10mm"}; }
        @media print {
          html, body { background: #fff !important; }
          :root { padding: 0 !important; }
          main, .page { padding: 0 !important; margin: 0 !important; max-width: none !important; min-height: 0 !important; }
          .waybill-sheet { margin: 0; }
        }
      `}</style>

      <div className="no-print mb-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
            <Icon name="chevronRight" className="h-4 w-4" />
            الطلبية
          </Link>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            <Icon name="print" className="h-5 w-5" />
            طباعة البوليصة
          </button>
        </div>
        <div className="card grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <span className="label">حجم الورق</span>
            <div className="flex gap-2">
              <button type="button" className="chip flex-1 justify-center" aria-pressed={size === "a4"} onClick={() => setSize("a4")}>A4 (نسختين)</button>
              <button type="button" className="chip flex-1 justify-center" aria-pressed={size === "label"} onClick={() => setSize("label")}>ملصق 10×15</button>
            </div>
          </div>
          <label className="block">
            <span className="label">المبلغ المطلوب من الزبون (₪)</span>
            <input id="waybill-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" className="field text-left ltr-nums" />
            <span className="hint">
              المتبقي {formatILS(order.totals.remaining)}
              {order.totals.pending > 0 ? ` — منه ${formatILS(order.totals.pending)} بانتظار التأكيد` : ""}
            </span>
          </label>
          <label className="flex items-center gap-2.5 self-center text-[15px]">
            <input id="waybill-notes" type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="h-5 w-5 accent-walnut-600" disabled={!order.customer_notes} />
            إظهار ملاحظات الزبون
          </label>
          {promo?.url && (
            <label className="flex items-center gap-2.5 self-center text-[15px] sm:col-start-3">
              <input id="waybill-qr" type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} className="h-5 w-5 accent-walnut-600" />
              باركود الدعاية (QR)
            </label>
          )}
        </div>
      </div>

      <div className="waybill-sheet" dir="rtl">
        {copies.map((copy, i) => (
          <Fragment key={i}>
            {i > 0 && <div className="my-[2mm] border-t-2 border-dashed border-stone-400 text-center text-[10px] text-stone-500">✂ قص هنا</div>}
            <div className={size === "a4" ? "h-[128mm] overflow-hidden" : "h-[144mm] overflow-hidden"}>
              <Slip order={order} companyName={companyName} amount={value} showNotes={showNotes} copy={copy} printedAt={printedAt} compact={size === "label"} promo={showQr && promo?.url ? { url: promo.url, text: promo.text } : null} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Slip({
  order,
  companyName,
  amount,
  showNotes,
  copy,
  printedAt,
  compact,
  promo,
}: {
  order: OrderDetail;
  companyName: string;
  amount: number;
  showNotes: boolean;
  copy: string | null;
  printedAt: string;
  compact: boolean;
  promo: { url: string; text: string | null } | null;
}) {
  const pieces = order.items.reduce((s, x) => s + x.quantity, 0);
  const isReturn = order.kind === "return";
  return (
    <article className={`flex h-full flex-col rounded-lg border-2 border-black bg-white text-black ${compact ? "p-3 text-[12px]" : "p-4 text-[13px]"}`}>
      <header className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <div className="text-[15px] font-bold">{companyName}</div>
          <div className="font-semibold">{isReturn ? "بوليصة استلام مرتجع" : "بوليصة توصيل"}{copy ? ` — ${copy}` : ""}</div>
        </div>
        <div className="flex flex-col items-end text-left" dir="ltr">
          {order.order_number && <Barcode value={order.order_number} height={compact ? 38 : 44} />}
          <div className="mt-0.5 text-[11px]" dir="rtl">طُبعت {printedAt}</div>
        </div>
      </header>

      <section className="mt-2 space-y-1 border-b border-black pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide">المستلم</div>
        <div className={`font-bold ${compact ? "text-[17px]" : "text-[20px]"}`}>{order.customer.full_name}</div>
        <div className={`font-bold ltr-nums ${compact ? "text-[16px]" : "text-[18px]"}`} dir="ltr" style={{ textAlign: "right" }}>
          {order.customer.phone}
          {order.customer.phone2 ? `  /  ${order.customer.phone2}` : ""}
        </div>
        <div className={compact ? "text-[14px]" : "text-[16px]"}>
          <b>{order.customer.city}</b> — {order.customer.address}
        </div>
      </section>

      <section className="mt-2 flex items-stretch gap-3 border-b border-black pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold">المحتوى — {modelsLabel(order.items.length)} · {piecesLabel(pieces)}</div>
          <ul className="mt-0.5 space-y-0.5">
            {order.items.slice(0, compact ? 4 : 6).map((x) => (
              <li key={x.id} className="truncate">
                <b>{x.model}</b> × <span className="ltr-nums">{x.quantity}</span> <span className="text-[11px]">— {colorText(x)}</span>
              </li>
            ))}
            {order.items.length > (compact ? 4 : 6) && <li className="text-[11px]">+ {order.items.length - (compact ? 4 : 6)} منتجات أخرى</li>}
          </ul>
        </div>
        <div className="shrink-0 border-r border-black pr-3 text-[12px]">
          <div>موعد التسليم</div>
          <div className="font-bold">{formatDate(order.expected_delivery_date)}</div>
        </div>
      </section>

      <div className={`mt-2 flex gap-3 ${compact ? "flex-col" : "items-stretch"}`}>
        <section className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border-2 border-black ${compact ? "p-2" : "p-3"}`}>
        <span className="font-bold">{amount > 0 ? "المبلغ المطلوب تحصيله" : "لا يوجد مبلغ للتحصيل"}</span>
        <span className={`font-black ltr-nums ${compact ? "text-[22px]" : "text-[28px]"}`} dir="ltr">
          {amount > 0 ? formatILS(amount) : "مدفوعة ✓"}
        </span>
      </section>
        {promo && (
          <div className="flex shrink-0 items-center gap-2">
            <QrCode value={promo.url} size={compact ? 70 : 76} />
            <div className="max-w-[34mm] leading-snug">
              <div className={`font-black ${compact ? "text-[14px]" : "text-[15px]"}`}>امسح الكود</div>
              {promo.text && <div className="text-[12px] font-semibold">{promo.text}</div>}
              <div className="truncate text-[9px]" dir="ltr" style={{ textAlign: "right" }}>{promo.url.replace(/^https?:\/\//, "")}</div>
            </div>
          </div>
        )}
      </div>

      {showNotes && order.customer_notes && (
        <p className="mt-2 text-[12px]"><b>ملاحظات:</b> {order.customer_notes}</p>
      )}


      <footer className="mt-auto grid grid-cols-2 gap-4 pt-3 text-[12px]">
        <div className="border-t border-black pt-1">توقيع المستلم</div>
        <div className="border-t border-black pt-1">التاريخ</div>
      </footer>
    </article>
  );
}
