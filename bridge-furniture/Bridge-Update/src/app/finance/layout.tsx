import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** المالية: المالك والمحاسب فقط (والقاعدة تتحقق مرة ثانية في كل دالة) */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("super_admin", "accountant");
  return (
    <AppShell profile={profile} nav={navFor(profile.role)}>
      {children}
    </AppShell>
  );
}
