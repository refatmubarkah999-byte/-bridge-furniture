// شعار مؤقت (قوس جسر فوق لوح خشب) إلى أن يصل شعار Bridge Furniture الرسمي
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="13" fill="#74492a" />
      <path d="M9.5 31.5c3.6-8.4 8.6-12.4 14.5-12.4s10.9 4 14.5 12.4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M8 33h32" stroke="#f2e8db" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M17 25.5V33M24 21.5V33M31 25.5V33" stroke="#e4d0b6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
