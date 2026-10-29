import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-muted">قد تكون الطلبية غير موجودة أو ليست ضمن صلاحياتك.</p>
      <Link href="/" className="btn-primary">العودة للرئيسية</Link>
    </main>
  );
}
