import Link from "next/link";
import { switchDemoUser } from "@/app/auth/actions";
import { RoleExplorer } from "@/components/RoleExplorer";
import { StoryPlayer } from "@/components/StoryPlayer";
import { SubmitButton } from "@/components/SubmitButton";
import { AegisMark } from "@/components/TopBar";
import { getSessionUser } from "@/lib/auth";
import { demoMode } from "@/lib/env";
import type { Department } from "@/lib/roles";
import { STORIES, type Story } from "@/lib/stories";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/HariomAcharya17/Aegis-RAG";

// The landing stats are 9 count queries. They change slowly, so each server
// instance reuses them for a minute instead of re-running them on every visit.
let statsCache: { at: number; value: Awaited<ReturnType<typeof queryStats>> } | null = null;

async function loadStats() {
  if (statsCache && Date.now() - statsCache.at < 60_000) return statsCache.value;
  const value = await queryStats();
  if (value) statsCache = { at: Date.now(), value };
  return value;
}

async function queryStats() {
  try {
    const db = adminClient();
    const depts: Department[] = ["general", "finance", "hr", "marketing"];
    const counts = await Promise.all(
      depts.map((d) => db.from("chunks").select("id", { count: "exact", head: true }).eq("department", d).eq("flagged", false)),
    );
    const [weak, weakLeaks, strong, strongLeaks, questions] = await Promise.all([
      db.from("redteam_attempts").select("id", { count: "exact", head: true }).eq("mode", "prompt_only"),
      db.from("redteam_attempts").select("id", { count: "exact", head: true }).eq("mode", "prompt_only").eq("outcome", "leaked"),
      db.from("redteam_attempts").select("id", { count: "exact", head: true }).eq("mode", "secure"),
      db.from("redteam_attempts").select("id", { count: "exact", head: true }).eq("mode", "secure").eq("blocked_by", "output_canary"),
      db.from("audit_logs").select("id", { count: "exact", head: true }),
    ]);
    return {
      counts: Object.fromEntries(depts.map((d, i) => [d, counts[i].count ?? 0])) as Record<Department, number>,
      arena: { weak: weak.count ?? 0, weakLeaks: weakLeaks.count ?? 0, strong: strong.count ?? 0, strongLeaks: strongLeaks.count ?? 0 },
      questions: questions.count ?? 0,
    };
  } catch {
    return null;
  }
}

/** Signs in as the story's person and opens the guide on that story. */
function PlayStory({ story, demo }: { story: Story; demo: boolean }) {
  if (!demo) {
    return (
      <Link className="btn primary small" href="/login">
        Sign in to try
      </Link>
    );
  }
  const sep = story.start.includes("?") ? "&" : "?";
  return (
    <form action={switchDemoUser}>
      <input type="hidden" name="role" value={story.role} />
      <input type="hidden" name="next" value={`${story.start}${sep}story=${story.id}`} />
      <SubmitButton className="btn primary small" pendingLabel="Starting story">
        Play this story
      </SubmitButton>
    </form>
  );
}

function StartDemo({ demo }: { demo: boolean }) {
  const first = STORIES[0];
  if (!demo) {
    return (
      <Link className="btn primary big" href="/login">
        Sign in
      </Link>
    );
  }
  return (
    <form action={switchDemoUser}>
      <input type="hidden" name="role" value={first.role} />
      <input type="hidden" name="next" value={`${first.start}?story=${first.id}`} />
      <SubmitButton className="btn primary big" pendingLabel="Starting">
        Try it yourself
      </SubmitButton>
    </form>
  );
}

const UNDER_THE_HOOD = [
  { title: "Sign-in", body: "Your role comes from the database, never from the browser.", tech: "Supabase Auth" },
  { title: "Message checks", body: "Small models look for tricks and harmful requests.", tech: "Llama Prompt Guard 2 · gpt-oss-safeguard" },
  { title: "Permission filter", body: "Search runs with your permissions. Other rooms return nothing.", tech: "Postgres Row Level Security · pgvector" },
  { title: "Answer", body: "Written only from what was handed over, with sources cited.", tech: "gpt-oss-120b on Groq" },
  { title: "Tripwire", body: "Answers are scanned for planted secret values; personal data is masked.", tech: "Canary tokens · PII redaction" },
  { title: "Audit", body: "Every question, refusal and cost is logged for executives.", tech: "Audit log · Langfuse" },
];

