"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">اسم المستخدم</label>
        <input
          id="username"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          className="field text-left"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">كلمة المرور</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className="field text-left"
        />
      </div>
      {state.error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
