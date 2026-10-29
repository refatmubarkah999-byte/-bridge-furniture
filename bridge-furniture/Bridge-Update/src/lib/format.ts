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
    case "last_month": {
      const first = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
      const end = new Date(first);
      end.setUTCDate(0);
      const start = new Date(end);
      start.setUTCDate(1);
      return { from: iso(start), to: iso(end) };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return { from: isIsoDate(from) ? from! : today, to: isIsoDate(to) ? to! : today };
    case "all":
      return { from: undefined, to: undefined };
    case "today":
    default:
      return { from: today, to: today };
  }
}

/** عدد الأيام من اليوم (بتوقيت الشركة) حتى التاريخ المعطى. سالب = فات الموعد */
export function daysUntil(date: string | null | undefined, timeZone: string) {
  if (!date) return null;
  const today = Date.parse(`${todayInTz(timeZone)}T00:00:00Z`);
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

/** عدّ الأيام بالعربية الصحيحة: يوم / يومين / 3 أيام / 11 يوماً */
export function arabicDays(n: number) {
  const a = Math.abs(n);
  if (a === 1) return "يوم";
  if (a === 2) return "يومين";
  if (a >= 3 && a <= 10) return `${a} أيام`;
  return `${a} يوماً`;
}

/** وصف قصير لموعد التسليم: "اليوم"، "غداً"، "بعد 3 أيام"، "متأخرة يومين" */
export function dueLabel(days: number | null) {
  if (days === null) return "";
  if (days === 0) return "التسليم اليوم";
  if (days === 1) return "التسليم غداً";
  if (days > 1) return `بعد ${arabicDays(days)}`;
  return `متأخرة ${arabicDays(days)}`;
}

export function isIsoDate(v: string | undefined | null) {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** صيغ العدد العربية: قطعة واحدة، قطعتان، 3 قطع، 11 قطعة */
function arCount(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
export const piecesLabel = (n: number) => arCount(n, "قطعة واحدة", "قطعتان", "قطع", "قطعة");
export const modelsLabel = (n: number) => arCount(n, "موديل واحد", "موديلان", "موديلات", "موديلاً");

/** اسم الشهر بالعربية من "YYYY-MM" */
export function monthLabel(ym: string, withYear = false) {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("ar", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC", numberingSystem: "latn" }).format(d);
}

/** مبلغ مختصر للمحاور: 12.5 ألف */
export function shortILS(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} مليون`;
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")} ألف`;
  return String(Math.round(n));
}
