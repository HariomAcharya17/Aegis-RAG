import { requireEnv } from "@/lib/env";

// Must match the Colab notebook exactly: same model, same dimension,
// unit-normalised. Documents were embedded with RETRIEVAL_DOCUMENT,
// queries use RETRIEVAL_QUERY (Gemini's asymmetric retrieval mode).
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

export async function embedQuery(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gemini embedding ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== EMBED_DIM) throw new Error("Gemini embedding: unexpected response shape");
  return normalise(values);
}

function normalise(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
