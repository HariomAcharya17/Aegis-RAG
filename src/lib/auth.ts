import { cookieClient, tokenClient, type Db } from "@/lib/supabase/server";
import { unverifiedClaims } from "@/lib/jwt";
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
  let token: string | undefined;

  if (header.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length).trim();
    db = tokenClient(token);
  } else {
    db = await cookieClient();
    // Local cookie read; only hits the network when the access token needs a refresh.
    const { data } = await db.auth.getSession();
    token = data.session?.access_token;
  }
  const userId = token ? unverifiedClaims(token)?.sub : undefined;
  if (!userId) return null;

  // One round trip instead of two (auth.getUser + profiles). This query IS the
  // verification: PostgREST checks the token's signature and expiry and
  // rejects a forged or expired one, and RLS only returns this row to the
  // owner of the token (or an executive, who is then genuinely an executive).
  const { data: profile, error } = await db
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile || !isRole(profile.role)) return null;

  const email = (profile.email as string | null) ?? "";
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
