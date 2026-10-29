/** هيكل تحميل خفيف يظهر فوراً أثناء جلب البيانات */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="page animate-pulse" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="mb-6 h-8 w-48 rounded-xl bg-line" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface ring-1 ring-line" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="h-14 w-14 rounded-xl bg-line" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-line" />
              <div className="h-3 w-1/2 rounded bg-line/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
