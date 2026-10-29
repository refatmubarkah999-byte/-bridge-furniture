import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { FinanceNav } from "@/components/finance/FinanceNav";
import { CostRow } from "@/components/finance/CostRow";
import { signImagePaths } from "@/lib/images";

export const metadata = { title: "التكاليف" };

type Row = { product_id: string; name: string; standard_price: number; cost_price: number | null; is_active: boolean; image_path: string | null };

export default async function CostsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_product_costs");
  const rows = (data ?? []) as Row[];
  const images = await signImagePaths(supabase, rows.map((r) => r.image_path));
  const missing = rows.filter((r) => r.is_active && r.cost_price === null).length;

  return (
    <div className="page max-w-3xl">
      <PageHeader title="التكاليف" subtitle={missing ? `${missing} موديل بدون تكلفة` : "كل الموديلات لها تكلفة"} />
      <FinanceNav active="costs" />
      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-canvas p-3.5 text-sm text-muted ring-1 ring-line">
        <Icon name="note" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
        اكتب تكلفة القطعة الواحدة من كل موديل (خشب، قماش، إسفنج، شغل). التكلفة تُحفظ مع كل طلبية جديدة، فلو غيّرتها لاحقاً لا تتغير أرباح الطلبيات السابقة.
        موظفو المبيعات والمصنع لا يرون التكاليف أبداً.
      </p>
      {rows.length === 0 ? (
        <EmptyState icon="box" title="لا موديلات بعد" text="أضف الموديلات من صفحة الموديلات أولاً." />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <CostRow
              key={r.product_id}
              productId={r.product_id}
              name={r.name}
              price={Number(r.standard_price)}
              cost={r.cost_price === null ? null : Number(r.cost_price)}
              active={r.is_active}
              image={r.image_path ? images[r.image_path] ?? null : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
