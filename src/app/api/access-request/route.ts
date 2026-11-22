import { getSessionUser } from "@/lib/auth";
import { alert } from "@/lib/observability";
import { redactPII } from "@/lib/pii";
import { json } from "@/lib/stream";

export const runtime = "nodejs";

const DEPARTMENTS = ["finance", "hr", "marketing"];

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const department = typeof body.department === "string" ? body.department : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const question = typeof body.question === "string" ? redactPII(body.question).text.slice(0, 1000) : null;
  if (!DEPARTMENTS.includes(department)) return json({ error: "Unknown department" }, 400);
  if (reason.length < 5) return json({ error: "Add a short reason" }, 400);

  // Inserted with the USER's client: the RLS insert policy forces user_id = auth.uid().
  const { data: pending } = await user.db
    .from("access_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("department", department)
    .eq("status", "pending")
    .limit(1);
  if (pending && pending.length > 0) return json({ ok: true, duplicate: true });

  const { error } = await user.db.from("access_requests").insert({ user_id: user.id, department, reason, question });
  if (error) return json({ error: error.message }, 400);

  await alert(`Access request: ${user.email} (${user.role}) wants ${department}. Reason: ${reason}`);
  return json({ ok: true });
}
