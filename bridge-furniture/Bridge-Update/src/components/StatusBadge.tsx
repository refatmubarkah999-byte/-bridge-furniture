import { t } from "@/i18n";
import { Icon, type IconName } from "@/components/Icon";
import { arabicDays } from "@/lib/format";
import { ORDER_FLOW, type OrderStatus } from "@/lib/types";

/** لون ثابت لكل حالة + اسمها مكتوب دائماً (لا يعتمد الفهم على اللون وحده) */
export const STATUS_STYLE: Record<OrderStatus, { chip: string; dot: string; bar: string; icon: IconName }> = {
  draft: { chip: "bg-stone-100 text-stone-700 ring-stone-300", dot: "bg-stone-400", bar: "bg-stone-300", icon: "note" },
  new: { chip: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", bar: "bg-sky-500", icon: "sparkle" },
  received: { chip: "bg-indigo-50 text-indigo-800 ring-indigo-200", dot: "bg-indigo-500", bar: "bg-indigo-500", icon: "inbox" },
  preparing: { chip: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500", bar: "bg-amber-500", icon: "hammer" },
  ready: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500", icon: "box" },
  out_for_delivery: { chip: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500", bar: "bg-violet-500", icon: "truck" },
  delivered: { chip: "bg-green-100 text-green-900 ring-green-300", dot: "bg-green-700", bar: "bg-green-700", icon: "checkCircle" },
  cancelled: { chip: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500", bar: "bg-rose-400", icon: "ban" },
};

export function StatusBadge({ status, large = false }: { status: OrderStatus; large?: boolean }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${s.chip} ${
        large ? "px-3.5 py-1.5 text-[15px]" : "px-2.5 py-1 text-[13px]"
      }`}
    >
      <Icon name={s.icon} className={large ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={2} />
      {t.status[status]}
    </span>
  );
}

/** شارة موعد التسليم: متأخرة (أحمر)، اليوم/غداً (كهرماني)، أو عادي */
export function DueChip({ days, done = false }: { days: number | null; done?: boolean }) {
  if (days === null || done) return null;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[13px] font-bold text-white">
        <Icon name="alert" className="h-3.5 w-3.5" strokeWidth={2.2} />
        متأخرة {arabicDays(days)}
      </span>
    );
  if (days <= 1)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[13px] font-bold text-amber-900">
        <Icon name="clock" className="h-3.5 w-3.5" strokeWidth={2.2} />
        {days === 0 ? "التسليم اليوم" : "التسليم غداً"}
      </span>
    );
  return null;
}

export function DelayedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[13px] font-bold text-white">
      <Icon name="alert" className="h-3.5 w-3.5" strokeWidth={2.2} />
      {t.common.delayed}
    </span>
  );
}

/** شريط تقدّم الطلبية عبر الحالات الست */
export function StatusStepper({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  if (status === "draft") return null;
  const cancelled = status === "cancelled";
  const idx = ORDER_FLOW.indexOf(status);

  if (compact) {
    return (
      <div className="flex items-center gap-1" aria-label={`المرحلة ${idx + 1} من ${ORDER_FLOW.length}`}>
        {ORDER_FLOW.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-full ${cancelled ? "bg-rose-200" : i <= idx ? STATUS_STYLE[status].bar : "bg-line"}`}
          />
        ))}
      </div>
    );
  }

  return (
    <ol className="grid grid-cols-6 gap-1.5" aria-label="مراحل الطلبية">
      {ORDER_FLOW.map((s, i) => {
        const done = !cancelled && i < idx;
        const current = !cancelled && i === idx;
        return (
          <li key={s} className="flex flex-col items-center gap-1.5 text-center">
            <span className="flex w-full items-center">
              <span className={`h-1 flex-1 rounded-full ${i === 0 ? "opacity-0" : done || current ? "bg-walnut-500" : "bg-line"}`} />
              <span
                className={`mx-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${
                  current
                    ? `${STATUS_STYLE[s].dot} text-white ring-walnut-100`
                    : done
                      ? "bg-walnut-600 text-white ring-transparent"
                      : "bg-canvas text-faint ring-transparent"
                }`}
              >
                <Icon name={done ? "check" : STATUS_STYLE[s].icon} className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className={`h-1 flex-1 rounded-full ${i === ORDER_FLOW.length - 1 ? "opacity-0" : done ? "bg-walnut-500" : "bg-line"}`} />
            </span>
            <span className={`text-[11px] leading-tight sm:text-xs ${current ? "font-bold text-ink" : done ? "text-ink/70" : "text-faint"}`}>
              {t.status[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
