import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 md:mb-6">
      {back && (
        <Link href={back.href} className="no-print mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <Icon name="chevronRight" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-walnut-50 text-walnut-600">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-[15px] text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  icon?: IconName;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="section-title flex items-center gap-2">
            {icon && <Icon name={icon} className="h-5 w-5 text-walnut-600" />}
            {title}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  // حرف واحد فقط: الحروف العربية تتصل ببعضها فيصعب قراءة حرفين متجاورين
  const letter = Array.from(name.trim())[0] ?? "؟";
  const tones = ["bg-walnut-100 text-walnut-800", "bg-amber-100 text-amber-900", "bg-sky-100 text-sky-900", "bg-emerald-100 text-emerald-900", "bg-rose-100 text-rose-900", "bg-violet-100 text-violet-900"];
  const tone = tones[Array.from(name).reduce((h, c) => (h + c.charCodeAt(0)) % tones.length, 0)];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tone} ${
        size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base"
      }`}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
