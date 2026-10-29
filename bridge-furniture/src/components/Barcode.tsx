"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** باركود Code 128 لرقم الطلبية — يقرؤه أي قارئ باركود أو تطبيق جوال */
export function Barcode({ value, height = 48 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width: 2,
        margin: 0,
        displayValue: true,
        fontSize: 14,
        font: "monospace",
        textMargin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      /* قيمة غير صالحة: لا نرسم شيئاً */
    }
  }, [value, height]);
  return <svg ref={ref} role="img" aria-label={`باركود ${value}`} className="max-w-full" />;
}
