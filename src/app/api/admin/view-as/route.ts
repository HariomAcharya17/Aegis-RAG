import { getSessionUser } from "@/lib/auth";
import { embedQuery } from "@/lib/embed";
import { ROLES } from "@/lib/roles";
import { json } from "@/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 30;

type Row = { id: string; title: string; department: string; similarity: number };

/** Retrieval only, no LLM: what would each role get back for this question? */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "executive") return json({ error: "Executives only" }, 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!question) return json({ error: "Enter a question" }, 400);

  const embedding = await embedQuery(question);
  const results = await Promise.all(
    ROLES.map(async (role) => {
      const { data, error } = await user.db.rpc("view_as_search", {
        target_role: role,
        query_text: question,
        query_embedding: embedding,
        match_count: 5,
      });
      if (error) return { role, error: error.message, rows: [] as Row[] };
      return {
        role,
        rows: ((data as Row[]) ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          department: r.department,
          similarity: Math.round(r.similarity * 100) / 100,
        })),
      };
    }),
  );
  return json({ results });
}
