"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/env";
import { homeFor } from "@/lib/auth";
import { t } from "@/i18n";
import type { AppRole } from "@/lib/types";

const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,32}$/),
  password: z.string().min(8).max(128),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t.errors.invalid_login };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
  });
  if (error || !data.user) {
    // رسالة واحدة لكل الحالات حتى لا نكشف إن كان اسم المستخدم موجوداً
    return { error: /banned/i.test(error?.message ?? "") ? t.errors.account_disabled : t.errors.invalid_login };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: t.errors.account_disabled };
  }
  redirect(homeFor(profile.role as AppRole));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
