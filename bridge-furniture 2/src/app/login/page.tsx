import { redirect } from "next/navigation";
import { getProfile, homeFor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { BrandMark } from "@/components/BrandMark";
import { t } from "@/i18n";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
  const { disabled } = await searchParams;
  const profile = await getProfile();
  if (profile?.is_active) redirect(homeFor(profile.role));

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-bold">{t.appName}</h1>
            <p className="text-muted">{t.appTagline}</p>
          </div>
        </div>
        <div className="card p-6">
          {disabled && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t.errors.account_disabled}</p>}
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">نسيت كلمة المرور؟ تواصل مع المالك لإعادة تعيينها.</p>
      </div>
    </main>
  );
}
