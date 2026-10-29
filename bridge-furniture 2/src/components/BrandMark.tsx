// شعار مؤقت (قوس جسر) إلى أن يصل شعار Bridge Furniture الرسمي
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#7f532b" />
      <path d="M9 32c4-9 9-13 15-13s11 4 15 13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M8 33h32M16 25v8M24 20v13M32 25v8" stroke="#f1e7da" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
