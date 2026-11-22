// Env access is lazy (read at call time, not import time) so `next build`
// works without secrets and a missing optional key only disables its feature.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

export function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const supabaseUrl = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const supabaseServiceKey = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export const chatModel = () => optionalEnv("GROQ_CHAT_MODEL") ?? "openai/gpt-oss-120b";
export const fastModel = () => optionalEnv("GROQ_FAST_MODEL") ?? "llama-3.1-8b-instant";
export const PROMPT_GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";
export const LLAMA_GUARD_MODEL = "meta-llama/llama-guard-4-12b";

export const demoMode = () => optionalEnv("DEMO_MODE") === "true";
