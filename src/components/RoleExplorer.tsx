"use client";

import { useState } from "react";
import { DEPARTMENT_LABEL, DEMO_USERS, ROLE_DEPARTMENTS, ROLE_LABEL, type Department, type Role } from "@/lib/roles";

const DEPTS: { key: Department; blurb: string }[] = [
  { key: "general", blurb: "Handbook, PTO, expenses, benefits" },
  { key: "finance", blurb: "Revenue, profit, budgets" },
  { key: "hr", blurb: "Salaries, contact details, attrition" },
  { key: "marketing", blurb: "Campaigns, spend, launch plans" },
];

const EXAMPLE: Record<Role, { q: string; a: string }> = {
  employee: { q: "What was total profit in 2025?", a: "Refused. The database never sends Finance documents for Sam, so the AI has nothing to reveal." },
  finance: { q: "What is Jordan's salary?", a: "Refused. Salaries live in HR, which Priya's role can't read." },
  hr: { q: "What is the attrition rate in Sales?", a: "Answered, with the HR report it came from." },
  marketing: { q: "What is the Project Bluefin budget?", a: "Answered. It's Mateo's own department." },
  executive: { q: "Summarise 2025 profit by region.", a: "Answered. Elena can read everything, and also sees the admin console." },
};

/** Click a person, see which "rooms" the database opens for them. */
export function RoleExplorer({ counts }: { counts: Partial<Record<Department, number>> }) {
  const [role, setRole] = useState<Role>("employee");
  const person = DEMO_USERS.find((u) => u.role === role)!;
  const allowed = ROLE_DEPARTMENTS[role];
  const visible = allowed.reduce((n, d) => n + (counts[d] ?? 0), 0);
  const total = DEPTS.reduce((n, d) => n + (counts[d.key] ?? 0), 0);

  return (
    <div className="explorer">
      <div className="explorer-people" role="tablist" aria-label="Pick a person">
        {DEMO_USERS.map((u) => (
          <button
            key={u.role}
            role="tab"
            aria-selected={u.role === role}
            className={`person ${u.role === role ? "on" : ""}`}
            onClick={() => setRole(u.role)}
          >
            <span className="avatar" aria-hidden>
              {u.name.split(" ").map((p) => p[0]).join("")}
            </span>
            <span>
              <strong>{u.name}</strong>
              <span className="small muted">{ROLE_LABEL[u.role]}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="explorer-rooms">
        {DEPTS.map((d) => {
          const ok = allowed.includes(d.key);
          return (
            <div key={d.key} className={`room ${ok ? "open" : "locked"}`}>
              <div className="room-head">
                <span className={`tag ${d.key}`}>{DEPARTMENT_LABEL[d.key]}</span>
                <span className="room-state">{ok ? "Open" : "Locked"}</span>
              </div>
              <p className="small muted">{d.blurb}</p>
              {counts[d.key] !== undefined && (
                <p className="room-count">
                  {counts[d.key]} <span className="small faint">passages</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="explorer-foot">
        <p>
          <strong>{person.name}</strong> can search{" "}
          {total > 0 ? (
            <>
              <strong>{visible}</strong> of {total} passages
            </>
          ) : (
            <strong>{allowed.length} of 4 departments</strong>
          )}
          . The rest stay in the database and never reach the AI.
        </p>
        <p className="small muted" style={{ marginTop: 6 }}>
          “{EXAMPLE[role].q}” → {EXAMPLE[role].a}
        </p>
      </div>
    </div>
  );
}
