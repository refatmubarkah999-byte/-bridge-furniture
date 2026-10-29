import Link from "next/link";
import { OrdersTable } from "@/components/OrdersTable";
import { PageHeader } from "@/components/ui/Bits";
import { Icon, type IconName } from "@/components/Icon";
import { STATUS_STYLE } from "@/components/StatusBadge";
import { formatDate, formatILS } from "@/lib/format";
import { ORDER_FLOW, type OrderRow, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

export type DashboardStats = {
  total_orders: number;
  created_today: number;
  by_status: Record<Exclude<OrderStatus, "draft">, number>;
  delayed: number;
  total_sales: number;
  outstanding: number;
  unacknowledged: number;
  returns?: { count: number; total: number; open: number };
};

const PERIODS = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "all", label: "الكل" },
];

export function DashboardView({
  name,
  stats,
  delayed,
  unacknowledged,
  recent,
  period,
  range,
  timeZone,
  pendingPayments,
}: {
  pendingPayments?: { count: number; amount: number };
  name: string;
  stats: DashboardStats | null;
  delayed: OrderRow[];
  unacknowledged: OrderRow[];
  recent: OrderRow[];
  period: string;
  range: { from?: string; to?: string };
  timeZone: string;
}) {
  const periodLabel =
    period === "custom" ? `${formatDate(range.from)} — ${formatDate(range.to)}` : PERIODS.find((p) => p.key === period)?.label ?? "";
  const first = name.trim().split(/\s+/)[0];
  const pipelineTotal = stats ? ORDER_FLOW.reduce((s, k) => s + (stats.by_status[k as Exclude<OrderStatus, "draft">] ?? 0), 0) : 0;
  const attention = (stats?.delayed ?? 0) + (stats?.unacknowledged ?? 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`مرحباً ${first}`}
        subtitle={attention ? `عندك ${attention} طلبية تحتاج انتباهك` : "كل الطلبيات تسير حسب الخطة"}
        actions={
          <Link href="/admin/orders/new" className="btn-primary hidden md:inline-flex">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
            {t.nav.newOrder}
          </Link>
        }
      />

      {pendingPayments && pendingPayments.count > 0 && (
        <Link href="/finance/payments" className="card-interactive flex items-center gap-3 border-amber-300 bg-amber-50 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <Icon name="wallet" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-amber-950">
              {pendingPayments.count === 1 ? "دفعة واحدة" : `${pendingPayments.count} دفعات`} من الموظفين بانتظار تأكيدك
            </span>
            <span className="block text-sm text-amber-900">
              المجموع <span className="ltr-nums font-semibold">{formatILS(pendingPayments.amount)}</span>
            </span>
          </span>
          <Icon name="chevronLeft" className="h-5 w-5 text-amber-800" />
        </Link>
      )}

      {/* الفترة */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="الفترة">
          {PERIODS.map((p) => (
            <Link key={p.key} href={`/admin?period=${p.key}`} aria-current={period === p.key ? "page" : undefined} className="chip">
              {p.label}
            </Link>
          ))}
        </nav>
        <details className="relative">
          <summary className="chip list-none" aria-current={period === "custom" ? "page" : undefined}>
            <Icon name="calendar" className="h-4 w-4" />
            {period === "custom" ? periodLabel : "فترة محددة"}
          </summary>
          <form className="absolute z-20 mt-2 w-72 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-raised)] ltr:left-0 rtl:right-0">
            <input type="hidden" name="period" value="custom" />
            <label className="block"><span className="label">من</span><input type="date" name="from" defaultValue={period === "custom" ? range.from : undefined} className="field" /></label>
            <label className="block"><span className="label">إلى</span><input type="date" name="to" defaultValue={period === "custom" ? range.to : undefined} className="field" /></label>
            <button className="btn-primary w-full">عرض</button>
          </form>
        </details>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon="chart" tone="walnut" label={`المبيعات · ${periodLabel}`} value={formatILS(stats.total_sales)} money />
            <Kpi icon="list" tone="walnut" label={`الطلبيات · ${periodLabel}`} value={stats.total_orders} sub={`${stats.created_today} اليوم`} />
            <Kpi icon="wallet" tone={stats.outstanding > 0 ? "amber" : "walnut"} label="أرصدة مستحقة" value={formatILS(stats.outstanding)} money sub="على كل الطلبيات المفتوحة" />
            <Kpi
              icon="alert"
              tone={stats.delayed ? "rose" : "walnut"}
              label="متأخرة الآن"
              value={stats.delayed}
              sub={stats.unacknowledged ? `${stats.unacknowledged} لم يؤكدها المصنع` : "المصنع أكّد كل الطلبيات"}
              href="/admin/orders?delayed=1"
            />
          </div>

          {stats.returns && (stats.returns.count > 0 || stats.returns.open > 0) && (
            <Link href="/admin/orders?kind=return" className="card-interactive flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
                <Icon name="undo" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">المرتجعات · {periodLabel}</span>
                <span className="block text-sm text-muted">
                  {stats.returns.count} مرتجع بقيمة <span className="ltr-nums font-semibold text-ink">{formatILS(stats.returns.total)}</span>
                  {stats.returns.open > 0 ? ` · ${stats.returns.open} قيد المعالجة` : ""} — غير محسوبة في المبيعات
                </span>
              </span>
              <Icon name="chevronLeft" className="h-5 w-5 text-muted" />
            </Link>
          )}
          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="section-title">مسار الطلبيات</h2>
              <span className="text-[13px] text-muted">{periodLabel} · {pipelineTotal} طلبية</span>
            </div>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              {pipelineTotal > 0 &&
                ORDER_FLOW.map((s) => {
                  const n = stats.by_status[s as Exclude<OrderStatus, "draft">] ?? 0;
                  return n ? <span key={s} className={STATUS_STYLE[s].bar} style={{ width: `${(n / pipelineTotal) * 100}%` }} /> : null;
                })}
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[...ORDER_FLOW, "cancelled" as const].map((s) => (
                <li key={s}>
                  <Link href={`/admin/orders?status=${s}`} className="flex items-center gap-2.5 rounded-xl border border-transparent p-2.5 transition hover:border-line hover:bg-canvas">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STATUS_STYLE[s].chip} ring-1 ring-inset`}>
                      <Icon name={STATUS_STYLE[s].icon} className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xl font-bold leading-none tabular">{stats.by_status[s as Exclude<OrderStatus, "draft">] ?? 0}</span>
                      <span className="block text-[12px] leading-tight text-muted">{t.status[s]}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="card p-6 text-rose-700">تعذّر تحميل الأرقام. حدّث الصفحة.</div>
      )}

      {delayed.length > 0 && (
        <section>
          <SectionTitle icon="alert" tone="text-rose-700" title="متأخرة عن موعد التسليم" count={delayed.length} href="/admin/orders?delayed=1" />
          <OrdersTable rows={delayed} hrefBase="/admin/orders" timeZone={timeZone} />
        </section>
      )}
      {unacknowledged.length > 0 && (
        <section>
          <SectionTitle icon="sparkle" tone="text-sky-700" title="جديدة — بانتظار تأكيد المصنع" count={unacknowledged.length} href="/admin/orders?status=new" />
          <OrdersTable rows={unacknowledged} hrefBase="/admin/orders" timeZone={timeZone} />
        </section>
      )}
      <section>
        <SectionTitle icon="list" tone="text-walnut-700" title="آخر الطلبيات" href="/admin/orders" />
        <OrdersTable
          rows={recent}
          hrefBase="/admin/orders"
          timeZone={timeZone}
          empty={{
            title: "لا توجد طلبيات بعد",
            text: "أول طلبية يرسلها موظف المبيعات تظهر هنا فوراً.",
            action: <Link href="/admin/orders/new" className="btn-primary">إنشاء طلبية</Link>,
          }}
        />
      </section>
    </div>
  );
}

function SectionTitle({ icon, tone, title, count, href }: { icon: IconName; tone: string; title: string; count?: number; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className={`section-title flex items-center gap-2 ${tone}`}>
        <Icon name={icon} className="h-5 w-5" />
        <span className="text-ink">{title}</span>
        {count !== undefined && <span className="rounded-full bg-canvas px-2 text-sm font-bold text-ink/70 ring-1 ring-line">{count}</span>}
      </h2>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-walnut-700">
        عرض الكل
        <Icon name="chevronLeft" className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  sub,
  money,
  href,
}: {
  icon: IconName;
  tone: "walnut" | "amber" | "rose";
  label: string;
  value: React.ReactNode;
  sub?: string;
  money?: boolean;
  href?: string;
}) {
  const toneCls = {
    walnut: "bg-walnut-50 text-walnut-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-600 text-white",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-muted">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneCls}`}>
          <Icon name={icon} className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
      <div className={`mt-2 font-bold leading-none tabular ${money ? "text-[22px] ltr-nums sm:text-2xl" : "text-[28px]"} ${tone === "rose" ? "text-rose-700" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 truncate text-[12px] text-muted">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card-interactive block p-4">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
