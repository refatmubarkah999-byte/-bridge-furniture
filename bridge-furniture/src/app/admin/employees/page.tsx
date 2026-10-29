import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { EmployeesView, type EmployeeRow } from "./EmployeesView";

export const metadata = { title: "الموظفون" };

export default async function EmployeesPage() {
  const me = await requireRole("super_admin");
  const settings = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, phone, role, is_active, last_seen_at, user_permissions!user_permissions_user_id_fkey(permission)")
    .order("is_active", { ascending: false })
    .order("full_name");
  return <EmployeesView rows={(data ?? []) as EmployeeRow[]} meId={me.id} timeZone={settings.timezone} />;
}
