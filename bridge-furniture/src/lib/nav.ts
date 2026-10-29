import { t } from "@/i18n";
import type { NavItem } from "@/components/NavLinks";
import type { AppRole } from "@/lib/types";

export function navFor(role: AppRole): NavItem[] {
  if (role === "super_admin") {
    return [
      { href: "/admin", label: t.nav.dashboard, icon: "home", exact: true },
      { href: "/admin/orders", label: t.nav.orders, icon: "list" },
      { href: "/admin/orders/new", label: t.nav.newOrder, icon: "plus", exact: true },
      { href: "/admin/products", label: t.nav.products, icon: "box" },
      { href: "/admin/employees", label: t.nav.employees, icon: "users" },
      { href: "/admin/settings", label: t.nav.settings, icon: "gear" },
    ];
  }
  if (role === "factory_admin") {
    return [
      { href: "/factory", label: t.nav.incoming, icon: "list", exact: true },
      { href: "/notifications", label: t.nav.notifications, icon: "bell" },
    ];
  }
  return [
    { href: "/sales", label: t.nav.myOrders, icon: "list", exact: true },
    { href: "/sales/orders/new", label: t.nav.newOrder, icon: "plus" },
    { href: "/notifications", label: t.nav.notifications, icon: "bell" },
  ];
}

/** مسار صفحة الطلبية لكل دور */
export function orderHref(role: AppRole, orderId: string) {
  return role === "super_admin"
    ? `/admin/orders/${orderId}`
    : role === "factory_admin"
      ? `/factory/orders/${orderId}`
      : `/sales/orders/${orderId}`;
}
