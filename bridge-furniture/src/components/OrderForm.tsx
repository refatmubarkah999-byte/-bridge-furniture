"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDraftAction, submitOrderAction, type OrderPayloadInput } from "@/app/actions/orders";
import { formatILS, formatDate, modelsLabel, piecesLabel } from "@/lib/format";
import { useFeedback } from "@/components/ui/Feedback";
import { ProductThumb } from "@/components/ProductThumb";
import { Icon, type IconName } from "@/components/Icon";
import type { CatalogProduct, OrderDetail } from "@/lib/types";

type ItemState = {
  key: string;
  product_id: string;
  color: string;
  quantity: number;
  unit_price: string;
  notes: string;
  showNotes: boolean;
};
type Errors = Partial<Record<"full_name" | "phone" | "phone2" | "city" | "address" | "date" | "items" | "deposit", string>> & {
  item?: Record<string, string>;
};

const PHONE_RE = /^\+?[0-9]{9,15}$/;
const cleanPhone = (v: string) => v.replace(/[\s\-()]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const cleanMoney = (v: string) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, "");

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function OrderForm({
  products,
  initial,
  basePath,
  minDate,
}: {
  products: CatalogProduct[];
  initial?: OrderDetail;
  basePath: "/admin" | "/sales" | "/returns";
  minDate: string;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const isSubmittedEdit = !!initial && initial.status !== "draft";
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activeProducts = products.filter((p) => p.is_active);

  // المرتجع: نفس النموذج، بلا عربون، ويصل للمالك فقط
  const isReturn = basePath === "/returns" || initial?.kind === "return";
  // رمز فريد لهذا النموذج يمنع إنشاء طلبية مكررة عند الضغط مرتين
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
  const [deliveryFee, setDeliveryFee] = useState(initial ? String(initial.totals.delivery_fee) : "");
  const [deposit, setDeposit] = useState(initial?.deposit ? String(initial.deposit) : "");
  const [customerNotes, setCustomerNotes] = useState(initial?.customer_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internal_notes ?? "");
  const [items, setItems] = useState<ItemState[]>(() =>
    (initial?.items ?? []).map((i) => ({
      key: newKey(),
      product_id: i.product_id ?? "",
      color: i.color,
      quantity: i.quantity,
      unit_price: String(i.unit_price),
      notes: i.notes ?? "",
      showNotes: !!i.notes,
    }))
  );
  const [errors, setErrors] = useState<Errors>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const subtotal = items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (i.quantity || 0), 0);
  const total = subtotal + (Number(deliveryFee) || 0);
  const paid = isSubmittedEdit ? Number(initial?.totals.paid ?? 0) : Number(deposit) || 0;
  const remaining = total - paid;
  const pieces = items.reduce((s, i) => s + i.quantity, 0);

  function clearError(k: keyof Errors) {
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  }
  function addProduct(p: CatalogProduct) {
    setItems((xs) => [
      ...xs,
      {
        key: newKey(),
        product_id: p.id,
        color: p.colors.find((c) => c.is_active)?.name ?? "",
        quantity: 1,
        unit_price: String(p.standard_price),
        notes: "",
        showNotes: false,
      },
    ]);
    clearError("items");
    setPickerOpen(false);
  }
  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function validate(): Errors {
    const e: Errors = {};
    const item: Record<string, string> = {};
    if (customer.full_name.trim().length < 2) e.full_name = "اكتب اسم الزبون.";
    if (!PHONE_RE.test(cleanPhone(customer.phone))) e.phone = "رقم غير صالح — أرقام فقط، من 9 إلى 15 رقماً.";
    if (customer.phone2.trim() && !PHONE_RE.test(cleanPhone(customer.phone2))) e.phone2 = "رقم غير صالح.";
    if (!customer.city.trim()) e.city = "اكتب المدينة.";
    if (!customer.address.trim()) e.address = "اكتب عنوان التوصيل.";
    if (!deliveryDate) e.date = "اختر موعد التسليم.";
    else if (deliveryDate < minDate) e.date = "الموعد لا يمكن أن يكون في الماضي.";
    if (!items.length) e.items = "أضف منتجاً واحداً على الأقل.";
    for (const it of items) if (!it.color) item[it.key] = "اختر اللون.";
    if (Object.keys(item).length) e.item = item;
    if (!isSubmittedEdit && paid > total) e.deposit = "العربون أكبر من مجموع الطلبية.";
    return e;
  }

  function payload(): OrderPayloadInput {
    return {
      order_id: orderId,
      idempotency_key: idempotencyKey,
      expected_delivery_date: deliveryDate,
      customer: { ...customer, phone: cleanPhone(customer.phone), phone2: cleanPhone(customer.phone2) },
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

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
    });
  }

  function onSaveDraft() {
    if (isSubmittedEdit) {
      const e = validate();
      setErrors(e);
      if (Object.keys(e).length) {
        toast("راجع الحقول المعلّمة بالأحمر.", "error");
        return focusFirstError();
      }
    }
    startTransition(async () => {
      const r = await saveDraftAction(payload());
      if (!r.ok) return toast(r.error, "error");
      setOrderId(r.data!.orderId);
      if (isSubmittedEdit) {
        toast("تم حفظ التعديلات، ووصل إشعار للمصنع.");
        router.push(`${basePath}/orders/${r.data!.orderId}`);
      } else {
        setSavedAt(new Date().toLocaleTimeString("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" }));
        toast("تم حفظ المسودة.");
        router.replace(`${basePath}/orders/${r.data!.orderId}/edit`, { scroll: false });
      }
    });
  }

  async function onSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast("راجع الحقول المعلّمة بالأحمر.", "error");
      return focusFirstError();
    }
    const { ok } = await confirm(
      isReturn
        ? {
            title: "إرسال المرتجع؟",
            message: `${modelsLabel(items.length)} (${piecesLabel(pieces)}) — القيمة ${formatILS(total)}. يصل للمالك فوراً، وبعد الإرسال لا يمكن تعديل الأسعار أو حذف المرتجع.`,
            confirmLabel: "إرسال المرتجع",
          }
        : {
            title: "إرسال الطلبية؟",
            message: `${modelsLabel(items.length)} (${piecesLabel(pieces)}) — المجموع ${formatILS(total)}. التسليم ${formatDate(deliveryDate)}. ستصل للإدارة والمصنع فوراً.`,
            confirmLabel: "إرسال الطلبية",
          }
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await submitOrderAction(payload());
      if (!r.ok) return toast(r.error, "error");
      router.push(`${basePath}/orders/${r.data!.orderId}?submitted=${encodeURIComponent(r.data!.orderNumber)}`);
    });
  }

  const quickDates = [
    { label: "بعد أسبوع", days: 7 },
    { label: "أسبوعين", days: 14 },
    { label: "3 أسابيع", days: 21 },
    { label: "شهر", days: 30 },
  ];

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="mx-auto max-w-3xl space-y-4 pb-44 md:pb-32" noValidate>
      {/* 1. الزبون */}
      <Section n={1} title="الزبون" icon="user" done={!!customer.full_name && PHONE_RE.test(cleanPhone(customer.phone)) && !!customer.city && !!customer.address}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الزبون الكامل" required error={errors.full_name}>
            <input
              className="field"
              value={customer.full_name}
              maxLength={100}
              autoComplete="off"
              aria-invalid={!!errors.full_name}
              onChange={(e) => {
                setCustomer({ ...customer, full_name: e.target.value });
                clearError("full_name");
              }}
            />
          </Field>
          <Field label="المدينة" required error={errors.city}>
            <input
              className="field"
              value={customer.city}
              maxLength={60}
              aria-invalid={!!errors.city}
              onChange={(e) => {
                setCustomer({ ...customer, city: e.target.value });
                clearError("city");
              }}
            />
          </Field>
          <Field label="رقم الهاتف" required error={errors.phone}>
            <input
              className="field text-left ltr-nums"
              dir="ltr"
              type="tel"
              inputMode="tel"
              value={customer.phone}
              maxLength={20}
              placeholder="05X XXX XXXX"
              aria-invalid={!!errors.phone}
              onChange={(e) => {
                setCustomer({ ...customer, phone: e.target.value });
                clearError("phone");
              }}
            />
          </Field>
          <Field label="هاتف إضافي" hint="اختياري" error={errors.phone2}>
            <input
              className="field text-left ltr-nums"
              dir="ltr"
              type="tel"
              inputMode="tel"
              value={customer.phone2}
              maxLength={20}
              aria-invalid={!!errors.phone2}
              onChange={(e) => {
                setCustomer({ ...customer, phone2: e.target.value });
                clearError("phone2");
              }}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="عنوان التوصيل بالتفصيل" required error={errors.address}>
              <textarea
                className="field min-h-20"
                value={customer.address}
                maxLength={300}
                placeholder="الحي، الشارع، أقرب معلم، رقم البناية والطابق"
                aria-invalid={!!errors.address}
                onChange={(e) => {
                  setCustomer({ ...customer, address: e.target.value });
                  clearError("address");
                }}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* 2. المنتجات */}
      <Section
        n={2}
        title="المنتجات"
        icon="box"
        done={items.length > 0}
        aside={items.length > 0 ? <span className="text-sm text-muted">{modelsLabel(items.length)} · {piecesLabel(pieces)}</span> : null}
      >
        {items.length === 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-error={!!errors.items}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition hover:bg-walnut-50 ${
              errors.items ? "border-rose-300 bg-rose-50/50" : "border-line-strong"
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-walnut-100 text-walnut-700">
              <Icon name="plus" className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <span className="text-lg font-bold">اختر أول منتج من الكتالوج</span>
            <span className="text-sm text-muted">يمكنك إضافة عدة موديلات في نفس الطلبية</span>
          </button>
        )}
        {errors.items && <p className="error-text">{errors.items}</p>}

        <ul className="space-y-3">
          {items.map((item) => {
            const product = byId.get(item.product_id);
            const colors = product?.colors.filter((c) => c.is_active || c.name === item.color) ?? [];
            const itemError = errors.item?.[item.key];
            return (
              <li key={item.key} className={`rounded-2xl border p-3 sm:p-4 ${itemError ? "border-rose-300" : "border-line"}`} data-error={!!itemError}>
                <div className="flex items-start gap-3">
                  <ProductThumb url={product?.image_url} alt={product?.name ?? ""} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-bold leading-tight">{product?.name ?? "منتج"}</div>
                        <div className="mt-0.5 text-sm text-muted ltr-nums">{formatILS(Number(item.unit_price) || 0)} / قطعة</div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn -m-1.5 h-10 w-10 text-muted hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`حذف ${product?.name ?? "المنتج"}`}
                        onClick={() => setItems((xs) => xs.filter((x) => x.key !== item.key))}
                      >
                        <Icon name="trash" className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <span className="label">اللون</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="اللون">
                    {colors.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        role="radio"
                        aria-checked={item.color === c.name}
                        aria-pressed={item.color === c.name}
                        className="chip min-h-11"
                        onClick={() => {
                          updateItem(item.key, { color: c.name });
                          if (errors.item?.[item.key]) setErrors((e) => ({ ...e, item: { ...e.item, [item.key]: "" } }));
                        }}
                      >
                        {item.color === c.name && <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {itemError && <p className="error-text">{itemError}</p>}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <span className="label">الكمية</span>
                    <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-line bg-surface">
                      <button
                        type="button"
                        className="w-12 text-xl font-bold text-ink/70 hover:bg-walnut-50 disabled:opacity-30"
                        aria-label="زيادة"
                        disabled={item.quantity >= 999}
                        onClick={() => updateItem(item.key, { quantity: Math.min(999, item.quantity + 1) })}
                      >
                        +
                      </button>
                      <input
                        className="w-full min-w-0 border-x border-line text-center text-lg font-bold tabular outline-none"
                        inputMode="numeric"
                        aria-label="الكمية"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: Math.min(999, Math.max(1, Number(cleanMoney(e.target.value)) || 1)) })
                        }
                      />
                      <button
                        type="button"
                        className="w-12 text-xl font-bold text-ink/70 hover:bg-walnut-50 disabled:opacity-30"
                        aria-label="إنقاص"
                        disabled={item.quantity <= 1}
                        onClick={() => updateItem(item.key, { quantity: Math.max(1, item.quantity - 1) })}
                      >
                        −
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="label">سعر القطعة (₪)</span>
                    <input
                      className="field text-left ltr-nums"
                      dir="ltr"
                      inputMode="decimal"
                      value={item.unit_price}
                      onChange={(e) => updateItem(item.key, { unit_price: cleanMoney(e.target.value) })}
                    />
                  </label>
                  <div className="col-span-2 flex items-end sm:col-span-1">
                    <div className="flex h-12 w-full items-center justify-between rounded-xl bg-walnut-50 px-3.5">
                      <span className="text-sm text-muted">المجموع</span>
                      <span className="font-bold ltr-nums">{formatILS((Number(item.unit_price) || 0) * item.quantity)}</span>
                    </div>
                  </div>
                </div>

                {item.showNotes ? (
                  <label className="mt-3 block">
                    <span className="label">ملاحظة خاصة بالمنتج <span className="font-normal text-muted">— لا يراها المصنع</span></span>
                    <input className="field" value={item.notes} maxLength={500} autoFocus onChange={(e) => updateItem(item.key, { notes: e.target.value })} />
                  </label>
                ) : (
                  <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-walnut-700" onClick={() => updateItem(item.key, { showNotes: true })}>
                    <Icon name="note" className="h-4 w-4" />
                    إضافة ملاحظة
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {items.length > 0 && (
          <button type="button" className="btn-secondary mt-3 w-full border-dashed" onClick={() => setPickerOpen(true)}>
            <Icon name="plus" className="h-5 w-5" />
            إضافة منتج آخر
          </button>
        )}
      </Section>

      {/* 3. التسليم والدفع */}
      <Section n={3} title={isReturn ? "الموعد والرسوم" : "التسليم والدفع"} icon="truck" done={!!deliveryDate}>
        <Field label={isReturn ? "الموعد المتوقع لمعالجة المرتجع" : "موعد التسليم المتوقع"} required error={errors.date}>
          <div className="scroll-row -mx-1 mb-2 flex gap-2 overflow-x-auto px-1">
            {quickDates.map((q) => {
              const v = addDays(minDate, q.days);
              return (
                <button
                  key={q.days}
                  type="button"
                  className="chip"
                  aria-pressed={deliveryDate === v}
                  onClick={() => {
                    setDeliveryDate(v);
                    clearError("date");
                  }}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
          <input
            type="date"
            className="field"
            min={minDate}
            value={deliveryDate}
            aria-invalid={!!errors.date}
            onChange={(e) => {
              setDeliveryDate(e.target.value);
              clearError("date");
            }}
          />
          {deliveryDate && !errors.date && <p className="hint">{formatDate(deliveryDate)}</p>}
        </Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={isReturn ? "رسوم (₪)" : "رسوم التوصيل (₪)"} hint={isReturn ? "رسوم نقل أو معالجة إن وُجدت — اتركها فارغة إن لم توجد" : "اتركها فارغة إذا التوصيل مجاني"}>
            <input className="field text-left ltr-nums" dir="ltr" inputMode="decimal" placeholder="0" value={deliveryFee} onChange={(e) => setDeliveryFee(cleanMoney(e.target.value))} />
          </Field>
          {!isSubmittedEdit && !isReturn && (
            <Field label="العربون المستلم (₪)" error={errors.deposit} hint={basePath === "/sales" ? "يُحسب بعد أن يؤكد المالك استلامه" : undefined}>
              <input
                className="field text-left ltr-nums"
                dir="ltr"
                inputMode="decimal"
                placeholder="0"
                value={deposit}
                aria-invalid={!!errors.deposit}
                onChange={(e) => {
                  setDeposit(cleanMoney(e.target.value));
                  clearError("deposit");
                }}
              />
            </Field>
          )}
        </div>
      </Section>

      {/* 4. الملاحظات */}
      <Section n={4} title="ملاحظات" icon="note" optional>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ملاحظات الزبون">
            <textarea className="field min-h-20" value={customerNotes} maxLength={1000} placeholder="مثال: يفضّل التوصيل بعد العصر" onChange={(e) => setCustomerNotes(e.target.value)} />
          </Field>
          <Field label="ملاحظات داخلية">
            <textarea className="field min-h-20" value={internalNotes} maxLength={1000} placeholder="للإدارة فقط" onChange={(e) => setInternalNotes(e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-canvas p-3 text-[13px] text-muted">
          <Icon name="shield" className="h-4 w-4 shrink-0 text-walnut-600" />
          بيانات الزبون والأسعار والملاحظات لا تصل إلى المصنع.
        </p>
      </Section>

      {/* شريط الملخص الثابت */}
      <div className="no-print fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(46_29_14/0.2)] backdrop-blur md:bottom-0 md:pr-[280px]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold ltr-nums">{formatILS(total)}</span>
              <span className="text-[13px] text-muted">{isReturn ? "قيمة المرتجع" : "المجموع"}</span>
            </div>
            <div className="truncate text-[13px] text-muted">
              {isReturn ? (
                <>{modelsLabel(items.length)} · {piecesLabel(pieces)}</>
              ) : (
                <>
                  {isSubmittedEdit ? "مدفوع" : "عربون"} <span className="ltr-nums">{formatILS(paid)}</span> · المتبقي{" "}
                  <span className={`font-semibold ltr-nums ${remaining < 0 ? "text-rose-700" : "text-ink"}`}>{formatILS(remaining)}</span>
                </>
              )}
              {savedAt && <span> · حُفظت {savedAt}</span>}
            </div>
          </div>
          {isSubmittedEdit ? (
            <button type="button" className="btn-primary" disabled={pending} onClick={onSaveDraft}>
              {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary hidden sm:inline-flex" disabled={pending} onClick={onSaveDraft}>
                حفظ كمسودة
              </button>
              <button type="button" className="btn-ghost btn-sm sm:hidden" disabled={pending} onClick={onSaveDraft} aria-label="حفظ كمسودة">
                <Icon name="note" className="h-5 w-5" />
                مسودة
              </button>
              <button type="button" className="btn-primary" disabled={pending} onClick={onSubmit}>
                {pending ? "جارٍ الإرسال…" : "إرسال"}
                {!pending && <Icon name="chevronLeft" className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {pickerOpen && (
        <ProductPicker
          products={activeProducts}
          onPick={addProduct}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  );
}

function ProductPicker({
  products,
  onPick,
  onClose,
}: {
  products: CatalogProduct[];
  onPick: (p: CatalogProduct) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label="اختيار منتج">
      <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-walnut-900/40" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-2xl animate-sheet-up flex-col rounded-t-3xl bg-surface shadow-[var(--shadow-sheet)] md:rounded-3xl">
        <div className="border-b border-line p-4">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">اختر منتجاً</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
              <Icon name="x" className="h-6 w-6" />
            </button>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-faint">
              <Icon name="search" className="h-5 w-5" />
            </span>
            <input className="field pr-11" placeholder="ابحث باسم الموديل" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {list.length === 0 ? (
            <p className="py-10 text-center text-muted">{products.length ? "لا يوجد موديل بهذا الاسم." : "لا توجد موديلات في الكتالوج بعد. اطلب من المالك إضافتها."}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} className="card-interactive w-full overflow-hidden p-2 text-right">
                    <ProductThumb url={p.image_url} alt={p.name} size="fill" />
                    <div className="px-1 pb-1 pt-2">
                      <div className="truncate font-bold">{p.name}</div>
                      <div className="text-sm text-muted ltr-nums">{formatILS(p.standard_price)}</div>
                      <div className="mt-1 truncate text-xs text-faint">{p.colors.filter((c) => c.is_active).map((c) => c.name).join("، ")}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  icon,
  done,
  optional,
  aside,
  children,
}: {
  n: number;
  title: string;
  icon: IconName;
  done?: boolean;
  optional?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              done ? "bg-emerald-600 text-white" : "bg-walnut-100 text-walnut-700"
            }`}
            aria-hidden="true"
          >
            {done ? <Icon name="check" className="h-4 w-4" strokeWidth={2.8} /> : n}
          </span>
          {title}
          {optional && <span className="text-sm font-normal text-muted">(اختياري)</span>}
        </h2>
        {aside ?? <Icon name={icon} className="h-5 w-5 text-faint" />}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">
        {label}
        {required && <span className="text-rose-600"> *</span>}
        {hint && <span className="font-normal text-muted"> — {hint}</span>}
      </span>
      {children}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
