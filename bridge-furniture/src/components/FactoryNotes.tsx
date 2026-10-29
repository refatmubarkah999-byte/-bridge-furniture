import { Icon } from "@/components/Icon";

/** ملاحظات الطلبية كما يراها المصنع */
export function FactoryNotes({
  customerNotes,
  internalNotes,
  compact = false,
}: {
  customerNotes?: string | null;
  internalNotes?: string | null;
  compact?: boolean;
}) {
  if (!customerNotes && !internalNotes) return null;
  const rows = [
    customerNotes ? { k: "ملاحظات الزبون", v: customerNotes } : null,
    internalNotes ? { k: "ملاحظات داخلية", v: internalNotes } : null,
  ].filter(Boolean) as { k: string; v: string }[];
  return (
    <div className={`rounded-2xl bg-amber-50 ring-1 ring-amber-200 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
        <Icon name="note" className="h-4 w-4" />
        ملاحظات
      </div>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.k}>
            <dt className="text-[12px] font-semibold text-amber-900/80">{r.k}</dt>
            <dd className={`whitespace-pre-line text-ink ${compact ? "text-[14px]" : "text-[15px]"}`}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
