import Link from "next/link";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { navFor, orderHref } from "@/lib/nav";
import { formatDateTime } from "@/lib/format";
import { markAllReadAction } from "@/app/actions/notifications";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإشعارات" };

type Notification = { id: number; type: string; order_id: string | null; title: string; body: string; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const profile = await requireRole("super_admin", "factory_admin", "sales");
  const settings = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, order_id, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <AppShell profile={profile} nav={navFor(profile.role)}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t.nav.notifications}</h1>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button className="btn-secondary text-sm">تعليم الكل كمقروء</button>
            </form>
          )}
        </div>
        {items.length === 0 ? (
          <p className="card p-8 text-center text-muted">لا توجد إشعارات بعد.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {items.map((n) => {
              const content = (
                <div className="flex items-start gap-3 p-4">
                  <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-walnut-500"}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${n.type === "order_delayed" || n.type === "order_cancelled" ? "text-rose-700" : ""}`}>{n.title}</div>
                    <div className="text-sm text-muted">{n.body}</div>
                    <div className="mt-1 text-xs text-muted">{formatDateTime(n.created_at, settings.timezone)}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.order_id ? (
                    <Link href={orderHref(profile.role, n.order_id)} className="block hover:bg-walnut-50">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
