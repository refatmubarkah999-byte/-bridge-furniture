"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProductCostAction } from "@/app/actions/finance";
import { useFeedback } from "@/components/ui/Feedback";
import { ProductThumb } from "@/components/ProductThumb";
import { formatILS } from "@/lib/format";

export function CostRow({
  productId,
  name,
  price,
  cost,
  active,
  image,
}: {
  productId: string;
  name: string;
  price: number;
  cost: number | null;
  active: boolean;
  image: string | null;
}) {
  const [value, setValue] = useState(cost === null ? "" : String(cost));
  const [busy, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();
  const n = Number(value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]/g, ""));
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0;
  const dirty = valid && n !== cost;
  const profit = valid ? price - n : null;
  const margin = profit !== null && price > 0 ? Math.round((profit / price) * 100) : null;

  function save() {
    start(async () => {
      const r = await setProductCostAction(productId, value);
      if (r.ok) {
        toast(`تم حفظ تكلفة ${name}.`);
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <li className={`flex flex-wrap items-center gap-3 p-4 ${active ? "" : "opacity-60"}`}>
      <ProductThumb url={image} alt={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          {name}
          {!active && <span className="mr-2 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold">متوقف</span>}
          {cost === null && active && <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">بدون تكلفة</span>}
        </div>
        <div className="text-[13px] text-muted">
          سعر البيع <span className="ltr-nums">{formatILS(price)}</span>
          {profit !== null && (
            <>
              {" · "}ربح القطعة{" "}
              <b className={`ltr-nums ${profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatILS(profit)}</b>
              {margin !== null && <> ({margin}%)</>}
            </>
          )}
        </div>
      </div>
      <form
        className="flex w-full items-center gap-2 sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save();
        }}
      >
        <label className="relative flex-1 sm:w-36 sm:flex-none">
          <span className="sr-only">تكلفة {name}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder="التكلفة"
            className="field pl-8 text-left ltr-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted">₪</span>
        </label>
        <button disabled={!dirty || busy} className="btn-primary btn-sm h-11">
          {busy ? "…" : "حفظ"}
        </button>
      </form>
    </li>
  );
}
