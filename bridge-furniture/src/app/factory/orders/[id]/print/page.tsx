/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImagePaths } from "@/lib/images";
import { formatDate } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { t } from "@/i18n";
import type { FactoryOrder } from "@/lib/types";
import { colorText } from "@/lib/color";

export const metadata = { title: "ورقة المصنع" };

/** ورقة المصنع: رقم الطلبية، الموديل، الصورة، اللون، الكمية، تاريخ التسليم، الحالة — لا شيء غيرها */
export default async function FactoryPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("factory_get_order", { p_order_id: id });
  const order = ((data ?? []) as FactoryOrder[])[0];
  if (!order) notFound();
  const images = await signImagePaths(supabase, order.items.map((i) => i.image_path));

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 print:p-0">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="طباعة ورقة المصنع" />
      </div>
      <header className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
        <div>
          <div className="text-sm text-muted">{t.appName} — ورقة المصنع</div>
          <h1 className="text-4xl font-bold ltr-nums">{order.order_number}</h1>
        </div>
        <div className="text-left">
          <div className="text-sm text-muted">{t.common.deliveryDate}</div>
          <div className="text-xl font-bold">{formatDate(order.expected_delivery_date)}</div>
          <div className="mt-1 text-sm">الحالة: <b>{t.status[order.status]}</b></div>
        </div>
      </header>
      <table className="w-full border-collapse text-lg">
        <thead>
          <tr className="border-b border-ink text-right">
            <th className="py-2">الصورة</th>
            <th className="py-2">{t.common.model}</th>
            <th className="py-2">{t.common.color}</th>
            <th className="py-2 text-center">{t.common.quantity}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.position} className="border-b border-line align-middle">
              <td className="py-3">
                {item.image_path && images[item.image_path] ? (
                  <img src={images[item.image_path]} alt={item.model} className="h-24 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="h-24 w-24 rounded-lg border border-dashed border-line" />
                )}
              </td>
              <td className="py-3 text-xl font-bold">{item.model}</td>
              <td className="py-3">{colorText(item)}</td>
              <td className="py-3 text-center text-3xl font-bold ltr-nums">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(order.customer_notes || order.internal_notes) && (
        <div className="mt-5 space-y-1 border-t border-ink pt-3 text-base">
          {order.customer_notes && <p><b>ملاحظات الزبون:</b> {order.customer_notes}</p>}
          {order.internal_notes && <p><b>ملاحظات داخلية:</b> {order.internal_notes}</p>}
        </div>
      )}
    </div>
  );
}
