"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { DEPARTMENT_LABEL, ROLE_LABEL, type Department, type Role } from "@/lib/roles";

type Request = {
  id: number;
  createdAt: string;
  department: string;
  reason: string;
  question: string | null;
  status: string;
  email: string;
  role: string;
};

export function RequestsTable({ requests }: { requests: Request[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: number, approve: boolean) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, approve, hours: 1 }),
    });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
    setBusy(null);
    router.refresh();
  }

  if (requests.length === 0) return <p className="muted">No requests yet. They appear when someone asks about data outside their role.</p>;

  return (
    <>
      {error && <p className="notice danger">{error}</p>}
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Wants</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="faint" style={{ whiteSpace: "nowrap" }}>
                  <LocalTime iso={r.createdAt} />
                </td>
                <td>
                  {r.email.split("@")[0]} <span className="faint">· {ROLE_LABEL[r.role as Role] ?? r.role}</span>
                </td>
                <td>
                  <span className={`tag ${r.department}`}>{DEPARTMENT_LABEL[r.department as Department]}</span>
                </td>
                <td className="muted" style={{ maxWidth: 360 }}>
                  {r.reason}
                  {r.question && <div className="small faint">Asked: {r.question}</div>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.status === "pending" ? (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn small primary" disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                        Grant 1 hour
                      </button>
                      <button className="btn small" disabled={busy === r.id} onClick={() => decide(r.id, false)}>
                        Deny
                      </button>
                    </div>
                  ) : (
                    <span className="faint">{r.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type ViewAsResult = { role: Role; error?: string; rows: { id: string; title: string; department: string; similarity: number }[] };

export function ViewAs() {
  const [question, setQuestion] = useState("What is the median salary for Sales Executives?");
  const [results, setResults] = useState<ViewAsResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const body = (await res.json().catch(() => ({}))) as { results?: ViewAsResult[]; error?: string };
    if (!res.ok) setError(body.error ?? "Failed");
    else setResults(body.results ?? []);
    setLoading(false);
  }

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn" onClick={run} disabled={loading || !question.trim()}>
          {loading ? "Running…" : "Compare"}
        </button>
      </div>
      {error && <p className="notice danger">{error}</p>}
      {results && (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Role</th>
                <th>Top chunks the database returns</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.role}>
                  <td style={{ whiteSpace: "nowrap" }}>{ROLE_LABEL[r.role]}</td>
                  <td>
                    {r.error ? (
                      <span style={{ color: "var(--danger)" }}>{r.error}</span>
                    ) : (
                      <div style={{ display: "grid", gap: 4 }}>
                        {r.rows.map((row) => (
                          <div key={row.id} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <span className={`tag ${row.department}`}>{DEPARTMENT_LABEL[row.department as Department]}</span>
                            <span>{row.title}</span>
                            <span className="faint small mono">{row.similarity.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
