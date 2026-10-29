"use client";
import { useState } from "react";
import { formatILS, monthLabel, shortILS } from "@/lib/format";

export type MonthRow = { month: string; sales: number; profit: number; collected: number };

// لونان تم فحصهما لعمى الألوان (فرق واضح حتى مع ضعف تمييز الأحمر/الأخضر)
const SALES = "#b06a1f";
const PROFIT = "#2a78b8";

/** أعمدة شهرية: المبيعات والربح على نفس المحور (نفس الوحدة ₪). مرّر فوق الشهر لرؤية الأرقام. */
export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = rows.slice(-12);
  const max = Math.max(1, ...data.map((r) => Math.max(r.sales, r.profit)));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const h = 180;

  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted">لا توجد بيانات في هذه الفترة.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-[13px] text-ink/80" aria-hidden={table}>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SALES }} />المبيعات</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROFIT }} />الربح</span>
        </div>
        <button type="button" className="text-[13px] font-semibold text-walnut-700" onClick={() => setTable((v) => !v)}>
          {table ? "عرض كرسم" : "عرض كجدول"}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-right text-muted">
              <tr><th className="py-2 font-semibold">الشهر</th><th className="py-2 font-semibold">المبيعات</th><th className="py-2 font-semibold">الربح</th><th className="py-2 font-semibold">المحصّل</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => (
                <tr key={r.month}>
                  <td className="py-2">{monthLabel(r.month, true)}</td>
                  <td className="py-2 ltr-nums">{formatILS(r.sales)}</td>
                  <td className="py-2 ltr-nums">{formatILS(r.profit)}</td>
                  <td className="py-2 ltr-nums">{formatILS(r.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          {/* الشبكة الخفيفة */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: h }}>
            {ticks.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-line" style={{ bottom: (v / max) * h }}>
                <span className="absolute -top-2.5 left-0 bg-surface pr-1 text-[11px] text-muted">{shortILS(v)}</span>
              </div>
            ))}
          </div>
          <div className="relative flex items-end gap-1 pl-12" style={{ height: h }}>
            {data.map((r, i) => (
              <button
                key={r.month}
                type="button"
                className={`relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-t-md ${hover === i ? "bg-walnut-50" : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${monthLabel(r.month, true)}: المبيعات ${formatILS(r.sales)}، الربح ${formatILS(r.profit)}`}
              >
                <span className="w-full max-w-[18px] rounded-t-[4px]" style={{ height: `${(Math.max(r.sales, 0) / max) * 100}%`, background: SALES }} />
                <span className="w-full max-w-[18px] rounded-t-[4px]" style={{ height: `${(Math.max(r.profit, 0) / max) * 100}%`, background: PROFIT }} />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1 pl-12">
            {data.map((r) => (
              <span key={r.month} className="flex-1 truncate text-center text-[11px] text-muted">{monthLabel(r.month)}</span>
            ))}
          </div>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-line bg-surface p-3 text-[13px] shadow-[var(--shadow-raised)]"
              style={hover < data.length / 2 ? { right: `${((hover + 1) / data.length) * 85}%` } : { left: `${((data.length - hover) / data.length) * 85}%` }}
            >
              <div className="mb-1.5 font-bold">{monthLabel(data[hover].month, true)}</div>
              <Row color={SALES} k="المبيعات" v={data[hover].sales} />
              <Row color={PROFIT} k="الربح" v={data[hover].profit} />
              <Row k="المحصّل" v={data[hover].collected} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ color, k, v }: { color?: string; k: string; v: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-ink/80">
        <span className="h-2 w-2 rounded-sm" style={{ background: color ?? "transparent", outline: color ? undefined : "1px solid #c9bfb2" }} />
        {k}
      </span>
      <span className="font-semibold ltr-nums">{formatILS(v)}</span>
    </div>
  );
}
