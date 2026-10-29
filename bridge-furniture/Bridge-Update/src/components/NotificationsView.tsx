import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/Bits";
import { Icon, type IconName } from "@/components/Icon";
import { todayInTz } from "@/lib/format";
import { locale } from "@/i18n";

export type NotificationRow = { id: number; type: string; order_id: string | null; title: string; body: string; read_at: string | null; created_at: string };

const TYPE: Record<string, { icon: IconName; cls: string }> = {
  order_new: { icon: "sparkle", cls: "bg-sky-50 text-sky-700" },
  order_acknowledged: { icon: "inbox", cls: "bg-indigo-50 text-indigo-700" },
  status_changed: { icon: "refresh", cls: "bg-walnut-50 text-walnut-700" },
  order_ready: { icon: "box", cls: "bg-emerald-50 text-emerald-700" },
  order_delayed: { icon: "alert", cls: "bg-rose-600 text-white" },
  order_cancelled: { icon: "ban", cls: "bg-rose-50 text-rose-700" },
  payment_pending: { icon: "wallet", cls: "bg-amber-100 text-amber-900" },
  payment_confirmed: { icon: "checkCircle", cls: "bg-emerald-50 text-emerald-700" },
  payment_rejected: { icon: "ban", cls: "bg-rose-50 text-rose-700" },
};

export function NotificationsView({
  items,
  timeZone,
  hrefFor,
  markAll,
}: {
  items: NotificationRow[];
  timeZone: string;
  hrefFor: (orderId: string) => string;
  markAll?: () => Promise<void>;
}) {
  const unread = items.filter((n) => !n.read_at).length;
  const today = todayInTz(timeZone);
  const yesterday = todayInTz(timeZone, -1);
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const groups = new Map<string, NotificationRow[]>();
  for (const n of items) {
    const d = dayOf(n.created_at);
    groups.set(d, [...(groups.get(d) ?? []), n]);
  }
  const dayLabel = (d: string) =>
    d === today
      ? "اليوم"
      : d === yesterday
        ? "أمس"
        : new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T00:00:00Z`));
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="الإشعارات"
        subtitle={unread ? `${unread} غير مقروءة` : "لا جديد"}
        actions={
          unread > 0 && markAll ? (
            <form action={markAll}>
              <button className="btn-secondary btn-sm">
                <Icon name="check" className="h-4 w-4" />
                تعليم الكل كمقروء
              </button>
            </form>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState icon="bell" title="لا توجد إشعارات بعد" text="ستصلك هنا الطلبيات الجديدة وتغييرات الحالة فور حدوثها." />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([d, list]) => (
            <section key={d}>
              <h2 className="mb-2 px-1 text-sm font-bold text-muted">{dayLabel(d)}</h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.map((n) => {
                  const ty = TYPE[n.type] ?? TYPE.status_changed;
                  const content = (
                    <div className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-walnut-50/50"}`}>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ty.cls}`}>
                        <Icon name={ty.icon} className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`font-bold ${n.type === "order_delayed" || n.type === "order_cancelled" ? "text-rose-700" : ""}`}>{n.title}</div>
                          <div className="shrink-0 text-xs text-muted">{time(n.created_at)}</div>
                        </div>
                        <div className="mt-0.5 text-[15px] text-ink/75">{n.body}</div>
                      </div>
                      {!n.read_at && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-walnut-600" aria-label="غير مقروء" />}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.order_id ? (
                        <Link href={hrefFor(n.order_id)} className="block transition hover:bg-canvas">{content}</Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
