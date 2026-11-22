import { redirect } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { TopBar } from "@/components/TopBar";
import { getSessionUser } from "@/lib/auth";
import { ArenaClient } from "./ArenaClient";

export const dynamic = "force-dynamic";

type Attempt = { id: number; created_at: string; handle: string; mode: string; target: string; outcome: string; blocked_by: string | null; prompt: string };

export default async function ArenaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data } = await user.db
    .from("redteam_attempts")
    .select("id, created_at, handle, mode, target, outcome, blocked_by, prompt")
    .order("created_at", { ascending: false })
    .limit(500);
  const attempts = (data as Attempt[]) ?? [];

  const tally = (mode: string) => {
    const rows = attempts.filter((a) => a.mode === mode);
    // Secure mode never reports "leaked": a restricted value reaching the model there
    // means RLS failed and the output canary scan caught it, so count those instead.
    return {
      total: rows.length,
      leaked: rows.filter((a) => a.outcome === "leaked" || a.blocked_by === "output_canary").length,
    };
  };
  const weak = tally("prompt_only");
  const strong = tally("secure");

  return (
    <>
      <TopBar current="arena" name={user.fullName} email={user.email} role={user.role} />
      <main className="page stack">
        <div className="stack" style={{ maxWidth: 720 }}>
          <h1>Red team</h1>
          <p className="lede">
            Try to make the assistant reveal Finance, HR or Marketing data while signed in as a regular employee. Run the same attack
            against two designs: one where the prompt asks the model to keep secrets, and one where the database never hands the secrets
            over. Any prompt that breaks the first design becomes a permanent test case for the second.
          </p>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="label">Prompt-only attempts</div>
            <div className="value">{weak.total}</div>
          </div>
          <div className="stat">
            <div className="label">Leaks, prompt-only</div>
            <div className="value" style={{ color: weak.leaked ? "var(--danger)" : undefined }}>{weak.leaked}</div>
          </div>
          <div className="stat">
            <div className="label">Database-enforced attempts</div>
            <div className="value">{strong.total}</div>
          </div>
          <div className="stat">
            <div className="label">Leaks, database-enforced</div>
            <div className="value" style={{ color: strong.leaked ? "var(--danger)" : "var(--ok)" }}>{strong.leaked}</div>
          </div>
        </div>

        <ArenaClient defaultHandle={user.fullName.split(" ")[0]} />

        <section className="stack" style={{ marginTop: 40 }}>
          <h2>Recent attempts</h2>
          {attempts.length === 0 ? (
            <p className="muted">No attempts yet.</p>
          ) : (
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Design</th>
                    <th>Target</th>
                    <th>Result</th>
                    <th>Prompt</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.slice(0, 30).map((a) => (
                    <tr key={a.id}>
                      <td className="faint" style={{ whiteSpace: "nowrap" }}><LocalTime iso={a.created_at} /></td>
                      <td>{a.handle}</td>
                      <td>{a.mode === "secure" ? "Database" : "Prompt-only"}</td>
                      <td>
                        <span className={`tag ${a.target}`}>{a.target}</span>
                      </td>
                      <td style={{ color: a.outcome === "leaked" ? "var(--danger)" : a.outcome === "blocked" ? "var(--warn)" : "var(--ok)" }}>
                        {a.outcome}
                        {a.blocked_by ? <span className="faint"> · {a.blocked_by.replace(/_/g, " ")}</span> : null}
                      </td>
                      <td className="muted" style={{ maxWidth: 360 }}>
                        {a.prompt.length > 140 ? `${a.prompt.slice(0, 140)}…` : a.prompt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
