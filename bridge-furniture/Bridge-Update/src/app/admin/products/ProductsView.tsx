import { ProductThumb } from "@/components/ProductThumb";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { ProductForm } from "./ProductForm";
import { formatILS, modelsLabel } from "@/lib/format";
import { t } from "@/i18n";
import type { CatalogProduct } from "@/lib/types";

export function ProductsView({ products }: { products: CatalogProduct[] }) {
  const active = products.filter((p) => p.is_active);
  const missingImages = active.filter((p) => !p.image_url).length;
  return (
    <div className="page">
      <PageHeader
        title={t.nav.products}
        subtitle={`${active.length} موديل متاح${products.length > active.length ? ` · ${products.length - active.length} متوقف` : ""}`}
      />

      {missingImages > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900">
          <Icon name="image" className="mt-0.5 h-4 w-4 shrink-0" />
          {missingImages === 1 ? "موديل واحد" : modelsLabel(missingImages)} بدون صورة. الصورة تساعد المصنع على تجهيز الموديل الصحيح — أضفها من «تعديل».
        </p>
      )}

      <details className="card mb-5 overflow-hidden" open={products.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-bold hover:bg-walnut-50">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-walnut-600 text-white">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
          </span>
          إضافة موديل جديد
        </summary>
        <div className="border-t border-line p-4">
          <ProductForm />
        </div>
      </details>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <li key={p.id} className={`card overflow-hidden ${p.is_active ? "" : "opacity-70"}`}>
            <div className="flex gap-4 p-4">
              <ProductThumb url={p.image_url} alt={p.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate text-lg font-bold">{p.name}</h2>
                  {!p.is_active && <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold">متوقف</span>}
                </div>
                <div className="mt-0.5 font-semibold text-walnut-700 ltr-nums">{formatILS(p.standard_price)}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.colors.filter((c) => c.is_active).map((c) => (
                    <span key={c.name} className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium ring-1 ring-line">{c.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <details className="border-t border-line">
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 py-3 text-sm font-semibold text-walnut-700 hover:bg-walnut-50">
                <Icon name="edit" className="h-4 w-4" />
                تعديل
              </summary>
              <div className="border-t border-line p-4">
                <ProductForm product={p} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
