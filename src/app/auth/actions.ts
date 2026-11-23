"use server";

import { redirect } from "next/navigation";
import { demoMode, optionalEnv } from "@/lib/env";
import { unverifiedClaims } from "@/lib/jwt";
import { DEMO_USERS, isRole } from "@/lib/roles";
import { cookieClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const db = await cookieClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match an account." };
  redirect("/chat");
}

/** One-click demo login. The shared password never reaches the browser. */
export async function demoSignIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!demoMode()) return { error: "Demo sign-in is turned off." };
  const role = form.get("role");
  const user = DEMO_USERS.find((u) => isRole(role) && u.role === role);
  const password = optionalEnv("DEMO_PASSWORD");
  if (!user || !password) return { error: "Demo accounts aren't configured." };
  const db = await cookieClient();
  const { error } = await db.auth.signInWithPassword({ email: user.email, password });
  if (error) return { error: `Couldn't sign in as ${user.name}. Has scripts/seed_users.py been run?` };
  redirect("/chat");
}

/** Allow only same-site paths, so `next` can't be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/chat";
}

/** Switch demo persona in one click (landing page, guide, top bar). */
export async function switchDemoUser(form: FormData): Promise<void> {
  const role = form.get("role");
  const next = safeNext(form.get("next"));
  const user = DEMO_USERS.find((u) => isRole(role) && u.role === role);
  const password = optionalEnv("DEMO_PASSWORD");
  if (!demoMode() || !user || !password) redirect("/login?error=demo");
  const db = await cookieClient();

  // Already this person? Skip the auth round trip entirely. The cookie is not
  // verified here, but that's fine: this only decides whether to sign in, and
  // the next page verifies the token against the database anyway.
  const { data } = await db.auth.getSession();
  const current = data.session ? unverifiedClaims(data.session.access_token) : null;
  if (current?.email === user.email && (current.exp ?? 0) * 1000 > Date.now() + 60_000) redirect(next);

  // No signOut() first: that is an extra network round trip, and signing in
  // overwrites the session cookies anyway. The old demo session simply expires.
  const { error } = await db.auth.signInWithPassword({ email: user.email, password });
  if (error) redirect("/login?error=demo");
  redirect(next);
}

export async function signOut() {
  const db = await cookieClient();
  await db.auth.signOut();
  redirect("/login");
}
