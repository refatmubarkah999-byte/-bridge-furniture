import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { FinanceNav } from "@/components/finance/FinanceNav";
import { PaymentStatusBadge } from "@/components/PaymentBits";
import { ReviewPaymentButtons } from "@/components/ReviewPaymentButtons";
import { formatDateTime, formatILS } from "@/lib/format";
import { orderHref } from "@/lib/nav";
import { t } from "@/i18n";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

export const metadata = { title: "الدفعات" };

type PaymentRow = {
  payment_id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  amount: number;
  kind: "deposit" | "payment";
  method: PaymentMethod;
  note: string | null;
  status: PaymentStatus;
  paid_at: string;
  recorded_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  order_remaining: number;
};

const TABS: { key: PaymentStatus | "all"; label: string }[] = [
  { key: "pending", label: "بانتظار التأكيد" },
  { key: "confirmed", label: "مؤكدة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "all", label: "الكل" },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const profile = await requireRole("super_admin", "accountant");
  const settings = await getSettings();
  const tab = (TABS.find((x) => x.key === sp.tab)?.key ?? "pending") as PaymentStatus | "all";
  const supabase = await createClient();
  const [listRes, pendingRes] = await Promise.all([
    supabase.rpc("finance_payments", { p_status: tab === "all" ? null : tab, p_limit: 150 }),
    supabase.rpc("finance_payments", { p_status: "pending", p_limit: 300 }),
  ]);
  const rows = (listRes.data ?? []) as PaymentRow[];
  const pendingRows = (pendingRes.data ?? []) as PaymentRow[];
  const pendingTotal = pendingRows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="الدفعات"
        subtitle={pendingRows.length ? `${pendingRows.length} بانتظار التأكيد · ${formatILS(pendingTotal)}` : "لا دفعات تنتظر التأكيد"}
      />
      <FinanceNav active="payments" pending={pendingRows.length} />

      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-canvas p-3.5 text-sm text-muted ring-1 ring-line">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
        الدفعات التي يسجّلها موظفو المبيعات لا تُخصم من حساب الزبون إلا بعد تأكيدك أن المبلغ وصل فعلاً.
      </p>

      <nav className="scroll-row -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TABS.map((x) => (
          <Link key={x.key} href={`/finance/payments?tab=${x.key}`} aria-current={tab === x.key ? "page" : undefined} className="chip">
            {x.label}
            {x.key === "pending" && pendingRows.length > 0 && <span className="chip-count">{pendingRows.length}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={tab === "pending" ? "checkCircle" : "wallet"}
          title={tab === "pending" ? "كل الدفعات مؤكدة" : "لا توجد دفعات"}
          text={tab === "pending" ? "عندما يسجّل موظف دفعة استلمها من زبون، ستظهر هنا لتؤكدها." : "لا دفعات في هذا القسم."}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.payment_id} className={`card p-4 ${r.status === "pending" ? "border-amber-300" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xl font-bold ltr-nums ${r.status === "rejected" ? "text-muted line-through" : ""}`}>{formatILS(r.amount)}</span>
                    <PaymentStatusBadge status={r.status} />
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[12px] font-semibold ring-1 ring-line">{t.paymentMethod[r.method]}</span>
                    {r.kind === "deposit" && <span className="text-[12px] text-muted">عربون</span>}
                  </div>
                  <div className="mt-1 text-[14px]">
                    <Link href={orderHref(profile.role, r.order_id)} className="font-semibold text-walnut-700 underline-offset-2 hover:underline">
                      <span className="ltr-nums">{r.order_number}</span>
                    </Link>
                    {r.customer_name && <> · {r.customer_name}</>}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    سجّلها {r.recorded_by} · {formatDateTime(r.paid_at, settings.timezone)}
                  </div>
                  {r.note && <div className="mt-1 text-[13px]">“{r.note}”</div>}
                  {r.status !== "pending" && r.reviewed_by && (
                    <div className="mt-1 text-[12px] text-muted">
                      {r.status === "confirmed" ? "أكّدها" : "رفضها"} {r.reviewed_by}
                      {r.reviewed_at ? ` · ${formatDateTime(r.reviewed_at, settings.timezone)}` : ""}
                      {r.review_note ? ` — ${r.review_note}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-left text-[12px] text-muted">
                  المتبقي على الطلبية
                  <div className="text-[15px] font-bold text-ink ltr-nums">{formatILS(r.order_remaining)}</div>
                </div>
              </div>
              {r.status === "pending" && (
                <div className="mt-3 border-t border-line pt-3">
                  <ReviewPaymentButtons paymentId={r.payment_id} amount={Number(r.amount)} recordedBy={r.recorded_by} compact />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

