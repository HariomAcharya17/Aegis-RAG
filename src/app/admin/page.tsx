import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getSessionUser } from "@/lib/auth";
import { numberEnv } from "@/lib/env";
import { DEMO_USERS, ROLE_LABEL, type Role } from "@/lib/roles";
import { RequestsTable, ViewAs } from "./AdminClient";

export const dynamic = "force-dynamic";

type LogRow = {
  id: number;
  created_at: string;
  user_email: string;
  role: string;
  surface: string;
  question: string;
  status: string;
  blocked_by: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  shadow_cost_usd: number | string | null;
  pii_redactions: number | null;
};

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "executive") {
    return (
      <>
        <TopBar current="admin" name={user.fullName} email={user.email} role={user.role} />
        <main className="page narrow">
          <p className="notice">The admin console is for executives.</p>
        </main>
      </>
    );
  }

  const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  // All reads go through the executive's own session: RLS (is_executive) allows them.
  const [logsRes, requestsRes] = await Promise.all([
    user.db
      .from("audit_logs")
      .select("id, created_at, user_email, role, surface, question, status, blocked_by, latency_ms, input_tokens, output_tokens, shadow_cost_usd, pii_redactions")
      .gte("created_at", since30)
      .order("created_at", { ascending: false })
      .limit(1000),
    user.db
      .from("access_requests")
      .select("id, created_at, department, reason, question, status, requester:profiles!access_requests_user_id_fkey(email, role)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const logs = (logsRes.data as LogRow[]) ?? [];
  const dayAgo = Date.now() - 24 * 3600_000;
  const last24 = logs.filter((l) => new Date(l.created_at).getTime() > dayAgo);
  const cost30 = logs.reduce((s, l) => s + Number(l.shadow_cost_usd ?? 0), 0);
  const cost24 = last24.reduce((s, l) => s + Number(l.shadow_cost_usd ?? 0), 0);
  const latencies = last24.map((l) => l.latency_ms ?? 0).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const count = (rows: LogRow[], pred: (l: LogRow) => boolean) => rows.filter(pred).length;
  const budget = numberEnv("MONTHLY_BUDGET_USD", 20);

  const byStatus = ["answered", "refused", "out_of_scope", "blocked", "error"].map((s) => ({ s, n: count(last24, (l) => l.status === s) }));

  type RequestRow = {
    id: number;
    created_at: string;
    department: string;
    reason: string;
    question: string | null;
    status: string;
    requester: { email: string; role: string } | null;
  };
  const requests = ((requestsRes.data as unknown as RequestRow[]) ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    department: r.department,
    reason: r.reason,
    question: r.question,
    status: r.status,
    email: DEMO_USERS.find((u) => u.email === r.requester?.email)?.name ?? r.requester?.email ?? "unknown",
    role: r.requester?.role ?? "",
  }));

  return (
    <>
      <TopBar current="admin" name={user.fullName} email={user.email} role={user.role} />
      <main className="page stack">
        <h1>Admin</h1>

        <section className="stats">
          <div className="stat">
            <div className="label">Questions, 24h</div>
            <div className="value">{last24.length}</div>
          </div>
          <div className="stat">
            <div className="label">Blocked or refused, 24h</div>
            <div className="value">{count(last24, (l) => ["blocked", "refused", "out_of_scope"].includes(l.status))}</div>
          </div>
          <div className="stat">
            <div className="label">p95 latency, 24h</div>
            <div className="value">{(p95 / 1000).toFixed(1)}s</div>
          </div>
          <div className="stat">
            <div className="label">Shadow cost, 24h</div>
            <div className="value">${cost24.toFixed(3)}</div>
          </div>
          <div className="stat">
            <div className="label">Shadow cost, 30d (budget ${budget})</div>
            <div className="value" style={{ color: cost30 > budget ? "var(--danger)" : undefined }}>${cost30.toFixed(2)}</div>
          </div>
        </section>
        <p className="small faint">
          Shadow cost prices every request as if it ran on a paid model (input ${numberEnv("SHADOW_PRICE_INPUT_PER_M", 1.25)}/M, output $
          {numberEnv("SHADOW_PRICE_OUTPUT_PER_M", 10)}/M tokens). Actual spend on Groq&apos;s free tier is $0. Outcomes, 24h:{" "}
          {byStatus.map((b) => `${b.s.replace(/_/g, " ")} ${b.n}`).join(" · ")}
        </p>

        <section className="stack" style={{ marginTop: 32 }}>
          <h2>Access requests</h2>
          <RequestsTable requests={requests} />
        </section>

        <section className="stack" style={{ marginTop: 32 }}>
          <h2>View as role</h2>
          <p className="muted small">Runs retrieval only (no model call) as each role and shows what the database would return.</p>
          <ViewAs />
        </section>

        <section className="stack" style={{ marginTop: 32 }}>
          <h2>Audit log</h2>
          <p className="muted small">Questions are stored with personal data redacted. Rows are written with the service key; no user can insert or edit them.</p>
          <div className="table-wrap scroll card" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Where</th>
                  <th>Question</th>
                  <th>Outcome</th>
                  <th>Tokens</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 100).map((l) => (
                  <tr key={l.id}>
                    <td className="faint" style={{ whiteSpace: "nowrap" }}>
                      {new Date(l.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td>
                      {DEMO_USERS.find((u) => u.email === l.user_email)?.name ?? l.user_email.split("@")[0]}{" "}
                      <span className="faint">· {ROLE_LABEL[l.role as Role] ?? l.role}</span>
                    </td>
                    <td>{l.surface}</td>
                    <td className="muted" style={{ maxWidth: 380 }}>
                      {l.question.length > 120 ? `${l.question.slice(0, 120)}…` : l.question}
                    </td>
                    <td
                      style={{
                        color: l.status === "blocked" ? "var(--danger)" : l.status === "answered" ? undefined : "var(--warn)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.status.replace(/_/g, " ")}
                      {l.blocked_by ? <span className="faint"> · {l.blocked_by.replace(/_/g, " ")}</span> : null}
                      {l.pii_redactions ? <span className="faint"> · {l.pii_redactions} PII</span> : null}
                    </td>
                    <td className="faint">{(l.input_tokens ?? 0) + (l.output_tokens ?? 0)}</td>
                    <td className="faint">{((l.latency_ms ?? 0) / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
