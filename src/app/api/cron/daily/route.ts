import { numberEnv, optionalEnv } from "@/lib/env";
import { alert } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/server";
import { json } from "@/lib/stream";

export const runtime = "nodejs";

// Runs daily via vercel.json. Three jobs in one (Hobby allows daily crons):
//  1. cost: projects monthly shadow spend from the last 7 days, alerts over budget
//  2. security digest: blocked attempts, canary catches, arena leaks
//  3. keep-alive: touching the database stops Supabase pausing a free project
export async function GET(req: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);

  const db = adminClient();
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const week = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [weekRows, dayRows, arena] = await Promise.all([
    db.from("audit_logs").select("shadow_cost_usd").gte("created_at", week).limit(10000),
    db.from("audit_logs").select("status, blocked_by, shadow_cost_usd, latency_ms").gte("created_at", day).limit(10000),
    db.from("redteam_attempts").select("mode, outcome").gte("created_at", day).limit(10000),
  ]);
  if (weekRows.error || dayRows.error) return json({ error: weekRows.error?.message ?? dayRows.error?.message }, 500);

  const sum = (rows: { shadow_cost_usd: number | string | null }[]) => rows.reduce((s, r) => s + Number(r.shadow_cost_usd ?? 0), 0);
  const weekCost = sum(weekRows.data);
  const dayCost = sum(dayRows.data);
  const projectedMonthly = (weekCost / 7) * 30;
  const budget = numberEnv("MONTHLY_BUDGET_USD", 20);

  const today = dayRows.data;
  const blocked = today.filter((r) => r.status === "blocked").length;
  const canaryCatches = today.filter((r) => r.blocked_by === "output_canary").length;
  const latencies = today.map((r) => r.latency_ms ?? 0).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const arenaLeaksWeak = (arena.data ?? []).filter((r) => r.mode === "prompt_only" && r.outcome === "leaked").length;

  const lines = [
    `Kestrel Assist daily report`,
    `Requests 24h: ${today.length}  |  blocked: ${blocked}  |  p95 latency: ${p95} ms`,
    `Shadow cost 24h: $${dayCost.toFixed(4)}  |  projected month: $${projectedMonthly.toFixed(2)} of $${budget} budget`,
    `Arena: ${(arena.data ?? []).length} attempts, ${arenaLeaksWeak} leaks against prompt-only mode`,
  ];
  if (canaryCatches > 0) lines.unshift(`[CRITICAL] ${canaryCatches} canary leak(s) caught in secure mode in the last 24h`);
  if (projectedMonthly > budget) lines.unshift(`[BUDGET] Projected spend $${projectedMonthly.toFixed(2)} exceeds $${budget}`);

  await alert(lines.join("\n"));
  return json({ ok: true, dayCost, weekCost, projectedMonthly, budget, requests: today.length, blocked, canaryCatches });
}
