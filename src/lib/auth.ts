import { cookieClient, tokenClient, type Db } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Supabase client scoped to this user. Every query through it is filtered by RLS. */
  db: Db;
};

/**
 * Resolves the caller from either a Bearer token (eval runner, scripts) or
 * the session cookie (browser). Returns null when not signed in.
 * The role always comes from public.profiles, never from the client.
 */
export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  const header = req?.headers.get("authorization") ?? "";
  let db: Db;
  let userId: string;
  let email: string;

  if (header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    db = tokenClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    userId = data.user.id;
    email = data.user.email ?? "";
  } else {
    db = await cookieClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return null;
    userId = data.user.id;
    email = data.user.email ?? "";
  }

  const { data: profile } = await db
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !isRole(profile.role)) return null;

  return {
    id: userId,
    email,
    fullName: (profile.full_name as string | null) ?? email.split("@")[0],
    role: profile.role,
    db,
  };
}

export async function allowedDepartments(db: Db): Promise<string[]> {
  const { data, error } = await db.rpc("allowed_departments");
  if (error) throw new Error(`allowed_departments failed: ${error.message}`);
  return (data as string[] | null) ?? [];
}
