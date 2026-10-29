import type { ColorFields } from "@/lib/color";

/** يعرض الكتالوج ورقم اللون بوضوح — رقم اللون هو أهم معلومة للتصنيع */
export function ColorSpec({ item, size = "md" }: { item: ColorFields; size?: "md" | "lg" }) {
  const big = size === "lg";
  if (!item.color_code) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-ink/75 ${big ? "text-lg" : "text-[15px]"}`}>
        <span className={`rounded-full bg-walnut-300 ring-1 ring-black/10 ${big ? "h-3.5 w-3.5" : "h-3 w-3"}`} aria-hidden="true" />
        {item.color}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.catalog && (
        <span className={`rounded-lg bg-canvas px-2 py-0.5 font-semibold text-ink/80 ring-1 ring-line ${big ? "text-[15px]" : "text-[13px]"}`}>
          {item.catalog}
        </span>
      )}
      <span className={`rounded-lg bg-walnut-600 px-2 py-0.5 font-bold text-white ${big ? "text-[17px]" : "text-[14px]"}`}>
        لون <span className="ltr-nums">{item.color_code}</span>
      </span>
      {item.color && <span className={`text-ink/70 ${big ? "text-[16px]" : "text-[14px]"}`}>{item.color}</span>}
    </span>
  );
}
