import { locale } from "@/i18n";

export function formatILS(amount: number | string | null | undefined) {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(n);
}

/** تاريخ بلا وقت (مثل تاريخ التسليم 2026-11-12) — يُعرض كما هو دون إزاحة توقيت */
export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** وقت محدد (مثل وقت الإرسال) — يُعرض بتوقيت الشركة */
export function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** تاريخ اليوم بتوقيت الشركة بصيغة YYYY-MM-DD */
export function todayInTz(timeZone: string, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!offsetDays) return parts;
  const d = new Date(`${parts}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** حدود الفترات لفلاتر لوحة المالك (بتوقيت الشركة). الأسبوع يبدأ السبت. */
export function periodRange(period: string, timeZone: string, from?: string, to?: string) {
  const today = todayInTz(timeZone);
  const d = new Date(`${today}T00:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (period) {
    case "yesterday": {
      const y = todayInTz(timeZone, -1);
      return { from: y, to: y };
    }
    case "week": {
      const sinceSaturday = (d.getUTCDay() + 1) % 7;
      const start = new Date(d);
      start.setUTCDate(d.getUTCDate() - sinceSaturday);
      return { from: iso(start), to: today };
    }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "custom":
      return { from: isIsoDate(from) ? from! : today, to: isIsoDate(to) ? to! : today };
    case "all":
      return { from: undefined, to: undefined };
    case "today":
    default:
      return { from: today, to: today };
  }
}

export function isIsoDate(v: string | undefined | null) {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
