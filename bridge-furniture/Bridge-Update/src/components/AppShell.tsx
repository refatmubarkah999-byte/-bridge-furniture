import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/actions/auth";
import { BrandMark } from "@/components/BrandMark";
import { SideNav, BottomNav } from "@/components/NavLinks";
import { LiveUpdates } from "@/components/LiveUpdates";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui/Bits";
import type { NavConfig } from "@/lib/nav";
import { t } from "@/i18n";
import type { Profile } from "@/lib/types";

export async function AppShell({ profile, nav, children }: { profile: Profile; nav: NavConfig; children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ count }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("touch_last_seen"),
  ]);
  return (
    <AppShellView profile={profile} nav={nav} unread={count ?? 0} logout={logoutAction}>
      {children}
      <LiveUpdates role={profile.role} userId={profile.id} />
    </AppShellView>
  );
}

/** الهيكل المرئي فقط (بدون جلب بيانات) */
export function AppShellView({
  profile,
  nav,
  unread,
  logout,
  children,
}: {
  profile: Pick<Profile, "full_name" | "role">;
  nav: NavConfig;
  unread: number;
  logout?: () => Promise<void>;
  children: React.ReactNode;
}) {
  const userCard = (
    <div className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
      <Avatar name={profile.full_name} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-semibold">{profile.full_name}</div>
        <div className="text-[13px] text-muted">{t.roles[profile.role]}</div>
      </div>
      <form action={logout}>
        <button className="icon-btn" aria-label={t.nav.logout} title={t.nav.logout}>
          <Icon name="logout" className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="no-print hidden w-[264px] shrink-0 border-l border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col p-4">
          <Link href="/" className="mb-7 flex items-center gap-3 px-1.5 pt-1">
            <BrandMark className="h-10 w-10" />
            <div className="leading-tight">
              <div className="text-[17px] font-bold">{t.appName}</div>
              <div className="text-[13px] text-muted">{t.appTagline}</div>
            </div>
          </Link>
          <SideNav nav={nav} unread={unread} />
          <div className="mt-auto pt-4">{userCard}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <div className="leading-tight">
              <div className="font-bold">{t.appName}</div>
              <div className="text-xs text-muted">{t.roles[profile.role]}</div>
            </div>
          </Link>
          <Link
            href="/notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface"
            aria-label={`${t.nav.notifications}${unread ? ` (${unread})` : ""}`}
          >
            <Icon name="bell" className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -left-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-surface">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>

        <main className="flex-1 px-4 pb-32 pt-5 md:px-8 md:pb-12 md:pt-8">{children}</main>

        <nav className="no-print fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="التنقل">
          <BottomNav nav={nav} unread={unread} footer={userCard} />
        </nav>
      </div>
    </div>
  );
}
