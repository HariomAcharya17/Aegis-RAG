import { getSessionUser } from "@/lib/auth";
import { rateLimited, recordRun, runPipeline, type Mode, type PipelineInput } from "@/lib/pipeline";
import { DEMO_USERS } from "@/lib/roles";
import { adminClient, arenaEmployeeClient } from "@/lib/supabase/server";
import { json, ndjsonResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 60;

const TARGETS = ["finance", "hr", "marketing"] as const;

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const mode: Mode = body.mode === "prompt_only" ? "prompt_only" : "secure";
  const target = TARGETS.includes(body.target as (typeof TARGETS)[number]) ? (body.target as string) : "hr";
  const handle = (typeof body.handle === "string" ? body.handle : user.fullName).trim().slice(0, 32) || "anonymous";
  if (!prompt || prompt.length > 2000) return json({ error: "Attack prompt must be 1 to 2000 characters" }, 400);
  if (await rateLimited(user.id)) return json({ error: "Too many attempts in the last minute. Wait a moment." }, 429);

  const employee = DEMO_USERS.find((u) => u.role === "employee")!;

  return ndjsonResponse(async (send) => {
    // Every attack runs as the low-privilege demo employee, whoever is logged in.
    const db = mode === "secure" ? await arenaEmployeeClient() : adminClient();
    const input: PipelineInput = {
      question: prompt,
      history: [],
      actor: { id: user.id, email: user.email, name: employee.name, role: "employee" },
      db,
      mode,
      surface: "arena",
      onStatus: (text) => send({ type: "status", text }),
    };
    const { result, trace } = await runPipeline(input);

    const outcome = result.leaked.length > 0 && mode === "prompt_only" ? "leaked" : result.status === "blocked" ? "blocked" : "contained";
    send({
      type: "result",
      outcome,
      status: result.status,
      answer: result.answer,
      layers: result.layers,
      leakedCount: result.leaked.length,
      blockedBy: result.blockedBy,
    });

    const admin = adminClient();
    const writes: PromiseLike<unknown>[] = [
      admin.from("redteam_attempts").insert({
        user_id: user.id,
        handle,
        mode,
        target,
        prompt: prompt.slice(0, 2000),
        outcome,
        blocked_by: result.blockedBy,
        leaked_tokens: result.leaked.slice(0, 20),
      }),
      recordRun(input, result, trace),
    ];
    // A prompt that beat the naive design becomes a permanent regression
    // test for the secure one: the eval suite replays it on every deploy.
    if (outcome === "leaked") {
      writes.push(
        admin.from("eval_cases").upsert(
          {
            source: "redteam",
            role: "employee",
            question: prompt.slice(0, 2000),
            must_refuse: true,
            must_not_contain: result.leaked.slice(0, 10),
          },
          { onConflict: "role,question", ignoreDuplicates: true },
        ),
      );
    }
    await Promise.all(writes);
  });
}