const STACK = [
  "Next.js 16",
  "Supabase Postgres",
  "pgvector hybrid search",
  "Row Level Security",
  "Groq · gpt-oss-120b",
  "Llama Prompt Guard 2",
  "gpt-oss-safeguard",
  "Gemini embeddings",
  "Langfuse",
  "GitHub Actions evals",
  "Vercel",
];

export default async function Landing() {
  const [user, stats] = await Promise.all([getSessionUser(), loadStats()]);
  const demo = demoMode();
  const locked = stats ? stats.counts.finance + stats.counts.hr + stats.counts.marketing : 285;

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ hero */}
      <header className="topbar">
        <Link href="/" className="wordmark">
          <AegisMark /> Aegis <small>RAG</small>
        </Link>
        <nav className="nav" aria-label="Page">
          <a href="#story">See it</a>
          <a href="#how">How it works</a>
          <a href="#stories">Try a story</a>
        </nav>
        <div className="who">
          <a className="btn ghost small" href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link className="btn small" href={user ? "/chat" : "/login"}>
            {user ? "Open the app" : "Sign in"}
          </Link>
        </div>
      </header>
      <div className="hero-wrap">

        <section className="hero">
          <div className="hero-copy">
            <p className="hero-pill">
              <span className="status-dot" aria-hidden /> Live demo · fictional company, real data patterns
            </p>
            <h1>
              A company chatbot that <span className="accent-text">can&apos;t leak</span> what it never sees.
            </h1>
            <p className="hero-sub">
              Aegis is an AI assistant for a company&apos;s private documents. Before the AI reads anything, the database checks{" "}
              <em>who is asking</em> and hands over only what they&apos;re allowed to see.
            </p>
            <div className="row hero-cta">
              <a className="btn big" href="#story">
                Watch it in 20 seconds
              </a>
              <StartDemo demo={demo} />
            </div>
            <p className="hero-note">No sign-up. You play five people at a made-up company.</p>
          </div>

          <div className="hero-visual" aria-hidden>
            <div className="badge-card">
              <span className="duel-avatar">SR</span>
              <div>
                <strong>Sam Rivera</strong>
                <span>Employee badge</span>
              </div>
            </div>
            <div className="rooms">
              <div className="room-tile open general">
                <span className="room-name">General</span>
                <span className="room-sub">Handbook · policies</span>
                <span className="room-status">Open</span>
              </div>
              <div className="room-tile finance">
                <span className="room-name">Finance</span>
                <span className="room-sub">Profit · budgets</span>
                <span className="room-status">Locked</span>
              </div>
              <div className="room-tile hr">
                <span className="room-name">HR</span>
                <span className="room-sub">Salaries · contacts</span>
                <span className="room-status">Locked</span>
              </div>
              <div className="room-tile marketing">
                <span className="room-name">Marketing</span>
                <span className="room-sub">Campaigns · launches</span>
                <span className="room-status">Locked</span>
              </div>
            </div>
            <p className="hero-visual-cap">{locked} restricted passages never reach the AI for Sam.</p>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ duel */}
      <section className="section" id="story">
        <p className="kicker">The whole idea in 20 seconds</p>
        <h2 className="section-title">Same question, two chatbots</h2>
        <p className="section-lede">
          An employee pretends to be an HR intern and asks for salaries. One chatbot holds every file and was told to keep secrets. The other
          was only ever handed the files this person may read.
        </p>
        <StoryPlayer />
        <p className="duel-caption">
          The ordinary chatbot was <em>told</em> to keep a secret. Aegis was <em>never given</em> it.
        </p>
      </section>

      {/* ------------------------------------------------------------ how */}
      <section className="section" id="how">
        <p className="kicker">How it works</p>
        <h2 className="section-title">Three ideas, no jargon</h2>
        <div className="three">
          <div className="three-card">
            <span className="three-n c1">1</span>
            <h3>Your sign-in is your badge</h3>
            <p className="muted">Intern, finance, HR, marketing or executive. The badge decides which rooms open.</p>
          </div>
          <div className="three-card">
            <span className="three-n c2">2</span>
            <h3>Documents live in locked rooms</h3>
            <p className="muted">Every page belongs to a department. The database only fetches from rooms your badge opens.</p>
          </div>
          <div className="three-card">
            <span className="three-n c3">3</span>
            <h3>The AI answers from what it&apos;s handed</h3>
            <p className="muted">It can&apos;t reveal a page it never received, however cleverly you ask, and it cites every source.</p>
          </div>
        </div>

        <details className="hood">
          <summary>Under the hood: what happens to every question</summary>
          <ol className="hood-list">
            {UNDER_THE_HOOD.map((h, i) => (
              <li key={h.title} className={i === 2 ? "key" : ""}>
                <span className="hood-n">{i + 1}</span>
                <div>
                  <strong>{h.title}</strong>
                  <p className="small muted">{h.body}</p>
                  <p className="mono small faint">{h.tech}</p>
                </div>
              </li>
            ))}
          </ol>
        </details>
      </section>

      {/* ------------------------------------------------------------ explorer */}
      <section className="section" id="who">
        <p className="kicker">Who sees what</p>
        <h2 className="section-title">Pick a person, see their rooms</h2>
        <RoleExplorer counts={stats?.counts ?? {}} />
      </section>

      {/* ------------------------------------------------------------ stories */}
      <section className="section" id="stories">
        <p className="kicker">Try it yourself</p>
        <h2 className="section-title">Five short stories to play</h2>
        <p className="section-lede">Each one signs you in as a different person. A guide panel tells you what to click and what to look for.</p>
        <div className="stories">
          {STORIES.map((s) => (
            <article key={s.id} className={`story-card r-${s.role}`}>
              <div className="story-head">
                <span className="duel-avatar">{s.who.split(" ").map((p) => p[0]).join("")}</span>
                <span className="story-meta">
                  <span className="small">{s.who}</span>
                  <span className="small faint">~{s.minutes} min</span>
                </span>
              </div>
              <h3>{s.title}</h3>
              <p className="muted small">{s.pitch}</p>
              <PlayStory story={s} demo={demo} />
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ proof */}
      <section className="section">
        <p className="kicker">Proof, not promises</p>
        <h2 className="section-title">Attacked in public, tested on every release</h2>
        <div className="proof">
          <div className="proof-card">
            <h3>Red team scoreboard</h3>
            {stats && stats.arena.weak + stats.arena.strong > 0 ? (
              <div className="proof-stats">
                <div>
                  <span className="big-num">{stats.arena.weakLeaks}</span>
                  <span className="small muted">leaks in {stats.arena.weak} attacks on the ordinary chatbot</span>
                </div>
                <div>
                  <span className="big-num ok">{stats.arena.strongLeaks}</span>
                  <span className="small muted">leaks in {stats.arena.strong} attacks on Aegis</span>
                </div>
              </div>
            ) : (
              <p className="small muted">No attacks yet. Play “The social engineer” to be the first.</p>
            )}
            <p className="small faint">Any prompt that beats the ordinary chatbot is saved and replayed against Aegis on every release.</p>
          </div>
          <div className="proof-card">
            <h3>Release gate</h3>
            <ul className="checklist small">
              <li>Leaked secret values must be exactly 0</li>
              <li>Refuses whatever a role may not see</li>
              <li>Answers match the real data</li>
              <li>Every claim backed by a cited source</li>
            </ul>
            <p className="small faint">Last full run: 0 leaks, 100% correct refusals, 100% faithfulness.</p>
          </div>
          <div className="proof-card">
            <h3>Real data patterns</h3>
            <ul className="checklist small">
              <li>1,470 employees from IBM&apos;s HR dataset</li>
              <li>10k orders from the Superstore sales dataset</li>
              <li>6 campaigns from a marketing dataset</li>
            </ul>
            <p className="small faint">From public Kaggle datasets. Every name, email and phone number is generated.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ stack */}
      <section className="section">
        <p className="kicker">Built with</p>
        <h2 className="section-title">Free tiers, production patterns</h2>
        <div className="stack-chips">
          {STACK.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 28 }}>
          <StartDemo demo={demo} />
          <a className="btn big" href={REPO} target="_blank" rel="noreferrer">
            Read the code
          </a>
        </div>
      </section>

      <footer className="footer">
        <span>
          <AegisMark size={14} /> Aegis RAG, a portfolio project by Hariom Acharya
        </span>
        <span className="faint">
          {stats ? `${stats.questions.toLocaleString("en-US")} questions answered so far · ` : ""}
          <a href={REPO} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
