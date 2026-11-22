"use client";

import { useEffect, useRef, useState } from "react";
import { Answer, readEvents } from "@/components/Answer";
import { DEPARTMENT_LABEL, ROLE_DEPARTMENTS, ROLE_LABEL, type Department, type Role } from "@/lib/roles";

type Citation = { n: number; id: string; title: string; department: string; content: string; similarity: number };
type Result = {
  status: "answered" | "refused" | "out_of_scope" | "blocked" | "error";
  answer: string;
  citations: Citation[];
  restricted: { department: string; matches: number }[];
  blockedBy: string | null;
  tools: { name: string; rows: number }[];
  latencyMs: number;
  usage?: { input: number; output: number };
  costUsd?: number;
};
type Msg = { id: string; role: "user" | "assistant"; content: string; result?: Result; error?: string };

export function ChatClient({
  firstName,
  role,
  suggestions,
  showDiagnostics,
}: {
  firstName: string;
  role: Role;
  suggestions: string[];
  showDiagnostics: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status !== null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: q }]);
    setDraft("");
    setStatus("Starting");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      await readEvents(res, (e) => {
        if (e.type === "status") setStatus(String(e.text));
        if (e.type === "error") throw new Error(String(e.message));
        if (e.type === "result") {
          const result = e as unknown as Result;
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: result.answer, result }]);
        }
      });
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: "", error: err instanceof Error ? err.message : "Something went wrong" },
      ]);
    } finally {
      setStatus(null);
    }
  }

  const readable = ROLE_DEPARTMENTS[role].map((d) => DEPARTMENT_LABEL[d]).join(", ");

  return (
    <main className="chat">
      <div className="chat-scroll">
        <div className="chat-inner">
          {messages.length === 0 && (
            <div style={{ paddingTop: "8vh" }}>
              <h1>Good to see you, {firstName}.</h1>
              <p className="lede" style={{ marginTop: 8 }}>
                You&apos;re signed in as {ROLE_LABEL[role]}, so I can read: {readable}. Ask about anything in there.
              </p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg user">
                <div className="bubble">{m.content}</div>
              </div>
            ) : (
              <AssistantMessage key={m.id} msg={m} showDiagnostics={showDiagnostics} lastQuestion={lastUserBefore(messages, m.id)} />
            ),
          )}

          {status && (
            <div className="msg">
              <div className="status-line">
                <span className="pulse" aria-hidden /> {status}…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="composer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={1}
            placeholder="Ask about policies, people, numbers…"
            aria-label="Your question"
            maxLength={2000}
          />
          <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
            Ask
          </button>
        </form>
      </div>
    </main>
  );
}

function lastUserBefore(messages: Msg[], id: string): string {
  const idx = messages.findIndex((m) => m.id === id);
  for (let i = idx - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return "";
}

function AssistantMessage({ msg, showDiagnostics, lastQuestion }: { msg: Msg; showDiagnostics: boolean; lastQuestion: string }) {
  const [openSource, setOpenSource] = useState<number | null>(null);
  if (msg.error) {
    return (
      <div className="msg">
        <p className="notice danger">{msg.error}</p>
      </div>
    );
  }
  const r = msg.result!;
  const withheld = r.restricted.filter((x) => x.matches > 0);

  return (
    <div className="msg">
      {r.status === "blocked" || r.status === "out_of_scope" ? (
        <p className={`notice ${r.status === "blocked" ? "danger" : ""}`}>{r.answer}</p>
      ) : (
        <Answer text={r.answer} onCite={(n) => setOpenSource(n)} />
      )}

      {r.citations.length > 0 && (
        <div className="sources">
          {r.citations.map((c) => (
            <details key={c.n} className="source" open={openSource === c.n} onToggle={(e) => {
                const isOpen = e.currentTarget.open;
                setOpenSource((cur) => (isOpen ? c.n : cur === c.n ? null : cur));
              }}>
              <summary>
                <span className="cite" style={{ cursor: "inherit" }}>
                  {c.n}
                </span>
                <span>{c.title}</span>
                <span className={`tag ${c.department}`} style={{ marginLeft: "auto" }}>
                  {DEPARTMENT_LABEL[c.department as Department] ?? c.department}
                </span>
              </summary>
              <pre>{c.content.replace(/^\[[^\]]+\]\n/, "")}</pre>
            </details>
          ))}
        </div>
      )}

      {withheld.length > 0 && <RestrictedNotice withheld={withheld} question={lastQuestion} />}

      <div className="meta-line">
        {r.tools.length > 0 && <span>Queried {r.tools.map((t) => t.name.replace(/_/g, " ")).join(", ")}</span>}
        <span>{(r.latencyMs / 1000).toFixed(1)}s</span>
        {showDiagnostics && r.usage && (
          <span>
            {r.usage.input + r.usage.output} tokens · ${r.costUsd?.toFixed(5)} shadow cost
          </span>
        )}
      </div>
    </div>
  );
}

function RestrictedNotice({ withheld, question }: { withheld: { department: string; matches: number }[]; question: string }) {
  const [dept, setDept] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send() {
    setState("sending");
    const res = await fetch("/api/access-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ department: dept, reason, question }),
    });
    if (res.ok) setState("sent");
    else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't send the request");
      setState("error");
    }
  }

  const label = (d: string) => DEPARTMENT_LABEL[d as Department] ?? d;

  return (
    <div className="notice warn" style={{ marginTop: 14 }}>
      <p>
        {withheld.map((w) => `${w.matches} ${label(w.department)}`).join(" and ")} document section
        {withheld.reduce((n, w) => n + w.matches, 0) === 1 ? "" : "s"} match this question but are outside your access. Their contents were not sent to the model.
      </p>
      {state === "sent" ? (
        <p style={{ marginTop: 8 }}>Request sent. An executive can approve temporary access from the admin console.</p>
      ) : dept === null ? (
        <div className="row" style={{ marginTop: 10 }}>
          {withheld.map((w) => (
            <button key={w.department} className="btn small" type="button" onClick={() => setDept(w.department)}>
              Request {label(w.department)} access
            </button>
          ))}
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 10 }}>
          <div>
            <label htmlFor="reason">Why do you need {label(dept)} access?</label>
            <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <div className="row">
            <button className="btn small primary" type="button" disabled={reason.trim().length < 5 || state === "sending"} onClick={send}>
              Send request
            </button>
            <button className="btn small ghost" type="button" onClick={() => setDept(null)}>
              Cancel
            </button>
            {state === "error" && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
