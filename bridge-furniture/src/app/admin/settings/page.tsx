import Link from "next/link";
import { getSettings } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";
import { PageHeader } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import { t } from "@/i18n";

export const metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="page max-w-2xl">
      <PageHeader title={t.nav.settings} subtitle="إعدادات عامة تنطبق على كل الحسابات" />
      <section className="card mb-4 p-5">
        <SettingsForm settings={settings} />
      </section>
      <Link href="/admin/audit" className="card card-interactive flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-walnut-50 text-walnut-700">
          <Icon name="shield" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t.nav.audit}</span>
          <span className="block text-sm text-muted">من فعل ماذا ومتى: الإرسال، تغيير الحالات، الدفعات، الحسابات، الموديلات والكتالوجات.</span>
        </span>
        <Icon name="chevronLeft" className="h-5 w-5 text-muted" />
      </Link>
    </div>
  );
}
