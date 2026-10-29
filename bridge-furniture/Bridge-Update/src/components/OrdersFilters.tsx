import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ORDER_FLOW, type OrderStatus } from "@/lib/types";
import { t } from "@/i18n";

const STATUSES: OrderStatus[] = [...ORDER_FLOW, "cancelled", "draft"];

/** فلاتر جدول الطلبيات للمالك: بحث دائم الظهور + فلاتر إضافية قابلة للطي */
export function OrdersFilters({
  sp,
  sales,
}: {
  sp: { q?: string; status?: string; from?: string; to?: string; sales?: string; delayed?: string; kind?: string };
  sales: { id: string; full_name: string }[];
}) {
  const active = [sp.status, sp.from, sp.to, sp.sales, sp.delayed, sp.kind].filter(Boolean).length;
  const quick: { key: string; label: string; href: string; on: boolean }[] = [
    { key: "all", label: "الكل", href: "/admin/orders", on: !sp.status && !sp.delayed && !sp.kind },
    { key: "new", label: t.status.new, href: "/admin/orders?status=new", on: sp.status === "new" },
    { key: "delayed", label: "متأخرة", href: "/admin/orders?delayed=1", on: sp.delayed === "1" && !sp.status },
    { key: "ready", label: t.status.ready, href: "/admin/orders?status=ready", on: sp.status === "ready" },
    { key: "returns", label: "المرتجعات", href: "/admin/orders?kind=return", on: sp.kind === "return" && !sp.status && !sp.delayed },
    { key: "draft", label: "المسودات", href: "/admin/orders?status=draft", on: sp.status === "draft" },
  ];

  return (
    <div className="mb-4 space-y-3">
      <form className="flex gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {sp.delayed && <input type="hidden" name="delayed" value={sp.delayed} />}
        {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-faint">
            <Icon name="search" className="h-5 w-5" />
          </span>
          <input name="q" defaultValue={sp.q} placeholder="رقم الطلبية، اسم الزبون، الهاتف، المدينة، الموديل" className="field pr-11" />
        </div>
        <button className="btn-primary px-4">{t.common.search}</button>
      </form>

      <div className="flex items-center gap-2">
        <nav className="scroll-row -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="فلاتر سريعة">
          {quick.map((f) => (
            <Link key={f.key} href={f.href} aria-current={f.on ? "page" : undefined} className="chip">
              {f.label}
            </Link>
          ))}
        </nav>
        <details className="relative">
          <summary className={`chip list-none ${active ? "border-walnut-500 text-walnut-700" : ""}`}>
            <Icon name="sliders" className="h-4 w-4" />
            فلاتر{active ? ` (${active})` : ""}
          </summary>
          <form className="absolute left-0 z-20 mt-2 w-[min(92vw,22rem)] space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-raised)]">
            {sp.q && <input type="hidden" name="q" value={sp.q} />}
            <label className="block">
              <span className="label">الحالة</span>
              <select name="status" defaultValue={sp.status ?? ""} className="field">
                <option value="">كل الحالات (عدا المسودات)</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t.status[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">النوع</span>
              <select name="kind" defaultValue={sp.kind ?? ""} className="field">
                <option value="">الطلبيات والمرتجعات</option>
                <option value="regular">الطلبيات العادية فقط</option>
                <option value="return">المرتجعات فقط</option>
              </select>
            </label>
            <label className="block">
              <span className="label">الموظف</span>
              <select name="sales" defaultValue={sp.sales ?? ""} className="field">
                <option value="">كل الموظفين</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="label">أُرسلت من</span><input type="date" name="from" defaultValue={sp.from} className="field px-2" /></label>
              <label className="block"><span className="label">إلى</span><input type="date" name="to" defaultValue={sp.to} className="field px-2" /></label>
            </div>
            <label className="flex items-center gap-2.5 py-1 text-[15px]">
              <input type="checkbox" name="delayed" value="1" defaultChecked={sp.delayed === "1"} className="h-5 w-5 accent-walnut-600" />
              المتأخرة فقط
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/admin/orders" className="btn-secondary">مسح</Link>
              <button className="btn-primary">تطبيق</button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}
