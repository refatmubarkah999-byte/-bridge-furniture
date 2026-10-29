"use client";
import { useActionState, useEffect, useRef } from "react";
import { createProductAction, updateProductAction } from "@/app/actions/products";
import type { ActionResult, CatalogProduct } from "@/lib/types";

export function ProductForm({ product }: { product?: CatalogProduct }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    product ? updateProductAction : createProductAction,
    { ok: true }
  );
  const ref = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current && !pending && state.ok && !product) ref.current?.reset();
  }, [pending, state, product]);

  return (
    <form ref={ref} action={(fd) => { submitted.current = true; action(fd); }} className="grid gap-3 sm:grid-cols-2">
      {product && <input type="hidden" name="id" value={product.id} />}
      <label className="block">
        <span className="label">اسم الموديل *</span>
        <input name="name" required maxLength={80} defaultValue={product?.name} className="field" />
      </label>
      <label className="block">
        <span className="label">السعر القياسي (₪)</span>
        <input name="standard_price" inputMode="decimal" dir="ltr" defaultValue={product?.standard_price ?? 0} className="field text-left ltr-nums" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">الألوان المتاحة * (افصل بينها بفاصلة)</span>
        <input
          name="colors"
          required
          defaultValue={product?.colors.filter((c) => c.is_active).map((c) => c.name).join("، ")}
          placeholder="بيج، رمادي، أزرق"
          className="field"
        />
      </label>
      <label className="block">
        <span className="label">{product ? "صورة جديدة (اختياري)" : "صورة الموديل"}</span>
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="field py-2 text-sm" />
      </label>
      {product && (
        <label className="flex items-center gap-2 self-end pb-3">
          <input type="checkbox" name="is_active" defaultChecked={product.is_active} className="h-5 w-5" />
          متاح للطلب (أزل العلامة لإيقاف الموديل)
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="btn-primary">{pending ? "جارٍ الحفظ…" : product ? "حفظ التعديلات" : "إضافة الموديل"}</button>
        {!state.ok && <span className="text-sm text-rose-700">{state.error}</span>}
        {state.ok && submitted.current && !pending && <span className="text-sm text-emerald-700">تم الحفظ.</span>}
      </div>
    </form>
  );
}
