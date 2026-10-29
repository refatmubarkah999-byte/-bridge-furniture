import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView, SubmittedBanner } from "@/components/OrderDetailView";
import { DeleteDraftButton } from "@/components/DeleteDraftButton";
import { PaymentForm } from "@/components/PaymentForm";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";

export const metadata = { title: "تفاصيل الطلبية" };

export default async function SalesOrderPage({
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
      {submitted && <SubmittedBanner number={submitted} newHref="/sales/orders/new" listHref="/sales" />}
      <PageHeader
        back={{ href: isDraft ? "/sales?tab=drafts" : "/sales", label: "طلبياتي" }}
        title={<span className="ltr-nums">{order.order_number ?? "مسودة"}</span>}
        actions={
          !isDraft && order.can_edit ? (
            <Link href={`/sales/orders/${order.id}/edit`} className="btn-secondary btn-sm">
              <Icon name="edit" className="h-4 w-4" />
              تعديل
            </Link>
          ) : undefined
        }
      />
      <OrderDetailView
        order={order}
        images={images}
        timeZone={settings.timezone}
        actions={
          isDraft ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">هذه مسودة لم تُرسل بعد، ولا يراها أحد غيرك.</p>
              <Link href={`/sales/orders/${order.id}/edit`} className="btn-primary w-full">متابعة وإرسال</Link>
              <DeleteDraftButton orderId={order.id} redirectTo="/sales?tab=drafts" />
            </div>
          ) : undefined
        }
        paymentsSlot={
          order.can_record_payment ? (
            <PaymentForm orderId={order.id} available={order.totals.remaining - order.totals.pending} isFinance={false} />
          ) : null
        }
      />
    </div>
  );
}
