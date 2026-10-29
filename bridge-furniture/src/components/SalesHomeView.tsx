import Link from "next/link";
import { OrdersTable } from "@/components/OrdersTable";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import type { OrderRow } from "@/lib/types";
import { t } from "@/i18n";

export function SalesHomeView({
  name,
  tab,
  q,
  sent,
  drafts,
  timeZone,
  variant = "sales",
}: {
  /** sales = طلبيات عادية، returns = لوحة موظف المرتجعات */
  variant?: "sales" | "returns";
  name: string;
  tab: "sent" | "drafts";
  q?: string;
  sent: OrderRow[];
  drafts: OrderRow[];
  timeZone: string;
}) {
  const first = name.trim().split(/\s+/)[0];
  const open = sent.filter((r) => r.status !== "delivered" && r.status !== "cancelled").length;
  const ready = sent.filter((r) => r.status === "ready" || r.status === "out_for_delivery").length;
  const rows = tab === "drafts" ? drafts : sent;
  const R = variant === "returns";
  const base = R ? "/returns" : "/sales";
  const L = R
    ? { subtitle: "المرتجعات التي أدخلتها وحالتها", newTitle: t.nav.newReturn, newSub: "الزبون، المنتجات والأسعار — وإرسال للمالك", open: "قيد المعالجة", ready: "جاهزة", noneTitle: "لم تُدخل أي مرتجع بعد", noneText: "أدخل أول مرتجع، وستتابع حالته هنا.", search: "رقم المرتجع، اسم الزبون، الهاتف" }
    : { subtitle: "طلبياتك وحالتها لحظة بلحظة", newTitle: t.nav.newOrder, newSub: "زبون، منتجات، موعد تسليم — وإرسال", open: "قيد التنفيذ", ready: "جاهزة / بالطريق", noneTitle: "لم ترسل أي طلبية بعد", noneText: "ابدأ أول طلبية، وستتابع حالتها هنا حتى التسليم.", search: "رقم الطلبية، اسم الزبون، الهاتف" };

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title={`أهلاً ${first}`}
        subtitle={L.subtitle}
        actions={
          <Link href={`${base}/orders/new`} className="btn-primary hidden md:inline-flex">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
            {L.newTitle}
          </Link>
        }
      />

      <Link
        href={`${base}/orders/new`}
        className="mb-5 flex items-center gap-4 rounded-3xl bg-walnut-700 p-5 text-white shadow-[var(--shadow-raised)] transition active:scale-[0.99] md:hidden"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <Icon name="plus" className="h-7 w-7" strokeWidth={2.2} />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-bold">{L.newTitle}</span>
          <span className="block text-sm text-walnut-100">{L.newSub}</span>
        </span>
        <Icon name="chevronLeft" className="h-6 w-6 opacity-70" />
      </Link>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={L.open} value={open} />
        <Stat label={L.ready} value={ready} />
        <Stat label="مسودات" value={drafts.length} warn={drafts.length > 0} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={base} aria-current={tab === "sent" ? "page" : undefined} className="chip">
          المرسلة <span className="chip-count">{sent.length}</span>
        </Link>
        <Link href={`${base}?tab=drafts`} aria-current={tab === "drafts" ? "page" : undefined} className="chip">
          المسودات <span className="chip-count">{drafts.length}</span>
        </Link>
      </div>
      <form className="mb-4 flex gap-2" role="search">
        {tab === "drafts" && <input type="hidden" name="tab" value="drafts" />}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-faint">
            <Icon name="search" className="h-5 w-5" />
          </span>
          <input name="q" defaultValue={q} placeholder={L.search} className="field pr-11" />
        </div>
        <button className="btn-secondary px-4">{t.common.search}</button>
      </form>

      <OrdersTable
        rows={rows}
        hrefBase={`${base}/orders`}
        timeZone={timeZone}
        showSales={false}
        empty={
          tab === "drafts"
            ? { title: "لا توجد مسودات", text: "إذا حفظت طلبية قبل إرسالها، تجدها هنا." }
            : q
              ? { title: t.common.noResults, text: "جرّب كلمة أخرى." }
              : {
                  title: L.noneTitle,
                  text: L.noneText,
                  action: <Link href={`${base}/orders/new`} className="btn-primary">{L.newTitle}</Link>,
                }
        }
      />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`card p-3.5 ${warn ? "border-amber-200 bg-amber-50/60" : ""}`}>
      <div className="text-2xl font-bold leading-none tabular">{value}</div>
      <div className="mt-1.5 text-[12px] text-muted">{label}</div>
    </div>
  );
}
