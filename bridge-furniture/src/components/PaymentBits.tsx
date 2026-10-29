import { Icon, type IconName } from "@/components/Icon";
import { t } from "@/i18n";
import type { PaymentStatus } from "@/lib/types";

const STYLE: Record<PaymentStatus, { cls: string; icon: IconName }> = {
  pending: { cls: "bg-amber-100 text-amber-900", icon: "clock" },
  confirmed: { cls: "bg-emerald-50 text-emerald-800", icon: "checkCircle" },
  rejected: { cls: "bg-rose-50 text-rose-700", icon: "ban" },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const s = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      <Icon name={s.icon} className="h-3.5 w-3.5" />
      {t.paymentStatus[status]}
    </span>
  );
}
