import qrcode from "qrcode-generator";

/** باركود مربع (QR) يُرسم كـ SVG — بدون إنترنت وبدون خدمات خارجية */
export function QrCode({ value, size = 96, className = "" }: { value: string; size?: number; className?: string }) {
  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
  } catch {
    return null;
  }
  const n = qr.getModuleCount();
  const m = 2; // هامش هادئ حول الرمز
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + m * 2} ${n + m * 2}`} width={size} height={size} role="img" aria-label="رمز QR" className={className} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
