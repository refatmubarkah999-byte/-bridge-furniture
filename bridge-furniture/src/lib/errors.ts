import { t } from "@/i18n";

type ErrorKey = keyof typeof t.errors;

/** يحوّل رمز الخطأ القادم من قاعدة البيانات إلى رسالة عربية واضحة. لا يكشف تفاصيل تقنية للمستخدم. */
export function friendlyError(err: unknown): string {
  const message =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  const code = message.trim().split(/\s/)[0] as ErrorKey;
  if (code && code in t.errors) return t.errors[code];
  if (/permission denied|row-level security|42501/.test(message)) return t.errors.forbidden;
  if (process.env.NODE_ENV !== "production") console.error("[db error]", message);
  return t.errors.generic;
}
