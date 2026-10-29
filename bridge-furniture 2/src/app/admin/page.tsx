import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { formatILS, periodRange } from "@/lib/format";
import { OrdersTable } from "@/components/OrdersTable";
import { ORDER_FLOW, type OrderRow, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

export const metadata = { title: "لوحة التحكم" };

type Stats = {
  total_orders: number;
  created_today: number;
  by_status: Record<Exclude<OrderStatus, "draft">, number>;
  delayed: number;
  total_sales: number;
  outstanding: number;
  unacknowledged: number;
};

const PERIODS = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "all", label: "الكل" },
];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const period = sp.period ?? (sp.from || sp.to ? "custom" : "today");
  const range = periodRange(period, settings.timezone, sp.from, sp.to);
  const supabase = await createClient();

  const [statsRes, delayedRes, newRes] = await Promise.all([
    supabase.rpc("admin_dashboard_stats", { p_from: range.from ?? null, p_to: range.to ?? null }),
    supabase.rpc("search_orders", { p_delayed_only: true, p_limit: 10 }),
    supabase.rpc("search_orders", { p_status: "new", p_limit: 10 }),
  ]);
  const s = statsRes.data as Stats | null;
  const delayed = (delayedRes.data ?? []) as OrderRow[];
  const unacknowledged = (newRes.data ?? []) as OrderRow[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.nav.dashboard}</h1>
        <Link href="/admin/orders/new" className="btn-primary">+ {t.nav.newOrder}</Link>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/admin?period=${p.key}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${period === p.key ? "bg-walnut-600 text-white" : "hover:bg-walnut-50"}`}
          >
            {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" defaultValue={period === "custom" ? range.from : undefined} className="field w-auto py-1.5 ltr-nums" aria-label="من" />
          <span className="text-muted">إلى</span>
          <input type="date" name="to" defaultValue={period === "custom" ? range.to : undefined} className="field w-auto py-1.5 ltr-nums" aria-label="إلى" />
          <button className="btn-secondary min-h-9 py-1.5 text-sm">عرض</button>
        </form>
      </div>

      {s ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="إجمالي المبيعات (الفترة)" value={formatILS(s.total_sales)} />
            <Stat label="الأرصدة المستحقة (الكل)" value={formatILS(s.outstanding)} tone={s.outstanding > 0 ? "warn" : undefined} />
            <Stat label="طلبيات الفترة" value={s.total_orders} />
            <Stat label="طلبيات اليوم" value={s.created_today} />
            <Stat label="متأخرة الآن" value={s.delayed} tone={s.delayed ? "danger" : undefined} href="/admin/orders?delayed=1" />
            <Stat label="لم يؤكد المصنع استلامها" value={s.unacknowledged} tone={s.unacknowledged ? "warn" : undefined} href="/admin/orders?status=new" />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 font-bold">حسب الحالة (طلبيات الفترة)</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[...ORDER_FLOW, "cancelled" as const].map((st) => (
                <Link key={st} href={`/admin/orders?status=${st}`} className="rounded-xl bg-canvas p-3 hover:bg-walnut-50">
                  <div className="text-xs text-muted">{t.status[st]}</div>
                  <div className="text-2xl font-bold ltr-nums">{s.by_status[st as Exclude<OrderStatus, "draft">] ?? 0}</div>
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="card p-6 text-rose-700">تعذّر تحميل الأرقام.</p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">تحتاج انتباهك: طلبيات متأخرة</h2>
        <OrdersTable rows={delayed} hrefBase="/admin/orders" />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">طلبيات جديدة لم يؤكد المصنع استلامها</h2>
        <OrdersTable rows={unacknowledged} hrefBase="/admin/orders" />
      </section>
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: React.ReactNode; tone?: "warn" | "danger"; href?: string }) {
  const color = tone === "danger" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "";
  const body = (
    <>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ltr-nums ${color}`}>{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 hover:bg-walnut-50">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
