import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("sales");
  return (
    <AppShell profile={profile} nav={navFor(profile.role)}>
      {children}
    </AppShell>
  );
}
