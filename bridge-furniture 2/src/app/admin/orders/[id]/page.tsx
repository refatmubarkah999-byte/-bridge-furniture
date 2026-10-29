import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView } from "@/components/OrderDetailView";
import { StatusActions } from "@/components/StatusActions";
import { PaymentForm } from "@/components/PaymentForm";
import { DeleteDraftButton } from "@/components/DeleteDraftButton";

export const metadata = { title: "تفاصيل الطلبية" };

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const [{ id }, { submitted }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [loaded, settings] = await Promise.all([loadOrderDetail(supabase, id), getSettings()]);
  if (!loaded) notFound();
  const { order, images } = loaded;
  const isDraft = order.status === "draft";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/orders" className="text-muted hover:text-ink">→ الطلبيات</Link>
        <div className="flex gap-2">
          {order.can_edit && <Link href={`/admin/orders/${order.id}/edit`} className="btn-secondary">تعديل</Link>}
          {!isDraft && <Link href={`/admin/orders/${order.id}/print`} className="btn-secondary">طباعة</Link>}
        </div>
      </div>
      {submitted && (
        <p className="mb-4 rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">
          تم إرسال الطلبية <span className="ltr-nums">{submitted}</span> بنجاح، ووصل إشعار للمصنع.
        </p>
      )}
      <OrderDetailView
        order={order}
        images={images}
        timeZone={settings.timezone}
        actions={
          isDraft ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">هذه مسودة لم تُرسل بعد.</p>
              <Link href={`/admin/orders/${order.id}/edit`} className="btn-primary w-full">متابعة وإرسال</Link>
              <DeleteDraftButton orderId={order.id} redirectTo="/admin/orders?status=draft" />
            </div>
          ) : (
            <>
              <h2 className="mb-3 font-bold">تغيير الحالة</h2>
              <StatusActions orderId={order.id} orderNumber={order.order_number ?? ""} status={order.status} mode="admin" />
            </>
          )
        }
        paymentsSlot={!isDraft && order.status !== "cancelled" ? <PaymentForm orderId={order.id} /> : null}
      />
    </div>
  );
}
