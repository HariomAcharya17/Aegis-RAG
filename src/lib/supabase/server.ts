import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { optionalEnv, supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "@/lib/env";
import { DEMO_USERS } from "@/lib/roles";

export type Db = SupabaseClient;

const noPersist = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Client acting as the signed-in browser user (session from cookies). RLS applies. */
export async function cookieClient(): Promise<Db> {
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. Safe to ignore.
        }
      },
    },
  }) as unknown as Db;
}

/** Client acting as the user who owns this access token (eval runner, arena). RLS applies. */
export function tokenClient(accessToken: string): Db {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: noPersist,
  });
}

/** Service-role client. BYPASSES RLS. Server only: logging, canaries, arena weak mode. */
export function adminClient(): Db {
  return createClient(supabaseUrl(), supabaseServiceKey(), { auth: noPersist });
}

// The arena always attacks as the low-privilege demo employee, whoever is
// logged in, using that user's real JWT so the database policies decide.
let arenaSession: { client: Db; expiresAt: number } | null = null;

export async function arenaEmployeeClient(): Promise<Db> {
  const now = Math.floor(Date.now() / 1000);
  if (arenaSession && arenaSession.expiresAt - 60 > now) return arenaSession.client;

  const password = optionalEnv("DEMO_PASSWORD");
  if (!password) throw new Error("DEMO_PASSWORD is not set, so the arena cannot sign in as the demo employee.");
  const email = DEMO_USERS.find((u) => u.role === "employee")!.email;

  const auth = createClient(supabaseUrl(), supabaseAnonKey(), { auth: noPersist });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Arena sign-in failed: ${error?.message ?? "no session"}`);

  arenaSession = {
    client: tokenClient(data.session.access_token),
    expiresAt: data.session.expires_at ?? now + 3000,
  };
  return arenaSession.client;
}
