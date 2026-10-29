import { BrandMark } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";
import { t } from "@/i18n";

export function LoginView({ disabled, form }: { disabled: boolean; form: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* لوحة الهوية (على الشاشات الكبيرة) */}
      <section className="relative hidden overflow-hidden bg-walnut-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(100deg, transparent 0 22px, rgba(255,255,255,.5) 22px 23px, transparent 23px 47px, rgba(255,255,255,.25) 47px 48px)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandMark className="h-12 w-12" />
          <div className="text-xl font-bold">{t.appName}</div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">كل طلبية من المعرض إلى المصنع، في مكان واحد.</h2>
          <ul className="mt-8 space-y-4 text-[17px] text-walnut-100">
            <li className="flex items-center gap-3"><Icon name="sparkle" className="h-5 w-5 text-brass" /> الطلبية تصل المصنع فور إرسالها</li>
            <li className="flex items-center gap-3"><Icon name="shield" className="h-5 w-5 text-brass" /> بيانات الزبائن والأسعار محمية</li>
            <li className="flex items-center gap-3"><Icon name="truck" className="h-5 w-5 text-brass" /> متابعة كل مرحلة حتى التسليم</li>
          </ul>
        </div>
        <p className="relative text-sm text-walnut-200">© {t.appName}</p>
      </section>

      {/* نموذج الدخول */}
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-right">
            <BrandMark className="h-16 w-16 lg:hidden" />
            <div>
              <h1 className="text-[28px] font-bold">أهلاً بك</h1>
              <p className="mt-1 text-muted">سجّل الدخول إلى {t.appTagline}</p>
            </div>
          </div>
          {disabled && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              {t.errors.account_disabled}
            </p>
          )}
          {form}
          <p className="mt-8 text-center text-sm text-muted">نسيت كلمة المرور؟ تواصل مع المالك لإعادة تعيينها.</p>
        </div>
      </section>
    </main>
  );
}
