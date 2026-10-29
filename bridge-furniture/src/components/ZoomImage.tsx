"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Icon } from "@/components/Icon";

/** صورة منتج يمكن الضغط عليها لعرضها بحجم كامل (مفيد للمصنع للتأكد من الموديل) */
export function ZoomImage({
  url,
  alt,
  size = "md",
  caption,
}: {
  url: string | null | undefined;
  alt: string;
  size?: "sm" | "md" | "lg" | "fill";
  caption?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!url) return <ProductThumb url={null} alt={alt} size={size} />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-walnut-200" aria-label={`تكبير صورة ${alt}`}>
        <ProductThumb url={url} alt={alt} size={size} />
        <span className="absolute bottom-1 left-1 rounded-md bg-black/45 p-0.5 text-white">
          <Icon name="search" className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={alt}>
          <div className="flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))] text-white">
            <span className="font-semibold">{caption ?? alt}</span>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" onClick={() => setOpen(false)} aria-label="إغلاق">
              <Icon name="x" className="h-6 w-6" />
            </button>
          </div>
          <button type="button" className="flex flex-1 items-center justify-center p-4" onClick={() => setOpen(false)} aria-label="إغلاق">
            <img src={url} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" />
          </button>
        </div>
      )}
    </>
  );
}
