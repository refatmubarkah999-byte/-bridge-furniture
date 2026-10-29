import { t } from "@/i18n";
import type { IconName } from "@/components/Icon";
import type { AppRole } from "@/lib/types";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
export type NavConfig = {
  /** القائمة الجانبية على الكمبيوتر */
  side: NavItem[];
  /** الشريط السفلي على الهاتف (حتى 4 + زر "المزيد") */
  bottom: NavItem[];
  /** الزر الرئيسي الكبير في منتصف الشريط السفلي */
  fab?: NavItem;
  /** ما يظهر في قائمة "المزيد" على الهاتف */
  more: NavItem[];
};

export function navFor(role: AppRole): NavConfig {
  const notifications: NavItem = { href: "/notifications", label: t.nav.notifications, icon: "bell" };

  if (role === "super_admin") {
    const dashboard: NavItem = { href: "/admin", label: "الرئيسية", icon: "home", exact: true };
    const orders: NavItem = { href: "/admin/orders", label: t.nav.orders, icon: "list" };
    const newOrder: NavItem = { href: "/admin/orders/new", label: t.nav.newOrder, icon: "plus", exact: true };
    const products: NavItem = { href: "/admin/products", label: t.nav.products, icon: "box" };
    const catalogs: NavItem = { href: "/admin/catalogs", label: t.nav.catalogs, icon: "grid" };
    const employees: NavItem = { href: "/admin/employees", label: t.nav.employees, icon: "users" };
    const settings: NavItem = { href: "/admin/settings", label: t.nav.settings, icon: "gear" };
    const audit: NavItem = { href: "/admin/audit", label: t.nav.audit, icon: "shield" };
    const finance: NavItem = { href: "/finance", label: t.nav.finance, icon: "wallet" };
    return {
      side: [dashboard, orders, newOrder, finance, products, catalogs, employees, notifications, settings],
      bottom: [dashboard, orders, notifications],
      fab: newOrder,
      more: [finance, products, catalogs, employees, settings, audit],
    };
  }

  if (role === "factory_admin") {
    const incoming: NavItem = { href: "/factory", label: "الطلبيات", icon: "inbox", exact: true };
    return { side: [incoming, notifications], bottom: [incoming, notifications], more: [] };
  }

  if (role === "accountant") {
    const overview: NavItem = { href: "/finance", label: "التقرير", icon: "chart", exact: true };
    const payments: NavItem = { href: "/finance/payments", label: t.nav.payments, icon: "wallet" };
    const orders: NavItem = { href: "/finance/orders", label: t.nav.profit, icon: "list" };
    const costs: NavItem = { href: "/finance/costs", label: t.nav.costs, icon: "box" };
    return {
      side: [overview, payments, orders, costs, notifications],
      bottom: [overview, payments, orders, notifications],
      more: [costs],
    };
  }

  if (role === "returns") {
    const mine: NavItem = { href: "/returns", label: t.nav.myReturns, icon: "undo", exact: true };
    const newReturn: NavItem = { href: "/returns/orders/new", label: t.nav.newReturn, icon: "plus", exact: true };
    return { side: [mine, newReturn, notifications], bottom: [mine, notifications], fab: newReturn, more: [] };
  }

  const mine: NavItem = { href: "/sales", label: t.nav.myOrders, icon: "list", exact: true };
  const newOrder: NavItem = { href: "/sales/orders/new", label: t.nav.newOrder, icon: "plus", exact: true };
  return { side: [mine, newOrder, notifications], bottom: [mine, notifications], fab: newOrder, more: [] };
}

/** مسار صفحة الطلبية لكل دور */
export function orderHref(role: AppRole, orderId: string) {
  if (role === "super_admin") return `/admin/orders/${orderId}`;
  if (role === "factory_admin") return `/factory/orders/${orderId}`;
  if (role === "accountant") return `/finance/orders/${orderId}`;
  if (role === "returns") return `/returns/orders/${orderId}`;
  return `/sales/orders/${orderId}`;
}
