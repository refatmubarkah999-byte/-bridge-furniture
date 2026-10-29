import { redirect } from "next/navigation";
import { getProfile, homeFor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { LoginView } from "./LoginView";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
  const { disabled } = await searchParams;
  const profile = await getProfile();
  if (profile?.is_active) redirect(homeFor(profile.role));
  return <LoginView disabled={!!disabled} form={<LoginForm />} />;
}
