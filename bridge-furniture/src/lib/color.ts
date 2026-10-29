/** تفاصيل لون المنتج: كتالوج القماش + رقم اللون + اسمه (أو اسم اللون فقط للطلبيات القديمة) */
export type ColorFields = { color: string; catalog?: string | null; color_code?: string | null };

export function colorText(i: ColorFields) {
  if (!i.color_code) return i.color || "—";
  return [i.catalog, `لون ${i.color_code}`, i.color ? `(${i.color})` : ""].filter(Boolean).join(" · ").replace(" · (", " (");
}
