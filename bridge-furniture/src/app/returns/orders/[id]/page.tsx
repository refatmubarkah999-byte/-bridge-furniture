import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { loadOrderDetail } from "@/lib/orders";
import { OrderDetailView, SubmittedBanner } from "@/components/OrderDetailView";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";

export const metadata = { title: "تفاصيل المرتجع" };

export default async function ReturnPage({
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
      {submitted && <SubmittedBanner number={submitted} newHref="/returns/orders/new" listHref="/returns" kind="return" />}
      <PageHeader
        back={{ href: isDraft ? "/returns?tab=drafts" : "/returns", label: "مرتجعاتي" }}
        title={<span className="ltr-nums">{order.order_number ?? "مسودة مرتجع"}</span>}
      />
      <OrderDetailView
        order={order}
        images={images}
        timeZone={settings.timezone}
        actions={
          isDraft ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">هذه مسودة لم تُرسل بعد، ولا يراها أحد غيرك.</p>
              <Link href={`/returns/orders/${order.id}/edit`} className="btn-primary w-full">متابعة وإرسال</Link>
            </div>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted">
              <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
              تم إرسال المرتجع للمالك. لا يمكن تعديل الأسعار أو حذفه بعد الإرسال؛ لأي تصحيح تواصل مع المالك.
            </p>
          )
        }
      />
    </div>
  );
}
