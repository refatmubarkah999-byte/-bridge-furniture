import { createClient } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/catalog";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductForm } from "./ProductForm";
import { formatILS } from "@/lib/format";
import { t } from "@/i18n";

export const metadata = { title: "الكتالوج" };

export default async function ProductsPage() {
  const supabase = await createClient();
  const products = await loadCatalog(supabase);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">{t.nav.products}</h1>

      <details className="card p-4" open={products.length === 0}>
        <summary className="cursor-pointer text-lg font-bold">+ إضافة موديل جديد</summary>
        <div className="mt-4">
          <ProductForm />
        </div>
      </details>

      <ul className="space-y-3">
        {products.map((p) => (
          <li key={p.id} className={`card p-4 ${p.is_active ? "" : "opacity-70"}`}>
            <div className="flex items-center gap-4">
              <ProductThumb url={p.image_url} alt={p.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{p.name}</span>
                  {!p.is_active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">متوقف</span>}
                </div>
                <div className="text-sm text-muted ltr-nums">{formatILS(p.standard_price)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.colors.filter((c) => c.is_active).map((c) => (
                    <span key={c.name} className="rounded-full bg-walnut-50 px-2 py-0.5 text-xs ring-1 ring-line">{c.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-walnut-700">تعديل</summary>
              <div className="mt-3">
                <ProductForm product={p} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
