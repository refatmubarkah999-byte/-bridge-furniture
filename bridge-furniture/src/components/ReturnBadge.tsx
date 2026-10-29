import { Icon } from "@/components/Icon";

/** علامة "مرتجع" — تميّز المرتجعات عن الطلبيات العادية في كل القوائم */
export function ReturnBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-violet-100 font-bold text-violet-800 ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"}`}>
      <Icon name="undo" className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
      مرتجع
    </span>
  );
}
