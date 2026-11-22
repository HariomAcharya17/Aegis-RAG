import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import { DEMO_USERS } from "@/lib/roles";
import { LoginForms } from "./LoginForms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/chat");
  const demo = demoMode();

  return (
    <main className="login">
      <div className="panel stack">
        <div>
          <h1>Kestrel Assist</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            The internal assistant for Kestrel Dynamics. What it can read depends on who you are, and the database decides, not the prompt.
          </p>
        </div>
        <LoginForms demo={demo} users={DEMO_USERS.map(({ role, name, blurb }) => ({ role, name, blurb }))} />
      </div>
    </main>
  );
}
