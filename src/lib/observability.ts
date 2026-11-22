import { numberEnv, optionalEnv } from "@/lib/env";
import type { Usage } from "@/lib/groq";

// ---------------------------------------------------------------------
// Shadow cost: Groq's free tier costs $0, which makes cost monitoring
// meaningless. So every request is ALSO priced as if it ran on a paid
// frontier model. Budgets and alerts work on that number, which is what
// a real deployment would face.
// ---------------------------------------------------------------------
export function shadowCost(usage: Usage): number {
  const inPerM = numberEnv("SHADOW_PRICE_INPUT_PER_M", 1.25);
  const outPerM = numberEnv("SHADOW_PRICE_OUTPUT_PER_M", 10);
  return (usage.input * inPerM + usage.output * outPerM) / 1_000_000;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, output: a.output + b.output };
}

// ---------------------------------------------------------------------
// Langfuse tracing over the public ingestion API (plain fetch, batched,
// sent once per request). No keys = tracing silently off.
// ---------------------------------------------------------------------
type IngestionEvent = { id: string; timestamp: string; type: string; body: Record<string, unknown> };

export class Trace {
  readonly id = crypto.randomUUID();
  private events: IngestionEvent[] = [];

  constructor(name: string, init: { userId?: string; input?: unknown; tags?: string[]; metadata?: Record<string, unknown> }) {
    this.push("trace-create", { id: this.id, name, timestamp: new Date().toISOString(), ...init });
  }

  span(name: string, start: number, data: { input?: unknown; output?: unknown; metadata?: Record<string, unknown>; level?: string } = {}) {
    this.push("span-create", {
      id: crypto.randomUUID(),
      traceId: this.id,
      name,
      startTime: new Date(start).toISOString(),
      endTime: new Date().toISOString(),
      ...data,
    });
  }

  generation(name: string, start: number, data: { model: string; input: unknown; output: unknown; usage: Usage }) {
    const costIn = (data.usage.input * numberEnv("SHADOW_PRICE_INPUT_PER_M", 1.25)) / 1_000_000;
    const costOut = (data.usage.output * numberEnv("SHADOW_PRICE_OUTPUT_PER_M", 10)) / 1_000_000;
    this.push("generation-create", {
      id: crypto.randomUUID(),
      traceId: this.id,
      name,
      model: data.model,
      startTime: new Date(start).toISOString(),
      endTime: new Date().toISOString(),
      input: data.input,
      output: data.output,
      usageDetails: { input: data.usage.input, output: data.usage.output },
      costDetails: { input: costIn, output: costOut, total: costIn + costOut },
    });
  }

  finish(output: unknown, metadata: Record<string, unknown>) {
    // Same id as trace-create: Langfuse upserts, adding output to the trace.
    this.push("trace-create", { id: this.id, output, metadata });
  }

  private push(type: string, body: Record<string, unknown>) {
    this.events.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type, body });
  }

  async flush(): Promise<void> {
    const pk = optionalEnv("LANGFUSE_PUBLIC_KEY");
    const sk = optionalEnv("LANGFUSE_SECRET_KEY");
    if (!pk || !sk || this.events.length === 0) return;
    const base = optionalEnv("LANGFUSE_BASEURL") ?? "https://cloud.langfuse.com";
    try {
      await fetch(`${base}/api/public/ingestion`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`${pk}:${sk}`).toString("base64")}`,
        },
        body: JSON.stringify({ batch: this.events }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Observability must never break the product.
    }
  }
}

// ---------------------------------------------------------------------
// Alerts: Discord webhook (free). No URL = alerts off.
// ---------------------------------------------------------------------
export async function alert(text: string): Promise<void> {
  const url = optionalEnv("DISCORD_WEBHOOK_URL");
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // ignore
  }
}
