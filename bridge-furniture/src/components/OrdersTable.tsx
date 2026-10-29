import { ReturnBadge } from "@/components/ReturnBadge";
import Link from "next/link";
import { StatusBadge, DueChip } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { daysUntil, formatDate, formatILS } from "@/lib/format";
import { t } from "@/i18n";
import type { OrderRow } from "@/lib/types";

/** جدول على الكمبيوتر، وبطاقات على الهاتف */
export function OrdersTable({
  rows,
  hrefBase,
  timeZone,
  showSales = true,
  empty,
}: {
  rows: OrderRow[];
  hrefBase: string;
  timeZone: string;
  showSales?: boolean;
  empty?: { title: string; text?: string; action?: React.ReactNode };
}) {
  if (!rows.length) return <EmptyState icon="inbox" title={empty?.title ?? t.common.noResults} text={empty?.text} action={empty?.action} />;
  const closed = (r: OrderRow) => r.status === "delivered" || r.status === "cancelled" || r.status === "draft";

  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead className="border-b border-line bg-canvas/70 text-right text-[13px] text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">{t.common.orderNumber}</th>
                <th className="px-4 py-3 font-semibold">الزبون</th>
                <th className="px-4 py-3 font-semibold">المنتجات</th>
                <th className="px-4 py-3 font-semibold">{t.common.deliveryDate}</th>
                {showSales && <th className="px-4 py-3 font-semibold">الموظف</th>}
                <th className="px-4 py-3 font-semibold">المجموع</th>
                <th className="px-4 py-3 font-semibold">المتبقي</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const days = daysUntil(r.expected_delivery_date, timeZone);
                return (
                  <tr key={r.order_id} className="group relative transition hover:bg-walnut-50/60">
                    <td className="px-4 py-3.5 font-bold">
                      <Link href={`${hrefBase}/${r.order_id}`} className="ltr-nums after:absolute after:inset-0 group-hover:text-walnut-700">
                        {r.order_number ?? "مسودة"}
                      </Link>
                      {r.kind === "return" && <div className="mt-1"><ReturnBadge small /></div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold">{r.customer_name || "—"}</div>
                      <div className="text-[13px] text-muted">
                        {r.city}
                        {r.customer_phone && <> · <span className="ltr-nums">{r.customer_phone}</span></>}
                      </div>
                    </td>
                    <td className="max-w-56 truncate px-4 py-3.5 text-muted" title={r.models ?? ""}>{r.models ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className={r.is_delayed ? "font-semibold text-rose-700" : ""}>{formatDate(r.expected_delivery_date)}</div>
                      <div className="mt-1"><DueChip days={days} done={closed(r)} /></div>
                    </td>
                    {showSales && <td className="px-4 py-3.5 text-ink/80">{r.sales_name}</td>}
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold ltr-nums">{formatILS(r.total)}</td>
                    <td className={`whitespace-nowrap px-4 py-3.5 ltr-nums ${r.kind !== "return" && Number(r.remaining) > 0 ? "font-semibold text-amber-800" : "text-muted"}`}>
                      {r.kind === "return" ? "—" : formatILS(r.remaining)}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((r) => {
          const days = daysUntil(r.expected_delivery_date, timeZone);
          return (
            <li key={r.order_id}>
              <Link href={`${hrefBase}/${r.order_id}`} className={`card-interactive block p-4 ${r.is_delayed ? "border-rose-200" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-bold leading-tight ltr-nums">{r.order_number ?? "مسودة"}</div>
                    <div className="mt-1 truncate font-semibold">{r.customer_name || "بدون اسم"}</div>
                    <div className="truncate text-[13px] text-muted">{[r.city, r.models].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {r.kind === "return" && <ReturnBadge small />}
                    <StatusBadge status={r.status} />
                    <DueChip days={days} done={closed(r)} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                  <span className={`inline-flex items-center gap-1.5 ${r.is_delayed ? "font-semibold text-rose-700" : "text-muted"}`}>
                    <Icon name="calendar" className="h-4 w-4" />
                    {formatDate(r.expected_delivery_date)}
                  </span>
                  <span className="shrink-0 text-left leading-tight">
                    <span className="block font-bold ltr-nums">{formatILS(r.total)}</span>
                    {r.kind === "return" ? (
                      <span className="mt-0.5 block text-[12px] text-violet-800">قيمة المرتجع</span>
                    ) : Number(r.remaining) > 0 ? (
                      <span className="mt-0.5 block text-[12px] text-amber-800">متبقي <span className="ltr-nums font-semibold">{formatILS(r.remaining)}</span></span>
                    ) : r.status !== "draft" && r.status !== "cancelled" && Number(r.total) > 0 ? (
                      <span className="mt-0.5 block text-[12px] text-emerald-700">مدفوعة بالكامل</span>
                    ) : null}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
