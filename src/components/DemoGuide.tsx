"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { switchDemoUser } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { DEMO_USERS, ROLE_LABEL, type Role } from "@/lib/roles";
import { STORIES, storyById, type StoryAction } from "@/lib/stories";

const KEY = "aegis-guide";
type Saved = { story: string | null; step: number; open: boolean };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { story: null, step: 0, open: false, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {}
  return { story: null, step: 0, open: false };
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

const person = (r: Role) => DEMO_USERS.find((u) => u.role === r)!.name;

export function DemoGuide({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<Saved>({ story: null, step: 0, open: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = load();
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("story");
    if (fromUrl && storyById(fromUrl)) {
      saved.story = fromUrl;
      saved.step = 0;
      saved.open = true;
      params.delete("story");
      const rest = params.toString();
      window.history.replaceState(null, "", pathname + (rest ? `?${rest}` : ""));
    }
    setState(saved);
    save(saved);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("guide-open", ready && state.open);
    return () => document.documentElement.classList.remove("guide-open");
  }, [ready, state.open]);

  const update = (patch: Partial<Saved>) =>
    setState((cur) => {
      const next = { ...cur, ...patch };
      save(next);
      return next;
    });

  if (!ready) return null;

  if (!state.open) {
    const story = storyById(state.story);
    return (
      <button type="button" className="guide-pill" onClick={() => update({ open: true })}>
        <span className="guide-pill-dot" aria-hidden />
        {story ? `${story.title} · step ${state.step + 1} of ${story.steps.length}` : "Guided demo"}
      </button>
    );
  }

  const story = storyById(state.story);

  // ------------------------------------------------------------ story picker
  if (!story) {
    return (
      <aside className="guide" aria-label="Guided demo">
        <div className="guide-top">
          <span className="guide-kicker">Guided demo</span>
          <button type="button" className="btn ghost small" onClick={() => update({ open: false })}>
            Hide
          </button>
        </div>
        <h3>Pick a story</h3>
        <p className="small">Each takes a minute or two. The panel signs you in as the right person and asks the questions for you.</p>
        <div className="story-list">
          {STORIES.map((s) => (
            <form key={s.id} action={switchDemoUser} onSubmit={() => save({ story: s.id, step: 0, open: true })}>
              <input type="hidden" name="role" value={s.role} />
              <input type="hidden" name="next" value={s.start} />
              <SubmitButton className={`story-item r-${s.role}`}>
                <strong>{s.title}</strong>
                <span className="small muted">{s.pitch}</span>
              </SubmitButton>
            </form>
          ))}
        </div>
      </aside>
    );
  }

  // ------------------------------------------------------------ finished
  if (state.step >= story.steps.length) {
    const lastStep = story.steps[story.steps.length - 1];
    return (
      <aside className="guide" aria-label="Guided demo">
        <div className="guide-top">
          <span className="guide-kicker">{story.title} · done</span>
          <button type="button" className="btn ghost small" onClick={() => update({ open: false })}>
            Hide
          </button>
        </div>
        <div className="guide-progress" aria-hidden>
          {story.steps.map((_, i) => (
            <span key={i} className="on" />
          ))}
        </div>
        <h3>Story complete</h3>
        {lastStep.look && (
          <p className="guide-look small">
            <strong>Look for:</strong> {lastStep.look}
          </p>
        )}
        <p className="small" style={{ marginTop: 10 }}>
          Same assistant, same database. The only thing that changed was who was asking.
        </p>
        <div className="guide-actions">
          <button type="button" className="btn ghost small" onClick={() => update({ step: story.steps.length - 1 })}>
            Back
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary small" onClick={() => update({ story: null, step: 0 })}>
            Play another story
          </button>
        </div>
      </aside>
    );
  }

  // ------------------------------------------------------------ a story step
  const stepIndex = Math.min(state.step, story.steps.length - 1);
  const step = story.steps[stepIndex];
  const last = stepIndex >= story.steps.length - 1;
  const wrongRole = step.role !== null && step.role !== role && step.action.kind !== "signin";

  const run = (a: StoryAction) => {
    if (a.kind === "ask") {
      if (pathname === "/chat") window.dispatchEvent(new CustomEvent("aegis:ask", { detail: a.question }));
      else router.push(`/chat?ask=${encodeURIComponent(a.question)}`);
    }
    if (a.kind === "attack") {
      const detail = { mode: a.mode, target: a.target, prompt: a.prompt };
      if (pathname === "/arena") window.dispatchEvent(new CustomEvent("aegis:attack", { detail }));
      else router.push(`/arena?attack=${encodeURIComponent(JSON.stringify(detail))}`);
    }
    if (a.kind === "link") router.push(a.href);
  };

  return (
    <aside className="guide" aria-label="Guided demo">
      <div className="guide-top">
        <span className="guide-kicker">
          {story.title} · {stepIndex + 1}/{story.steps.length}
        </span>
        <button type="button" className="btn ghost small" onClick={() => update({ open: false })}>
          Hide
        </button>
      </div>
      <div className="guide-progress" aria-hidden>
        {story.steps.map((_, i) => (
          <span key={i} className={i <= stepIndex ? "on" : ""} />
        ))}
      </div>
      <h3>{step.title}</h3>
      <p className="small">{step.body}</p>
      {step.look && (
        <p className="guide-look small">
          <strong>Look for:</strong> {step.look}
        </p>
      )}

      {wrongRole && (
        <form action={switchDemoUser} className="notice small" style={{ marginTop: 10 }}>
          <input type="hidden" name="role" value={step.role!} />
          <input type="hidden" name="next" value={pathname} />
          You&apos;re {person(role)} ({ROLE_LABEL[role]}) right now. This step is for {person(step.role!)}.{" "}
          <SubmitButton className="link-btn" pendingLabel="Switching">
            Switch to {person(step.role!)}
          </SubmitButton>
        </form>
      )}

      <div className="guide-actions">
        {step.action.kind === "signin" && (
          <form action={switchDemoUser} onSubmit={() => save({ ...state, step: stepIndex + 1 })}>
            <input type="hidden" name="role" value={step.action.role} />
            <input type="hidden" name="next" value={step.action.next} />
            <SubmitButton className="btn primary small" pendingLabel="Signing in">
              {step.action.label}
            </SubmitButton>
          </form>
        )}
        {(step.action.kind === "ask" || step.action.kind === "attack" || step.action.kind === "link") && !wrongRole && (
          <button type="button" className="btn primary small" onClick={() => run(step.action)}>
            {step.action.label}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {stepIndex > 0 && (
          <button type="button" className="btn ghost small" onClick={() => update({ step: stepIndex - 1 })}>
            Back
          </button>
        )}
        {last ? (
          <button type="button" className="btn small" onClick={() => update({ step: story.steps.length })}>
            Finish
          </button>
        ) : (
          <button type="button" className="btn small" onClick={() => update({ step: stepIndex + 1 })}>
            Next
          </button>
        )}
      </div>
    </aside>
  );
}
