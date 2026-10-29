import Link from "next/link";
import { getSettings } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";
import { t } from "@/i18n";

export const metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.nav.settings}</h1>
      <section className="card p-5">
        <SettingsForm settings={settings} />
      </section>
      <Link href="/admin/audit" className="card block p-5 hover:bg-walnut-50">
        <div className="font-bold">{t.nav.audit}</div>
        <div className="text-sm text-muted">من فعل ماذا ومتى: الإرسال، تغيير الحالات، الدفعات، الحسابات، الكتالوج.</div>
      </Link>
    </div>
  );
}
