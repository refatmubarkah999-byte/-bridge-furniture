/* eslint-disable @next/next/no-img-element */
export function ProductThumb({ url, alt, size = "md" }: { url: string | null | undefined; alt: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-28 w-28" : size === "sm" ? "h-12 w-12" : "h-20 w-20";
  return (
    <div className={`${dims} shrink-0 overflow-hidden rounded-xl bg-walnut-50 ring-1 ring-line`}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-1 text-center text-[11px] text-muted">بلا صورة</div>
      )}
    </div>
  );
}
