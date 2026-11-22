import { getSessionUser } from "@/lib/auth";
import { rateLimited, recordRun, runPipeline, type PipelineInput } from "@/lib/pipeline";
import { json, ndjsonResponse, publicResult } from "@/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { question?: unknown; history?: unknown };

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 2000) return json({ error: "Question must be 1 to 2000 characters" }, 400);

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (h): h is { role: "user" | "assistant"; content: string } =>
            !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string",
        )
        .slice(-6)
    : [];

  if (await rateLimited(user.id)) return json({ error: "Too many questions in the last minute. Wait a moment." }, 429);

  const isEval = req.headers.get("x-eval-run") === "1";

  return ndjsonResponse(async (send) => {
    const input: PipelineInput = {
      question,
      history,
      actor: { id: user.id, email: user.email, name: user.fullName, role: user.role },
      db: user.db,
      mode: "secure",
      surface: isEval ? "eval" : "chat",
      onStatus: (text) => send({ type: "status", text }),
    };
    const { result, trace } = await runPipeline(input);
    // Evals need the cited chunk text to score faithfulness; executives get diagnostics.
    send({ type: "result", ...publicResult(result, user.role === "executive" || isEval) });
    await recordRun(input, result, trace);
  });
}
