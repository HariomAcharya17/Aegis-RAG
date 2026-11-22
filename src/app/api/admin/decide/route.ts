import { getSessionUser } from "@/lib/auth";
import { json } from "@/lib/stream";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  if (user.role !== "executive") return json({ error: "Executives only" }, 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  const approve = body.approve === true;
  const hours = Number.isFinite(Number(body.hours)) ? Number(body.hours) : 24;
  if (!Number.isInteger(id)) return json({ error: "Bad request id" }, 400);

  // The SQL function re-checks is_executive(): the API check is convenience, the DB check is the rule.
  const { error } = await user.db.rpc("decide_access_request", { request_id: id, approve, hours });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}
