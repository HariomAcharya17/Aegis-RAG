"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { switchDemoUser } from "@/app/auth/actions";
import { DEMO_USERS, ROLE_LABEL, type Role } from "@/lib/roles";

type Action =
  | { kind: "signin"; role: Role; next: string; label: string }
  | { kind: "ask"; question: string; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "none" };

type Step = { title: string; body: string; role: Role | null; action: Action };

const ASK_PROFIT = "What was total profit in 2025?";

export const GUIDE_STEPS: Step[] = [
  {
    title: "Meet Sam, a regular employee",
    body: "Each demo account is a different person at the fictional company Kestrel Dynamics. Sam is an ordinary employee who may only read the general handbook.",
    role: "employee",
    action: { kind: "signin", role: "employee", next: "/chat", label: "Become Sam" },
  },
  {
    title: "Ask an everyday question",
    body: "Sam asks about holidays. The answer cites the handbook page it came from. Open “How this answer was made” under it to see every check it passed.",
    role: "employee",
    action: { kind: "ask", question: "How many PTO days do I get?", label: "Ask it" },
  },
  {
    title: "Ask for numbers Sam can't see",
    body: "Now Sam asks for company profit. For Sam, the database never hands Finance documents to the AI, so there is nothing to leak. Sam is told the data exists and can ask for access.",
    role: "employee",
    action: { kind: "ask", question: ASK_PROFIT, label: "Ask it" },
  },
  {
    title: "Request access",
    body: "Under that answer, click “Request Finance access”, write a short reason, and send it. Then click Next.",
    role: "employee",
    action: { kind: "none" },
  },
  {
    title: "Become Elena, the executive",
    body: "Elena runs the admin console: access requests, a log of every question asked, and what the traffic would cost.",
    role: null,
    action: { kind: "signin", role: "executive", next: "/admin", label: "Become Elena" },
  },
  {
    title: "Approve Sam's request",
    body: "Under “Access requests”, click “Grant 1 hour” next to Sam's request. Scroll down to see every question in the audit log, including the one Sam was refused.",
    role: "executive",
    action: { kind: "none" },
  },
  {
    title: "Back to Sam",
    body: "Ask the profit question again. The database now includes Finance for Sam for one hour, so the answer appears, with its source.",
    role: "employee",
    action: { kind: "signin", role: "employee", next: `/chat?ask=${encodeURIComponent(ASK_PROFIT)}`, label: "Become Sam and ask" },
  },
  {
    title: "Now try to break it",
    body: "In the red team arena, run the same attack against two designs: a chatbot that is only told to keep secrets, and Aegis. Watch which one leaks.",
    role: null,
    action: { kind: "link", href: "/arena", label: "Open the arena" },
  },
];

const STEP_KEY = "aegis-guide-step";
const OPEN_KEY = "aegis-guide-open";

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the guide still works, it just won't remember
  }
}

export function DemoGuide({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedStep = 0;
    let savedOpen = false;
    try {
      savedStep = Number(localStorage.getItem(STEP_KEY) ?? "0") || 0;
      savedOpen = localStorage.getItem(OPEN_KEY) === "1";
    } catch {}
    const params = new URLSearchParams(window.location.search);
    if (params.get("guide") === "1") {
      savedOpen = true;
      savedStep = Math.max(savedStep, 1); // they just became Sam from the landing page
      store(OPEN_KEY, "1");
    }
    setStep(Math.min(savedStep, GUIDE_STEPS.length - 1));
    setOpen(savedOpen);
    setReady(true);
  }, []);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(n, GUIDE_STEPS.length - 1));
    setStep(next);
    store(STEP_KEY, String(next));
  };
  const toggle = (value: boolean) => {
    setOpen(value);
    store(OPEN_KEY, value ? "1" : "0");
  };

  useEffect(() => {
    document.documentElement.classList.toggle("guide-open", ready && open);
    return () => document.documentElement.classList.remove("guide-open");
  }, [ready, open]);

  if (!ready) return null;

  if (!open) {
    return (
      <button type="button" className="guide-pill" onClick={() => toggle(true)}>
        Demo guide · step {step + 1} of {GUIDE_STEPS.length}
      </button>
    );
  }

  const s = GUIDE_STEPS[step];
  const wrongRole = s.role !== null && s.role !== role;
  const person = (r: Role) => DEMO_USERS.find((u) => u.role === r)!.name;

  const ask = (q: string) => {
    if (pathname === "/chat") window.dispatchEvent(new CustomEvent("aegis:ask", { detail: q }));
    else router.push(`/chat?ask=${encodeURIComponent(q)}`);
  };

  return (
    <aside className="guide" aria-label="Demo guide">
      <div className="guide-top">
        <span className="small faint">
          Demo guide · step {step + 1} of {GUIDE_STEPS.length}
        </span>
        <button type="button" className="btn ghost small" onClick={() => toggle(false)} aria-label="Hide guide">
          Hide
        </button>
      </div>
      <div className="guide-progress" aria-hidden>
        {GUIDE_STEPS.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <h3>{s.title}</h3>
      <p className="small">{s.body}</p>

      {wrongRole && s.action.kind !== "signin" && (
        <form action={switchDemoUser} className="notice small" style={{ marginTop: 10 }}>
          <input type="hidden" name="role" value={s.role!} />
          <input type="hidden" name="next" value="/chat" />
          You&apos;re signed in as {person(role)} ({ROLE_LABEL[role]}). This step is for {person(s.role!)}.{" "}
          <button type="submit" className="link-btn">
            Switch to {person(s.role!)}
          </button>
        </form>
      )}

      <div className="row guide-actions">
        {step > 0 && (
          <button type="button" className="btn ghost small" onClick={() => go(step - 1)}>
            Back
          </button>
        )}
        <span style={{ flex: 1 }} />
        {s.action.kind === "signin" && (
          <form action={switchDemoUser} onSubmit={() => go(step + 1)}>
            <input type="hidden" name="role" value={s.action.role} />
            <input type="hidden" name="next" value={s.action.next} />
            <button type="submit" className="btn primary small">
              {s.action.label}
            </button>
          </form>
        )}
        {s.action.kind === "ask" && !wrongRole && (
          <button type="button" className="btn primary small" onClick={() => ask((s.action as { question: string }).question)}>
            {s.action.label}
          </button>
        )}
        {s.action.kind === "link" && (
          <button type="button" className="btn primary small" onClick={() => router.push((s.action as { href: string }).href)}>
            {s.action.label}
          </button>
        )}
        {step < GUIDE_STEPS.length - 1 ? (
          <button type="button" className="btn small" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn small" onClick={() => { go(0); toggle(false); }}>
            Finish
          </button>
        )}
      </div>
    </aside>
  );
}
