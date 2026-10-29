import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView } from "@/components/OrderDetailView";
import { PaymentForm } from "@/components/PaymentForm";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";

export const metadata = { title: "تفاصيل الطلبية" };

/** صفحة الطلبية للمحاسب: كل التفاصيل والمال، بدون تغيير الحالة أو التعديل */
export default async function FinanceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("super_admin", "accountant");
  if (profile.role === "super_admin") redirect(`/admin/orders/${id}`);
  const supabase = await createClient();
  const [loaded, settings] = await Promise.all([loadOrderDetail(supabase, id), getSettings()]);
  if (!loaded) notFound();
  const { order, images } = loaded;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/finance/orders", label: "أرباح الطلبيات" }}
        title={<span className="ltr-nums">{order.order_number}</span>}
        actions={
          <Link href="/finance/payments" className="btn-secondary btn-sm">
            <Icon name="wallet" className="h-4 w-4" />
            الدفعات
          </Link>
        }
      />
      <OrderDetailView
        order={order}
        images={images}
        timeZone={settings.timezone}
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
