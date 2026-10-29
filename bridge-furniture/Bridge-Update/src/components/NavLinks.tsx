"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { NavConfig, NavItem } from "@/lib/nav";

function useActive() {
  const pathname = usePathname();
  return (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    // "الطلبيات" لا تبقى مفعّلة عند فتح "طلبية جديدة"
    if (pathname.endsWith("/orders/new") && !item.href.endsWith("/orders/new")) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 left-1/2 ml-2 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-surface">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function SideNav({ nav, unread }: { nav: NavConfig; unread: number }) {
  const isActive = useActive();
  return (
    <ul className="space-y-1">
      {nav.side.map((item) => {
        const active = isActive(item);
        const isNew = item.icon === "plus";
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
                isNew && !active
                  ? "text-walnut-700 hover:bg-walnut-50"
                  : active
                    ? "bg-walnut-600 text-white shadow-sm"
                    : "text-ink/70 hover:bg-walnut-50 hover:text-ink"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  active ? "bg-white/15" : isNew ? "bg-walnut-100 text-walnut-700" : "bg-canvas text-ink/60 group-hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/notifications" && unread > 0 && (
                <span className={`rounded-full px-2 text-xs font-bold leading-5 ${active ? "bg-white/20" : "bg-rose-600 text-white"}`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BottomNav({
  nav,
  unread,
  footer,
}: {
  nav: NavConfig;
  unread: number;
  footer: React.ReactNode;
}) {
  const isActive = useActive();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  const items: (NavItem | "fab" | "more")[] = [...nav.bottom];
  if (nav.fab) items.splice(Math.ceil(items.length / 2), 0, "fab");
  items.push("more");
  // في صفحات النموذج يوجد شريط ملخّص ثابت فوق القائمة، فلا نرفع الزر فوقه
  const onForm = /\/(new|edit)$/.test(pathname);

  return (
    <>
      <ul
        className="grid border-t border-line bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          if (item === "fab" && nav.fab) {
            return (
              <li key="fab" className="flex justify-center">
                <Link
                  href={nav.fab.href}
                  aria-label={nav.fab.label}
                  className={`flex items-center justify-center rounded-2xl bg-walnut-600 text-white transition active:scale-95 ${onForm ? "my-1.5 h-11 w-11" : "-mt-5 h-14 w-14 shadow-[var(--shadow-raised)] ring-4 ring-canvas"}`}
                >
                  <Icon name="plus" className="h-7 w-7" strokeWidth={2.2} />
                </Link>
              </li>
            );
          }
          if (item === "more") {
            return (
              <li key="more">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted"
                >
                  <span className="flex h-7 w-12 items-center justify-center rounded-full">
                    <Icon name="more" className="h-6 w-6" strokeWidth={2.4} />
                  </span>
                  المزيد
                </button>
              </li>
            );
          }
          const navItem = item as NavItem;
          const active = isActive(navItem);
          return (
            <li key={navItem.href}>
              <Link
                href={navItem.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-walnut-700" : "text-muted"}`}
              >
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-walnut-100" : ""}`}>
                  <Icon name={navItem.icon} className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {navItem.href === "/notifications" && <Badge count={unread} />}
                </span>
                {navItem.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="المزيد">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-walnut-900/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-3xl bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)]">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
            {nav.more.length > 0 && (
              <ul className="mb-3 grid grid-cols-2 gap-2">
                {nav.more.map((m) => (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 font-semibold ${
                        isActive(m) ? "border-walnut-300 bg-walnut-50" : "border-line"
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-walnut-100 text-walnut-700">
                        <Icon name={m.icon} className="h-5 w-5" strokeWidth={2} />
                      </span>
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
