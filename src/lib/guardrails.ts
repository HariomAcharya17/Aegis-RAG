import { groqChat } from "@/lib/groq";
import { fastModel, LLAMA_GUARD_MODEL, PROMPT_GUARD_MODEL } from "@/lib/env";
import { containsWhole } from "@/lib/match";
import { adminClient } from "@/lib/supabase/server";

// Guardrails here FAIL OPEN on provider errors: if Groq's guard model is
// down, the request continues and the layer is reported as "skip". That is
// a deliberate choice: the hard security boundary is Postgres RLS, which
// never fails open. Guards reduce noise and abuse; RLS prevents leaks.

export type LayerOutcome = "pass" | "block" | "flag" | "skip";
export type Layer = { name: string; outcome: LayerOutcome; detail?: string };

/** Llama Prompt Guard 2: jailbreak / prompt-injection probability, 0..1. */
export async function promptGuard(text: string): Promise<number | null> {
  try {
    const res = await groqChat({
      model: PROMPT_GUARD_MODEL,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
      temperature: 0,
      max_tokens: 8,
    });
    const score = Number.parseFloat((res.message.content ?? "").trim());
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}

/** Llama Guard 4: content safety (violence, self-harm, crime, ...). */
export async function llamaGuard(text: string): Promise<{ safe: boolean; categories: string[] } | null> {
  try {
    const res = await groqChat({
      model: LLAMA_GUARD_MODEL,
      messages: [{ role: "user", content: text.slice(0, 4000) }],
      temperature: 0,
      max_tokens: 20,
    });
    const out = (res.message.content ?? "").trim().toLowerCase();
    if (out.startsWith("safe")) return { safe: true, categories: [] };
    if (out.startsWith("unsafe")) {
      const categories = out.split(/\s+/).slice(1).join(",").toUpperCase().split(",").filter(Boolean);
      return { safe: false, categories };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Out-of-scope detector. Only called when retrieval found nothing similar,
 * so most in-scope questions never pay for this extra LLM call.
 */
export async function isInScope(question: string): Promise<{ inScope: boolean; tokens: { input: number; output: number } }> {
  try {
    const res = await groqChat({
      model: fastModel(),
      json: true,
      temperature: 0,
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            'You classify questions sent to an internal company assistant for "Kestrel Dynamics", a US office-supplies, furniture and technology retailer. ' +
            "In scope: company policies, benefits, HR and people data, finance and sales performance, marketing campaigns, internal processes, the company itself. " +
            "Out of scope: general knowledge, coding help, creative writing, personal advice, news, anything unrelated to working at Kestrel. " +
            'Reply with JSON only: {"in_scope": true|false}',
        },
        { role: "user", content: question.slice(0, 1000) },
      ],
    });
    const parsed = JSON.parse(res.message.content ?? "{}") as { in_scope?: boolean };
    return { inScope: parsed.in_scope !== false, tokens: res.usage };
  } catch {
    return { inScope: true, tokens: { input: 0, output: 0 } };
  }
}

// Canary tokens: unique strings planted in each department's documents.
// Cached per server instance for 10 minutes.
let canaryCache: { at: number; rows: { token: string; department: string }[] } | null = null;

export async function loadCanaries(): Promise<{ token: string; department: string }[]> {
  if (canaryCache && Date.now() - canaryCache.at < 10 * 60_000) return canaryCache.rows;
  const rows: { token: string; department: string }[] = [];
  const db = adminClient();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("canaries").select("token, department").range(from, from + 999);
    if (error) throw new Error(`load canaries: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  canaryCache = { at: Date.now(), rows };
  return rows;
}

/** Tokens from departments the caller may NOT read that appear in the text. */
export function findLeaks(text: string, canaries: { token: string; department: string }[], allowed: string[]): string[] {
  return canaries.filter((c) => !allowed.includes(c.department) && containsWhole(text, c.token)).map((c) => c.token);
}
