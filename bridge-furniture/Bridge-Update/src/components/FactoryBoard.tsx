import Link from "next/link";
import { FactoryOrderCard } from "@/components/FactoryOrderCard";
import { EmptyState, PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { daysUntil } from "@/lib/format";
import { ORDER_FLOW, type FactoryOrder, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

const TABS: (OrderStatus | "active")[] = ["active", ...ORDER_FLOW, "cancelled"];

/** لوحة المصنع: تبويبات بعدّادات، ملخص سريع، وبطاقات الطلبيات */
export function FactoryBoard({
  orders,
  images,
  timeZone,
  status,
  q,
  from,
  to,
  error,
}: {
  orders: FactoryOrder[];
  images: Record<string, string>;
  timeZone: string;
  status: OrderStatus | "active" | "all";
  q?: string;
  from?: string;
  to?: string;
  error?: string;
}) {
  const counts: Record<string, number> = { active: 0 };
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
    if (o.status !== "delivered" && o.status !== "cancelled") counts.active++;
  }
  const delayed = orders.filter((o) => o.is_delayed).length;
  const shown =
    status === "all"
      ? orders
      : status === "active"
        ? orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled")
        : orders.filter((o) => o.status === status);

  const href = (s: string) => {
    const p = new URLSearchParams();
    if (s !== "active") p.set("status", s);
    if (q) p.set("q", q);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return qs ? `/factory?${qs}` : "/factory";
  };
  const filtered = !!(q || from || to);

  return (
    <div className="page">
      <PageHeader title={t.nav.incoming} subtitle="رقم الطلبية والموديل واللون والكمية وموعد التسليم" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href={href("new")} className="card-interactive flex items-center gap-3 p-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <Icon name="sparkle" className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-2xl font-bold leading-none tabular">{counts.new ?? 0}</span>
            <span className="text-[13px] text-muted">بانتظار تأكيد الاستلام</span>
          </span>
        </Link>
        <Link href={href("active")} className={`card-interactive flex items-center gap-3 p-3.5 ${delayed ? "border-rose-200 bg-rose-50/60" : ""}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${delayed ? "bg-rose-600 text-white" : "bg-canvas text-muted"}`}>
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-2xl font-bold leading-none tabular">{delayed}</span>
            <span className="text-[13px] text-muted">متأخرة عن موعدها</span>
          </span>
        </Link>
        <Link href={href("ready")} className="card-interactive hidden items-center gap-3 p-3.5 sm:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon name="box" className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-2xl font-bold leading-none tabular">{counts.ready ?? 0}</span>
            <span className="text-[13px] text-muted">جاهزة للتوصيل</span>
          </span>
        </Link>
      </div>

      <form className="mb-3 flex gap-2" role="search">
        {status !== "active" && <input type="hidden" name="status" value={status} />}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-faint">
            <Icon name="search" className="h-5 w-5" />
          </span>
          <input name="q" defaultValue={q} placeholder="ابحث برقم الطلبية أو الموديل" className="field pr-11" />
        </div>
        <details className="relative">
          <summary className={`btn-secondary list-none px-3.5 ${from || to ? "border-walnut-500 text-walnut-700" : ""}`} aria-label="فلترة بتاريخ التسليم">
            <Icon name="calendar" className="h-5 w-5" />
            <span className="hidden sm:inline">التاريخ</span>
          </summary>
          <div className="absolute left-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-raised)]">
            <p className="text-sm font-semibold">تاريخ التسليم</p>
            <label className="block">
              <span className="label">من</span>
              <input type="date" name="from" defaultValue={from} className="field" />
            </label>
            <label className="block">
              <span className="label">إلى</span>
              <input type="date" name="to" defaultValue={to} className="field" />
            </label>
            <button className="btn-primary w-full">تطبيق</button>
          </div>
        </details>
        <button className="btn-primary px-4">{t.common.search}</button>
      </form>

      {filtered && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Icon name="sliders" className="h-4 w-4" />
          نتائج مفلترة
          <Link href="/factory" className="font-semibold text-walnut-700 underline underline-offset-4">مسح الفلاتر</Link>
        </div>
      )}

      <nav className="scroll-row -mx-4 mb-5 overflow-x-auto px-4" aria-label="فلترة حسب الحالة">
        <ul className="flex gap-2">
          {TABS.map((s) => (
            <li key={s}>
              <Link href={href(s)} aria-current={s === status ? "page" : undefined} className="chip">
                {s === "active" ? "قيد العمل" : t.status[s]}
                <span className="chip-count">{counts[s] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? (
        <EmptyState icon="alert" title="تعذّر تحميل الطلبيات" text={error} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={status === "active" && !filtered ? "لا توجد طلبيات قيد العمل" : t.common.noResults}
          text={status === "active" && !filtered ? "الطلبيات الجديدة تظهر هنا فور إرسالها، مع إشعار." : "جرّب حالة أخرى أو امسح البحث."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => (
            <FactoryOrderCard key={o.order_id} order={o} images={images} days={daysUntil(o.expected_delivery_date, timeZone)} />
          ))}
        </div>
      )}
    </div>
  );
}
