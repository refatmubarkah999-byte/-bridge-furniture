/* eslint-disable @next/next/no-img-element */
import { Icon } from "@/components/Icon";

const sizes = {
  xs: "h-10 w-10 rounded-lg",
  sm: "h-14 w-14 rounded-xl",
  md: "h-20 w-20 rounded-xl",
  lg: "h-28 w-28 rounded-2xl",
  fill: "aspect-square w-full rounded-xl",
};

export function ProductThumb({
  url,
  alt,
  size = "md",
}: {
  url: string | null | undefined;
  alt: string;
  size?: keyof typeof sizes;
}) {
  return (
    <div className={`${sizes[size]} shrink-0 overflow-hidden bg-walnut-50 ring-1 ring-inset ring-line`}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-walnut-300">
          <Icon name="image" className={size === "xs" ? "h-4 w-4" : "h-1/3 w-1/3 min-h-5 min-w-5"} />
        </div>
      )}
    </div>
  );
}
