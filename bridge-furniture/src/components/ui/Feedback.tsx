"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/* =====================================================================
   نافذة التأكيد (Bottom sheet على الهاتف، نافذة وسطية على الكمبيوتر)
   بديل confirm()/prompt() — تعمل في كل المتصفحات وداخل تطبيق الأندرويد
   ===================================================================== */
type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger" | "success";
  note?: { label: string; placeholder?: string; required?: boolean };
};
type ConfirmResult = { ok: boolean; note: string };

/* =====================================================================
   الإشعارات المؤقتة (Toast)
   ===================================================================== */
type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

type FeedbackApi = {
  confirm: (o: ConfirmOptions) => Promise<ConfirmResult>;
  toast: (message: string, tone?: Toast["tone"]) => void;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("FeedbackProvider missing");
  return ctx;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (r: ConfirmResult) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<ConfirmResult>((resolve) => setDialog({ ...o, resolve })),
    []
  );
  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      {dialog && (
        <ConfirmSheet
          {...dialog}
          onClose={(r) => {
            dialog.resolve(r);
            setDialog(null);
          }}
        />
      )}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md animate-toast-in items-center gap-2.5 rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-[var(--shadow-raised)] ${
              t.tone === "error"
                ? "bg-rose-700 text-white"
                : t.tone === "info"
                  ? "bg-walnut-900 text-white"
                  : "bg-emerald-700 text-white"
            }`}
          >
            <Icon name={t.tone === "error" ? "alert" : t.tone === "info" ? "bell" : "checkCircle"} className="h-5 w-5 shrink-0" />
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function ConfirmSheet({
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "رجوع",
  tone = "primary",
  note,
  onClose,
}: ConfirmOptions & { onClose: (r: ConfirmResult) => void }) {
  const [text, setText] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (note ? noteRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose({ ok: false, note: "" });
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [note, onClose]);

  const btn = tone === "danger" ? "btn-danger !bg-rose-700 !text-white !border-rose-700" : tone === "success" ? "btn-success" : "btn-primary";
  const disabled = !!note?.required && !text.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 animate-fade-in bg-walnut-900/40 backdrop-blur-[2px]"
        onClick={() => onClose({ ok: false, note: "" })}
      />
      <div className="relative w-full max-w-md animate-sheet-up rounded-t-3xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)] md:rounded-3xl md:pb-5">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden="true" />
        <h2 id="confirm-title" className="text-xl font-bold">{title}</h2>
        {message && <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{message}</p>}
        {note && (
          <label className="mt-4 block">
            <span className="label">{note.label}</span>
            <textarea
              ref={noteRef}
              className="field min-h-24"
              maxLength={300}
              placeholder={note.placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary" onClick={() => onClose({ ok: false, note: "" })}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className={btn} disabled={disabled} onClick={() => onClose({ ok: true, note: text })}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
