/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { formatDate, formatDateTime, formatILS } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { t } from "@/i18n";

export const metadata = { title: "طباعة الطلبية" };

/** ورقة الطلبية الكاملة للمالك (يمكن حفظها PDF من نافذة الطباعة) */
export default async function AdminPrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [loaded, settings] = await Promise.all([loadOrderDetail(supabase, id), getSettings()]);
  if (!loaded) notFound();
  const { order, images } = loaded;

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm print:p-0">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="طباعة / حفظ PDF" />
      </div>
      <header className="mb-5 flex items-end justify-between border-b-2 border-ink pb-3">
        <div>
          <div className="text-muted">{settings.company_name}</div>
          <h1 className="text-3xl font-bold ltr-nums">{order.order_number}</h1>
        </div>
        <div className="text-left">
          <div>الحالة: <b>{t.status[order.status]}</b></div>
          <div>أُرسلت: {formatDateTime(order.submitted_at, settings.timezone)}</div>
          <div>التسليم: <b>{formatDate(order.expected_delivery_date)}</b></div>
        </div>
      </header>
      <section className="mb-5 grid grid-cols-2 gap-2">
        <div><span className="text-muted">الزبون: </span><b>{order.customer.full_name}</b></div>
        <div><span className="text-muted">الهاتف: </span><span className="ltr-nums">{order.customer.phone}{order.customer.phone2 ? ` / ${order.customer.phone2}` : ""}</span></div>
        <div><span className="text-muted">المدينة: </span>{order.customer.city}</div>
        <div><span className="text-muted">الموظف: </span>{order.created_by.full_name}</div>
        <div className="col-span-2"><span className="text-muted">العنوان: </span>{order.customer.address}</div>
      </section>
      <table className="mb-5 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-right">
            <th className="py-2">الصورة</th><th>الموديل</th><th>اللون</th><th className="text-center">الكمية</th><th>السعر</th><th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b border-line align-middle">
              <td className="py-2">{i.image_path && images[i.image_path] ? <img src={images[i.image_path]} alt={i.model} className="h-14 w-14 rounded object-cover" /> : null}</td>
              <td className="font-semibold">{i.model}{i.notes ? <div className="text-xs font-normal text-muted">{i.notes}</div> : null}</td>
              <td>{i.color}</td>
              <td className="text-center ltr-nums">{i.quantity}</td>
              <td className="ltr-nums">{formatILS(i.unit_price)}</td>
              <td className="ltr-nums">{formatILS(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mr-auto w-64 space-y-1">
        <Line k="مجموع المنتجات" v={order.totals.subtotal} />
        <Line k="رسوم التوصيل" v={order.totals.delivery_fee} />
        <Line k="المجموع الكلي" v={order.totals.total} bold />
        <Line k="المدفوع" v={order.totals.paid} />
        <Line k="المتبقي" v={order.totals.remaining} bold />
      </div>
      {(order.customer_notes || order.internal_notes) && (
        <div className="mt-5 space-y-1 border-t border-line pt-3">
          {order.customer_notes && <p><b>ملاحظات الزبون:</b> {order.customer_notes}</p>}
          {order.internal_notes && <p><b>ملاحظات داخلية:</b> {order.internal_notes}</p>}
        </div>
      )}
    </div>
  );
}

function Line({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{k}</span><span className="ltr-nums">{formatILS(v)}</span>
    </div>
  );
}
