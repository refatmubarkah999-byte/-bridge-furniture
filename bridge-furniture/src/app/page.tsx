import { redirect } from "next/navigation";
import { getProfile, homeFor } from "@/lib/auth";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?disabled=1");
  redirect(homeFor(profile.role));
}
