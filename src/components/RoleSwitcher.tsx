"use client";

import { useRef } from "react";
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
      <select id="persona" name="role" defaultValue={role} className="select" onChange={() => form.current?.requestSubmit()}>
        {DEMO_USERS.map((u) => (
          <option key={u.role} value={u.role}>
            {u.name} · {ROLE_LABEL[u.role]}
          </option>
        ))}
      </select>
    </form>
  );
}
