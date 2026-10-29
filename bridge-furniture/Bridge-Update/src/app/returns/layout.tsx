import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** لوحة موظف المرتجعات فقط (القاعدة تمنعه من أي شيء آخر على أي حال) */
export default async function ReturnsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("returns");
  return (
    <AppShell profile={profile} nav={navFor(profile.role)}>
      {children}
    </AppShell>
  );
}
