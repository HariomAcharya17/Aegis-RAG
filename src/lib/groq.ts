import { requireEnv } from "@/lib/env";

// Thin client for Groq's OpenAI-compatible API. Plain fetch, no SDK, so
// there is no framework version churn and every request is visible here.

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
};

export type Usage = { input: number; output: number };

export type ChatResponse = {
  message: { content: string | null; tool_calls?: ToolCall[] };
  usage: Usage;
  model: string;
};

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export async function groqChat(req: ChatRequest): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.2,
    max_tokens: req.max_tokens ?? 1024,
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = "auto";
  }
  if (req.json) body.response_format = { type: "json_object" };
  if (req.model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireEnv("GROQ_API_KEY")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    if (res.status === 429 && attempt < 2) {
      // Free tier rate limit. Respect Retry-After but never stall a request for long.
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await new Promise((r) => setTimeout(r, Math.min(Math.max(retryAfter, 1), 6) * 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq ${res.status} (${req.model}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      model: string;
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      message: json.choices[0]?.message ?? { content: "" },
      usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 },
      model: json.model,
    };
  }
  throw new Error(`Groq rate limited (${req.model}) after retries`);
}
