"use client";
/* eslint-disable @next/next/no-img-element */
import { useActionState, useEffect, useRef, useState } from "react";
import { createProductAction, updateProductAction } from "@/app/actions/products";
import { useFeedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/Icon";
import type { ActionResult, CatalogProduct } from "@/lib/types";

export function ProductForm({ product }: { product?: CatalogProduct }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(product ? updateProductAction : createProductAction, { ok: true });
  const { toast } = useFeedback();
  const ref = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  const [colors, setColors] = useState<string[]>(product?.colors.filter((c) => c.is_active).map((c) => c.name) ?? []);
  const [colorInput, setColorInput] = useState("");
  const [preview, setPreview] = useState<string | null>(product?.image_url ?? null);

  useEffect(() => {
    if (!sent.current || pending) return;
    sent.current = false;
    if (state.ok) {
      toast(product ? "تم حفظ التعديلات." : "تمت إضافة الموديل.");
      if (!product) {
        ref.current?.reset();
        setColors([]);
        setPreview(null);
      }
    } else {
      toast(state.error, "error");
    }
  }, [state, pending, product, toast]);

  function addColor() {
    const parts = colorInput.split(/[,،\n]/).map((c) => c.trim()).filter(Boolean);
    if (!parts.length) return;
    setColors((cs) => Array.from(new Set([...cs, ...parts])).slice(0, 30));
    setColorInput("");
  }

  return (
    <form
      ref={ref}
      action={(fd) => {
        sent.current = true;
        fd.set("colors", colors.join("،"));
        action(fd);
      }}
      className="grid gap-4 sm:grid-cols-[auto_1fr]"
    >
      {product && <input type="hidden" name="id" value={product.id} />}

      <label className="group relative block h-32 w-32 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-line-strong bg-canvas hover:border-walnut-500">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-center text-[13px] text-muted">
            <Icon name="image" className="h-7 w-7" />
            إضافة صورة
          </span>
        )}
        {preview && (
          <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs font-semibold text-white">تغيير الصورة</span>
        )}
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPreview(URL.createObjectURL(f));
          }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">اسم الموديل <span className="text-rose-600">*</span></span>
          <input name="name" required maxLength={80} defaultValue={product?.name} className="field" />
        </label>
        <label className="block">
          <span className="label">السعر القياسي (₪)</span>
          <input name="standard_price" inputMode="decimal" dir="ltr" defaultValue={product?.standard_price ?? ""} placeholder="0" className="field text-left ltr-nums" />
        </label>
        <div className="sm:col-span-2">
          <span className="label">ألوان خاصة بالموديل <span className="font-normal text-muted">— اختياري</span></span>
          <div className="flex gap-2">
            <input
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addColor();
                }
              }}
              placeholder="اكتب لوناً واضغط إضافة"
              className="field"
            />
            <button type="button" className="btn-secondary px-4" onClick={addColor}>إضافة</button>
          </div>
          {colors.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-walnut-50 py-1 pl-1.5 pr-3 text-sm font-semibold ring-1 ring-walnut-200">
                  {c}
                  <button type="button" className="rounded-full p-0.5 text-muted hover:bg-white hover:text-rose-700" aria-label={`حذف ${c}`} onClick={() => setColors((cs) => cs.filter((x) => x !== c))}>
                    <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="hint">الألوان تُختار عادة من «الكتالوجات» برقم اللون. استعمل هذه فقط إذا لم توجد كتالوجات بعد.</p>
          )}
        </div>
        {product && (
          <label className="flex items-center gap-2.5 text-[15px] sm:col-span-2">
            <input type="checkbox" name="is_active" defaultChecked={product.is_active} className="h-5 w-5 accent-walnut-600" />
            متاح للطلب <span className="text-sm text-muted">— أزل العلامة لإيقاف الموديل دون حذفه</span>
          </label>
        )}
        <div className="sm:col-span-2">
          <button disabled={pending} className="btn-primary w-full sm:w-auto">
            {pending ? "جارٍ الحفظ…" : product ? "حفظ التعديلات" : "إضافة الموديل"}
          </button>
        </div>
      </div>
    </form>
  );
}
