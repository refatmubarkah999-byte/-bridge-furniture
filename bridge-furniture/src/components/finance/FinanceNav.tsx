import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { key: string; href: string; label: string; icon: IconName }[] = [
  { key: "overview", href: "/finance", label: "التقرير", icon: "chart" },
  { key: "payments", href: "/finance/payments", label: "الدفعات", icon: "wallet" },
  { key: "orders", href: "/finance/orders", label: "أرباح الطلبيات", icon: "list" },
  { key: "costs", href: "/finance/costs", label: "التكاليف", icon: "box" },
];

/** تبويبات قسم المالية (مفيدة للمالك الذي يرى "المالية" كبند واحد في القائمة) */
export function FinanceNav({ active, pending = 0 }: { active: string; pending?: number }) {
  return (
    <nav className="scroll-row -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="أقسام المالية">
      {TABS.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={active === tab.key ? "page" : undefined} className="chip">
          <Icon name={tab.icon} className="h-4 w-4" />
          {tab.label}
          {tab.key === "payments" && pending > 0 && <span className="chip-count !bg-amber-500 !text-white">{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}

export const FINANCE_PERIODS = [
  { key: "month", label: "هذا الشهر" },
  { key: "last_month", label: "الشهر الماضي" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "today", label: "اليوم" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "الكل" },
];

/** شريط اختيار الفترة (روابط + فترة محددة) */
export function PeriodBar({
  basePath,
  period,
  range,
  extra = {},
}: {
  basePath: string;
  period: string;
  range: { from?: string; to?: string };
  extra?: Record<string, string | undefined>;
}) {
  const qs = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...extra, ...p })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <nav className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="الفترة">
        {FINANCE_PERIODS.map((p) => (
          <Link key={p.key} href={qs({ period: p.key })} aria-current={period === p.key ? "page" : undefined} className="chip">
            {p.label}
          </Link>
        ))}
      </nav>
      <details className="relative">
        <summary className="chip list-none" aria-current={period === "custom" ? "page" : undefined}>
          <Icon name="calendar" className="h-4 w-4" />
          {period === "custom" ? `${range.from} ← ${range.to}` : "فترة محددة"}
        </summary>
        <form action={basePath} className="absolute z-20 mt-2 w-72 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-raised)] rtl:right-0">
          {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <input type="hidden" name="period" value="custom" />
          <label className="block"><span className="label">من</span><input type="date" name="from" defaultValue={range.from} className="field" /></label>
          <label className="block"><span className="label">إلى</span><input type="date" name="to" defaultValue={range.to} className="field" /></label>
          <button className="btn-primary w-full">عرض</button>
        </form>
      </details>
    </div>
  );
}
