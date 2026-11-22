# Aegis RAG

A role-aware internal RAG assistant where **access control is enforced by the database, not the prompt**. Demo tenant: **Kestrel Assist** for the fictional Kestrel Dynamics.
Each role sees only its own department's documents and data, because Postgres Row Level Security filters
retrieval before the model is called. Jailbreaks have nothing to leak.

Built entirely on free tiers: Vercel, Supabase, Groq, Gemini embeddings, Langfuse, GitHub Actions.

- **Landing page + story mode**: a plain-language explainer at `/` with an animated "same question, two chatbots" replay, and five playable stories (curious intern, social engineer, HR manager, finance analyst, executive) driven by a guide panel that switches persona and asks the questions for you
- **Assistant**: hybrid search (pgvector + full text), typed tools over HR / finance / marketing tables, citations, follow-up rewriting
- **Guardrails**: Llama Prompt Guard 2, a written safety policy run by gpt-oss-safeguard, out-of-scope detection, PII redaction, canary-token leak scan, ingestion-time injection scan
- **Red team arena**: attack a prompt-only design and the database-enforced design side by side; successful attacks become regression tests
- **Access requests**: "2 HR sections match, request access?" with executive approval and expiring grants (1 hour in the demo)
- **Admin**: audit log, shadow cost, p95 latency, "view as role" retrieval comparison
- **Answer trace**: every answer shows "How this answer was made", each safety layer and what it decided
- **Eval gate**: every Vercel deployment is replayed against the eval suite in GitHub Actions; leakage must be 0

Read `CASE_STUDY.txt` for the full walkthrough of how and why it works.

## Setup

You need: a Supabase project, a Vercel account, a GitHub repo, a Groq API key (console.groq.com) and a
Gemini API key (aistudio.google.com). Langfuse and a Discord webhook are optional.

### 1. Database

Supabase Dashboard > SQL Editor > New query > paste `supabase/schema.sql` > Run.

Recommended: Authentication > Sign In / Providers > turn off "Allow new users to sign up". (New signups would
only ever get the `employee` role, but there's no reason to allow them.)

### 2. Build the data in Colab

1. Open `notebooks/kestrel_ingest.ipynb` in Google Colab (File > Upload notebook).
2. Add `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`) in the Secrets panel (key icon).
3. Runtime > Run all. It downloads three Kaggle datasets, builds about 85 documents and 300 chunks, embeds them, and downloads `kestrel_data.zip`.
4. Put the zip at `data/kestrel_data.zip` in this repo. `data/` is gitignored.

### 3. Load data and demo users

```bash
cp .env.example .env.local        # fill in the values
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/load_data.py data/kestrel_data.zip
python scripts/seed_users.py
```

### 4. Run locally

```bash
npm install
npm run dev                       # http://localhost:3000
BASE_URL=http://localhost:3000 npm run evals
```

### 5. Deploy

1. Push to GitHub, then import the repo in Vercel.
2. Add every variable from `.env.example` in Vercel > Settings > Environment Variables, except `DATABASE_URL`, which only the scripts use. Generate `CRON_SECRET` with `openssl rand -hex 32`.
3. In GitHub > Settings > Secrets and variables > Actions, add: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PASSWORD`, `GROQ_API_KEY`, and optionally `DISCORD_WEBHOOK_URL`.
4. Preview deployments are behind Vercel Authentication by default. Go to Vercel > Settings > Deployment Protection > Protection Bypass for Automation, create a secret, and add it to GitHub as `VERCEL_AUTOMATION_BYPASS_SECRET`.
5. To block merges: GitHub > Settings > Branches > add a rule for `main` > require the `evals` status check.

## Project map

```
supabase/schema.sql          tables, RLS policies, search + tool functions
notebooks/kestrel_ingest.ipynb   Kaggle data to documents, chunks, embeddings, evals (Colab)
scripts/load_data.py         pickles into Supabase
scripts/seed_users.py        five demo accounts with roles
src/lib/pipeline.ts          the request pipeline: guards, retrieval, tools, output checks
src/lib/guardrails.ts        Prompt Guard, safety policy, scope check, canaries
src/lib/tools.ts             typed tools the model can call
src/lib/observability.ts     shadow cost, Langfuse traces, Discord alerts
src/app/api/*                chat, arena, access requests, admin, daily cron
evals/run-evals.ts           eval gate (leakage, refusal, correctness, faithfulness)
```

## Notes

- Vercel Hobby is for non-commercial use, which suits a portfolio demo.
- Supabase pauses free projects after a week without activity. The daily cron touches the database, which prevents that.
- The Groq free tier has per-minute limits. The app retries briefly, rate-limits each user (12 requests a minute by default), and the eval runner waits between cases.
- While a demo account has a temporary grant (1 hour), the eval runner skips that role's refusal tests and says so.
- All people, emails and phone numbers are synthetic (`kestrel.example.com` is a reserved domain).
