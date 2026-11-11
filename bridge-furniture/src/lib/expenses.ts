import type { IconName } from "@/components/Icon";

export type ExpenseCategory = "ads" | "salaries" | "marketing" | "other";

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; hint: string; icon: IconName; tone: string }[] = [
  { key: "ads", label: "إعلانات", hint: "فيسبوك، إنستغرام، تيك توك…", icon: "sparkle", tone: "bg-sky-50 text-sky-700" },
  { key: "salaries", label: "رواتب موظفين", hint: "رواتب، عمولات، أجور", icon: "users", tone: "bg-violet-50 text-violet-700" },
  { key: "marketing", label: "تسويق", hint: "تصوير، مطبوعات، هدايا، معارض", icon: "image", tone: "bg-amber-50 text-amber-700" },
  { key: "other", label: "مصاريف أخرى", hint: "إيجار، كهرباء، مواصلات…", icon: "more", tone: "bg-stone-100 text-stone-700" },
];

export const expenseLabel = (k: string) => EXPENSE_CATEGORIES.find((c) => c.key === k)?.label ?? k;

export type ExpenseItem = { id: string; spent_on: string; category: ExpenseCategory; amount: number; note: string | null; by: string | null };

export type ExpensesSummary = {
  total: number;
  count: number;
  by_category: Record<ExpenseCategory, number>;
  by_month: { month: string; total: number }[];
  items: ExpenseItem[];
};
