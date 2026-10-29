import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView, SubmittedBanner } from "@/components/OrderDetailView";
import { StatusActions } from "@/components/StatusActions";
import { PaymentForm } from "@/components/PaymentForm";
import { DeleteDraftButton } from "@/components/DeleteDraftButton";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";

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
    <div className="page">
      {submitted && <SubmittedBanner number={submitted} newHref="/admin/orders/new" listHref="/admin/orders" />}
      <PageHeader
        back={{ href: "/admin/orders", label: "الطلبيات" }}
        title={<span className="ltr-nums">{order.order_number ?? "مسودة"}</span>}
        actions={
          <>
            {order.can_edit && (
              <Link href={`/admin/orders/${order.id}/edit`} className="btn-secondary btn-sm">
                <Icon name="edit" className="h-4 w-4" />
                تعديل
              </Link>
            )}
            {!isDraft && order.status !== "cancelled" && (
              <Link href={`/admin/orders/${order.id}/waybill`} className="btn-secondary btn-sm">
                <Icon name="truck" className="h-4 w-4" />
                بوليصة
              </Link>
            )}
            {!isDraft && (
              <Link href={`/admin/orders/${order.id}/print`} className="btn-secondary btn-sm">
                <Icon name="print" className="h-4 w-4" />
                طباعة
              </Link>
            )}
          </>
        }
      />
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
        canReview
        paymentsSlot={
          order.can_record_payment ? (
            <PaymentForm orderId={order.id} available={order.totals.remaining - order.totals.pending} isFinance />
          ) : null
        }
      />
    </div>
  );
}
