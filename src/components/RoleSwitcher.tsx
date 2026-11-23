"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { switchDemoUser } from "@/app/auth/actions";
import { DEMO_USERS, ROLE_LABEL, type Role } from "@/lib/roles";

/** Top-bar persona picker for the demo: pick a person, get signed in as them. */
export function RoleSwitcher({ role, next }: { role: Role; next: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchDemoUser} className="role-switch">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="persona" className="sr-only">
        Switch demo person
      </label>
      <PersonaSelect role={role} onPick={() => form.current?.requestSubmit()} />
    </form>
  );
}

/** Separate component so useFormStatus can see the parent form's pending state. */
function PersonaSelect({ role, onPick }: { role: Role; onPick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <span className="spinner" aria-hidden />}
      {/* readOnly-style lock: a disabled select would drop its value from the pending submit */}
      <select
        id="persona"
        name="role"
        defaultValue={role}
        className="select"
        aria-busy={pending}
        style={pending ? { pointerEvents: "none", opacity: 0.6 } : undefined}
        onChange={onPick}
      >
        {DEMO_USERS.map((u) => (
          <option key={u.role} value={u.role}>
            {u.name} · {ROLE_LABEL[u.role]}
          </option>
        ))}
      </select>
    </>
  );
}
