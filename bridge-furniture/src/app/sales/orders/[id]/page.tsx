import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView } from "@/components/OrderDetailView";
import { DeleteDraftButton } from "@/components/DeleteDraftButton";
import { StatusBadge } from "@/components/StatusBadge";

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
    <div className="mx-auto max-w-6xl">
      <Link href="/sales" className="mb-4 inline-block text-muted hover:text-ink">→ طلبياتي</Link>
      {submitted && (
        <p className="mb-4 rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">
          تم إرسال الطلبية <span className="ltr-nums">{submitted}</span> بنجاح. ستتابع حالتها هنا.
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
              <Link href={`/sales/orders/${order.id}/edit`} className="btn-primary w-full">متابعة وإرسال</Link>
              <DeleteDraftButton orderId={order.id} redirectTo="/sales?tab=drafts" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted">الحالة الحالية</div>
              <StatusBadge status={order.status} large />
              {order.can_edit && (
                <Link href={`/sales/orders/${order.id}/edit`} className="btn-secondary w-full">تعديل الطلبية</Link>
              )}
            </div>
          )
        }
      />
    </div>
  );
}
