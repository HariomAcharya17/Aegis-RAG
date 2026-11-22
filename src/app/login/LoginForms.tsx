"use client";

import { useActionState } from "react";
import { demoSignIn, signIn, type LoginState } from "@/app/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/roles";

type DemoUser = { role: Role; name: string; blurb: string };

export function LoginForms({ demo, users }: { demo: boolean; users: DemoUser[] }) {
  const [demoState, demoAction, demoPending] = useActionState<LoginState, FormData>(demoSignIn, {});
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <>
      {demo && (
        <form action={demoAction} className="stack" style={{ marginTop: 24 }}>
          
          <div className="role-list">
            {users.map((u) => (
              <button key={u.role} type="submit" name="role" value={u.role} disabled={demoPending} className={`r-${u.role}`}>
                <span>
                  {u.name} <span className="faint">· {ROLE_LABEL[u.role]}</span>
                </span>
                <span className="small muted">{u.blurb}</span>
              </button>
            ))}
          </div>
          {demoState.error && <p className="notice danger">{demoState.error}</p>}
        </form>
      )}

      {demo && <div className="divider">or with an account</div>}

      <form action={action} className="stack" style={demo ? undefined : { marginTop: 24 }}>
        <div>
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error && <p className="notice danger">{state.error}</p>}
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
