import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { NotificationsView, type NotificationRow } from "@/components/NotificationsView";
import { navFor, orderHref } from "@/lib/nav";
import { markAllReadAction } from "@/app/actions/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإشعارات" };

export default async function NotificationsPage() {
  const profile = await requireRole("super_admin", "factory_admin", "sales", "accountant", "returns");
  const settings = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, order_id, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const role = profile.role;

  return (
    <AppShell profile={profile} nav={navFor(role)}>
      <NotificationsView
        items={(data ?? []) as NotificationRow[]}
        timeZone={settings.timezone}
        hrefFor={(id) => orderHref(role, id)}
        markAll={markAllReadAction}
      />
    </AppShell>
  );
}
