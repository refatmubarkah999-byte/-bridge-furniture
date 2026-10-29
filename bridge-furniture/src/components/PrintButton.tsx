"use client";

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
