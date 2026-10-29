import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signImagePaths } from "@/lib/images";
import { isIsoDate } from "@/lib/format";
import { FactoryOrderCard } from "@/components/FactoryOrderCard";
import { friendlyError } from "@/lib/errors";
import { ORDER_FLOW, type FactoryOrder, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

export const metadata = { title: "الطلبيات الواردة" };

const TABS: (OrderStatus | "all")[] = ["all", ...ORDER_FLOW, "cancelled"];

export default async function FactoryHome({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.includes(sp.status as OrderStatus) && sp.status !== "all" ? (sp.status as OrderStatus) : null;
  const supabase = await createClient();

  // البيانات تأتي من بوابة المصنع فقط — لا استعلام مباشر على أي جدول
  const { data, error } = await supabase.rpc("factory_list_orders", {
    p_status: status,
    p_from: isIsoDate(sp.from) ? sp.from : null,
    p_to: isIsoDate(sp.to) ? sp.to : null,
    p_query: sp.q?.slice(0, 50) || null,
    p_limit: 100,
    p_offset: 0,
  });
  const orders = (data ?? []) as FactoryOrder[];
  const images = await signImagePaths(supabase, orders.flatMap((o) => o.items.map((i) => i.image_path)));

  const tabHref = (s: string) => {
    const params = new URLSearchParams();
    if (s !== "all") params.set("status", s);
    if (sp.q) params.set("q", sp.q);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    const qs = params.toString();
    return qs ? `/factory?${qs}` : "/factory";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-2xl font-bold">{t.nav.incoming}</h1>

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="رقم الطلبية أو اسم الموديل" className="field" />
        <label className="flex items-center gap-2 text-sm text-muted">
          من
          <input type="date" name="from" defaultValue={sp.from} className="field ltr-nums" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          إلى
          <input type="date" name="to" defaultValue={sp.to} className="field ltr-nums" />
        </label>
        <button className="btn-primary">{t.common.search}</button>
      </form>

      <nav className="-mx-4 mb-5 overflow-x-auto px-4" aria-label="فلترة حسب الحالة">
        <ul className="flex gap-2">
          {TABS.map((s) => {
            const active = (s === "all" && !status) || s === status;
            return (
              <li key={s}>
                <Link
                  href={tabHref(s)}
                  className={`block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ring-1 ${
                    active ? "bg-walnut-600 text-white ring-walnut-600" : "bg-white text-ink ring-line hover:bg-walnut-50"
                  }`}
                >
                  {s === "all" ? t.common.all : t.status[s]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {error ? (
        <p className="card p-6 text-rose-700">{friendlyError(error)}</p>
      ) : orders.length === 0 ? (
        <p className="card p-10 text-center text-muted">{t.common.noResults}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <FactoryOrderCard key={o.order_id} order={o} images={images} />
          ))}
        </div>
      )}
    </div>
  );
}
