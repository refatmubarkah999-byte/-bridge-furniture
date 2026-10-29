import Link from "next/link";
import { StatusBadge, DelayedBadge } from "@/components/StatusBadge";
import { formatDate, formatILS } from "@/lib/format";
import { t } from "@/i18n";
import type { OrderRow } from "@/lib/types";

/** جدول على الكمبيوتر، وبطاقات على الهاتف */
export function OrdersTable({ rows, hrefBase, showSales = true }: { rows: OrderRow[]; hrefBase: string; showSales?: boolean }) {
  if (!rows.length) return <p className="card p-10 text-center text-muted">{t.common.noResults}</p>;
  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-walnut-50 text-right text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t.common.orderNumber}</th>
              <th className="px-4 py-3 font-medium">الزبون</th>
              <th className="px-4 py-3 font-medium">المنتجات</th>
              <th className="px-4 py-3 font-medium">{t.common.deliveryDate}</th>
              {showSales && <th className="px-4 py-3 font-medium">الموظف</th>}
              <th className="px-4 py-3 font-medium">المجموع</th>
              <th className="px-4 py-3 font-medium">المتبقي</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.order_id} className="hover:bg-walnut-50/60">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`${hrefBase}/${r.order_id}`} className="ltr-nums hover:underline">{r.order_number ?? "مسودة"}</Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.customer_name || "—"}</div>
                  <div className="text-xs text-muted">{r.city} <span className="ltr-nums">{r.customer_phone}</span></div>
                </td>
                <td className="max-w-56 truncate px-4 py-3 text-muted" title={r.models ?? ""}>{r.models ?? "—"}</td>
                <td className={`px-4 py-3 ${r.is_delayed ? "font-semibold text-rose-700" : ""}`}>{formatDate(r.expected_delivery_date)}</td>
                {showSales && <td className="px-4 py-3">{r.sales_name}</td>}
                <td className="px-4 py-3 ltr-nums">{formatILS(r.total)}</td>
                <td className={`px-4 py-3 ltr-nums ${Number(r.remaining) > 0 ? "text-rose-700" : ""}`}>{formatILS(r.remaining)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.is_delayed && <DelayedBadge />}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.order_id}>
            <Link href={`${hrefBase}/${r.order_id}`} className="card block p-4 active:bg-walnut-50">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-lg font-bold ltr-nums">{r.order_number ?? "مسودة"}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="font-medium">{r.customer_name || "—"} <span className="text-sm text-muted">— {r.city}</span></div>
              <div className="truncate text-sm text-muted">{r.models}</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className={r.is_delayed ? "font-semibold text-rose-700" : "text-muted"}>
                  {formatDate(r.expected_delivery_date)} {r.is_delayed && "· متأخرة"}
                </span>
                <span className="ltr-nums font-semibold">{formatILS(r.total)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
