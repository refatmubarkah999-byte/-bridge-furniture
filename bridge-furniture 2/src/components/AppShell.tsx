import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/actions/auth";
import { BrandMark } from "@/components/BrandMark";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { LiveUpdates } from "@/components/LiveUpdates";
import { t } from "@/i18n";
import type { Profile } from "@/lib/types";

export async function AppShell({
  profile,
  nav,
  children,
}: {
  profile: Profile;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [{ count }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("touch_last_seen"),
  ]);
  const unread = count ?? 0;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="no-print hidden w-60 shrink-0 border-l border-line bg-white md:block">
        <div className="sticky top-0 flex h-dvh flex-col p-4">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
            <BrandMark />
            <div className="leading-tight">
              <div className="font-bold">{t.appName}</div>
              <div className="text-xs text-muted">{t.roles[profile.role]}</div>
            </div>
          </Link>
          <NavLinks items={nav} variant="side" />
          <div className="mt-auto border-t border-line pt-4">
            <div className="px-2 text-sm font-medium">{profile.full_name}</div>
            <form action={logoutAction}>
              <button className="mt-1 px-2 text-sm text-muted hover:text-ink">{t.nav.logout}</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <BrandMark className="h-8 w-8" />
            <span className="font-bold">{t.appName}</span>
          </Link>
          <div className="hidden text-sm text-muted md:block">{t.appTagline}</div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white hover:bg-walnut-50"
              aria-label={`${t.nav.notifications}${unread ? ` (${unread})` : ""}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-5 rounded-full bg-rose-600 px-1.5 text-center text-xs font-bold leading-5 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <form action={logoutAction} className="md:hidden">
              <button className="btn-secondary h-11 px-3 text-sm">{t.nav.logout}</button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10">{children}</main>

        <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <NavLinks items={nav} variant="bottom" />
        </nav>
      </div>

      <LiveUpdates role={profile.role} userId={profile.id} />
    </div>
  );
}
