import Link from "next/link";
import { redirect } from "next/navigation";
import { AegisMark } from "@/components/TopBar";
import { getSessionUser } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import { DEMO_USERS } from "@/lib/roles";
import { LoginForms } from "./LoginForms";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/chat");
  const { error } = await searchParams;
  const demo = demoMode();

  return (
    <main className="login">
      <div className="panel stack">
        <Link href="/" className="wordmark small" style={{ textDecoration: "none" }}>
          <AegisMark /> Aegis <small>back to the overview</small>
        </Link>
        <div>
          <h1>Pick who you are</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Each person works at the fictional Kestrel Dynamics and has a different role. The assistant can only read what their role
            allows, and the database enforces it.
          </p>
        </div>
        {error === "demo" && <p className="notice danger">Demo sign-in didn&apos;t work. Check that the demo accounts were created.</p>}
        <LoginForms demo={demo} users={DEMO_USERS.map(({ role, name, blurb }) => ({ role, name, blurb }))} />
      </div>
    </main>
  );
}
