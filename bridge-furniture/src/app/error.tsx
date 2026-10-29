"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="text-muted">تحقق من الاتصال بالإنترنت ثم أعد المحاولة.</p>
      <button onClick={reset} className="btn-primary">إعادة المحاولة</button>
    </main>
  );
}
