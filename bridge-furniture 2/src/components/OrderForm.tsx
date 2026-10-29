"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDraftAction, submitOrderAction, type OrderPayloadInput } from "@/app/actions/orders";
import { formatILS } from "@/lib/format";
import type { CatalogProduct, OrderDetail } from "@/lib/types";

type ItemState = {
  key: string;
  product_id: string;
  color: string;
  quantity: number;
  unit_price: string;
  notes: string;
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

export function OrderForm({
  products,
  initial,
  basePath,
  minDate,
}: {
  products: CatalogProduct[];
  initial?: OrderDetail;
  basePath: "/admin" | "/sales";
  minDate: string;
}) {
  const router = useRouter();
  const isSubmittedEdit = !!initial && initial.status !== "draft";
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activeProducts = products.filter((p) => p.is_active);

  // رمز فريد لهذا النموذج: يمنع إنشاء طلبية مكررة عند الضغط مرتين.
  // للمسودة نستخدم رمزها المحفوظ؛ لتعديل طلبية مرسلة نستخدم رمزاً جديداً.
  const [idempotencyKey] = useState(() => (initial && !isSubmittedEdit ? initial.idempotency_key : newKey()));
  const [orderId, setOrderId] = useState<string | undefined>(initial?.id);

  const [customer, setCustomer] = useState({
    full_name: initial?.customer.full_name ?? "",
    phone: initial?.customer.phone ?? "",
    phone2: initial?.customer.phone2 ?? "",
    city: initial?.customer.city ?? "",
    address: initial?.customer.address ?? "",
  });
  const [deliveryDate, setDeliveryDate] = useState(initial?.expected_delivery_date ?? "");
  const [deliveryFee, setDeliveryFee] = useState(String(initial?.totals.delivery_fee ?? 0));
  const [deposit, setDeposit] = useState(String(initial?.deposit ?? 0));
  const [customerNotes, setCustomerNotes] = useState(initial?.customer_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internal_notes ?? "");
  const [items, setItems] = useState<ItemState[]>(() =>
    initial?.items.length
      ? initial.items.map((i) => ({
          key: newKey(),
          product_id: i.product_id ?? "",
          color: i.color,
          quantity: i.quantity,
          unit_price: String(i.unit_price),
          notes: i.notes ?? "",
        }))
      : []
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subtotal = items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (i.quantity || 0), 0);
  const total = subtotal + (Number(deliveryFee) || 0);
  const paid = isSubmittedEdit ? Number(initial?.totals.paid ?? 0) : Number(deposit) || 0;
  const remaining = total - paid;

  function addItem() {
    const p = activeProducts[0];
    setItems((xs) => [
      ...xs,
      {
        key: newKey(),
        product_id: p?.id ?? "",
        color: p?.colors.find((c) => c.is_active)?.name ?? "",
        quantity: 1,
        unit_price: String(p?.standard_price ?? 0),
        notes: "",
      },
    ]);
  }
  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }
  function changeProduct(key: string, productId: string) {
    const p = byId.get(productId);
    updateItem(key, {
      product_id: productId,
      color: p?.colors.find((c) => c.is_active)?.name ?? "",
      unit_price: String(p?.standard_price ?? 0),
    });
  }

  function payload(): OrderPayloadInput {
    return {
      order_id: orderId,
      idempotency_key: idempotencyKey,
      expected_delivery_date: deliveryDate,
      customer,
      customer_notes: customerNotes,
      internal_notes: internalNotes,
      delivery_fee: Number(deliveryFee) || 0,
      deposit: Number(deposit) || 0,
      items: items.map((i) => ({
        product_id: i.product_id,
        color: i.color,
        quantity: i.quantity,
        unit_price: Number(i.unit_price) || 0,
        notes: i.notes,
      })),
    };
  }

  function onSaveDraft() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await saveDraftAction(payload());
      if (!r.ok) return setError(r.error);
      setOrderId(r.data!.orderId);
      if (isSubmittedEdit) {
        router.push(`${basePath}/orders/${r.data!.orderId}`);
      } else {
        setNotice("تم حفظ المسودة.");
        router.replace(`${basePath}/orders/${r.data!.orderId}/edit`, { scroll: false });
      }
    });
  }

  function onSubmit() {
    setError(null);
    setNotice(null);
    if (!items.length) return setError("أضف منتجاً واحداً على الأقل.");
    if (!confirm("إرسال الطلبية إلى الإدارة والمصنع؟")) return;
    startTransition(async () => {
      const r = await submitOrderAction(payload());
      if (!r.ok) return setError(r.error);
      router.push(`${basePath}/orders/${r.data!.orderId}?submitted=${encodeURIComponent(r.data!.orderNumber)}`);
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="mx-auto max-w-3xl space-y-5 pb-32">
      <Section n={1} title="الزبون">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الزبون الكامل" required>
            <input className="field" value={customer.full_name} maxLength={100} autoComplete="off"
              onChange={(e) => setCustomer({ ...customer, full_name: e.target.value })} />
          </Field>
          <Field label="المدينة" required>
            <input className="field" value={customer.city} maxLength={60}
              onChange={(e) => setCustomer({ ...customer, city: e.target.value })} />
          </Field>
          <Field label="رقم الهاتف" required>
            <input className="field text-left" dir="ltr" inputMode="tel" value={customer.phone} maxLength={20}
              placeholder="05XXXXXXXX" onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          </Field>
          <Field label="رقم هاتف إضافي (اختياري)">
            <input className="field text-left" dir="ltr" inputMode="tel" value={customer.phone2} maxLength={20}
              onChange={(e) => setCustomer({ ...customer, phone2: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="عنوان التوصيل بالتفصيل" required>
              <textarea className="field min-h-20" value={customer.address} maxLength={300}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </Field>
          </div>
        </div>
      </Section>

      <Section n={2} title="المنتجات">
        {items.length === 0 && <p className="mb-3 text-muted">لم تُضف منتجات بعد.</p>}
        <ul className="space-y-3">
          {items.map((item, idx) => {
            const product = byId.get(item.product_id);
            const colors = product?.colors.filter((c) => c.is_active || c.name === item.color) ?? [];
            const selectable = products.filter((p) => p.is_active || p.id === item.product_id);
            return (
              <li key={item.key} className="rounded-2xl border border-line p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted">منتج {idx + 1}</span>
                  <button type="button" className="text-sm text-rose-700 hover:underline"
                    onClick={() => setItems((xs) => xs.filter((x) => x.key !== item.key))}>حذف</button>
                </div>
                <div className="flex gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-walnut-50 ring-1 ring-line">
                    {product?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">بلا صورة</div>
                    )}
                  </div>
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Field label="الموديل">
                      <select className="field" value={item.product_id} onChange={(e) => changeProduct(item.key, e.target.value)}>
                        {selectable.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="اللون">
                      <select className="field" value={item.color} onChange={(e) => updateItem(item.key, { color: e.target.value })}>
                        {colors.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="الكمية">
                    <div className="flex items-center gap-2">
                      <button type="button" className="btn-secondary h-11 w-11 px-0 text-xl" aria-label="إنقاص"
                        onClick={() => updateItem(item.key, { quantity: Math.max(1, item.quantity - 1) })}>−</button>
                      <input className="field w-16 text-center ltr-nums" inputMode="numeric" value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: Math.min(999, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
                      <button type="button" className="btn-secondary h-11 w-11 px-0 text-xl" aria-label="زيادة"
                        onClick={() => updateItem(item.key, { quantity: Math.min(999, item.quantity + 1) })}>+</button>
                    </div>
                  </Field>
                  <Field label="سعر الوحدة (₪)">
                    <input className="field text-left ltr-nums" dir="ltr" inputMode="decimal" value={item.unit_price}
                      onChange={(e) => updateItem(item.key, { unit_price: e.target.value.replace(/[^\d.]/g, "") })} />
                  </Field>
                  <div className="col-span-2 flex items-end sm:col-span-1">
                    <div className="w-full rounded-xl bg-walnut-50 px-3 py-2.5 text-left font-semibold ltr-nums">
                      {formatILS((Number(item.unit_price) || 0) * item.quantity)}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Field label="ملاحظات خاصة بالمنتج (لا يراها المصنع)">
                    <input className="field" value={item.notes} maxLength={500}
                      onChange={(e) => updateItem(item.key, { notes: e.target.value })} />
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-secondary mt-3 w-full" onClick={addItem} disabled={!activeProducts.length}>
          + إضافة منتج
        </button>
        {!activeProducts.length && <p className="mt-2 text-sm text-rose-700">لا توجد موديلات في الكتالوج بعد.</p>}
      </Section>

      <Section n={3} title="التسليم والدفع">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="تاريخ التسليم المتوقع" required>
            <input type="date" className="field ltr-nums" min={minDate} value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)} />
          </Field>
          <Field label="رسوم التوصيل (₪)">
            <input className="field text-left ltr-nums" dir="ltr" inputMode="decimal" value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          {!isSubmittedEdit && (
            <Field label="العربون المستلم (₪)">
              <input className="field text-left ltr-nums" dir="ltr" inputMode="decimal" value={deposit}
                onChange={(e) => setDeposit(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          )}
        </div>
      </Section>

      <Section n={4} title="ملاحظات">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ملاحظات الزبون">
            <textarea className="field min-h-20" value={customerNotes} maxLength={1000} onChange={(e) => setCustomerNotes(e.target.value)} />
          </Field>
          <Field label="ملاحظات داخلية">
            <textarea className="field min-h-20" value={internalNotes} maxLength={1000} onChange={(e) => setInternalNotes(e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-sm text-muted">الملاحظات والأسعار وبيانات الزبون لا تصل إلى المصنع.</p>
      </Section>

      <div className="fixed inset-x-0 bottom-[64px] z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur md:bottom-0 md:pr-64">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>المجموع <b className="ltr-nums text-base">{formatILS(total)}</b></span>
            <span>{isSubmittedEdit ? "المدفوع" : "العربون"} <b className="ltr-nums">{formatILS(paid)}</b></span>
            <span>المتبقي <b className={`ltr-nums ${remaining < 0 ? "text-rose-700" : ""}`}>{formatILS(remaining)}</b></span>
          </div>
          <div className="flex gap-2">
            {isSubmittedEdit ? (
              <button type="button" className="btn-primary" disabled={pending} onClick={onSaveDraft}>
                {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </button>
            ) : (
              <>
                <button type="button" className="btn-secondary" disabled={pending} onClick={onSaveDraft}>حفظ كمسودة</button>
                <button type="button" className="btn-primary" disabled={pending} onClick={onSubmit}>
                  {pending ? "جارٍ الإرسال…" : "إرسال الطلبية"}
                </button>
              </>
            )}
          </div>
        </div>
        {(error || notice) && (
          <p role="alert" className={`mx-auto mt-2 max-w-3xl rounded-xl p-2.5 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
            {error ?? notice}
          </p>
        )}
      </div>
    </form>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-walnut-100 text-sm text-walnut-700">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
