"use client";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">اسم المستخدم</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-faint">
            <Icon name="user" className="h-5 w-5" />
          </span>
          <input
            id="username"
            name="username"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            placeholder="ahmad"
            className="field pr-11 text-left"
          />
        </div>
      </div>
      <div>
        <label htmlFor="password" className="label">كلمة المرور</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            dir="ltr"
            className="field pl-12 text-left"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 left-1 my-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-walnut-50 hover:text-ink"
            aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          >
            <Icon name={show ? "eyeOff" : "eye"} className="h-5 w-5" />
          </button>
        </div>
      </div>
      {state.error && (
        <p className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700" role="alert">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary btn-lg w-full">
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
