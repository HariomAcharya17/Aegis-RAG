import type { PipelineResult } from "@/lib/pipeline";

/**
 * NDJSON response: progress events while the pipeline runs, then one
 * "result" event. The answer is NOT streamed token by token on purpose:
 * output guards (canary scan, PII redaction) must see the whole answer
 * before any of it reaches the browser.
 */
export function ndjsonResponse(
  work: (send: (event: Record<string, unknown>) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await work(send);
      } catch (err) {
        console.error(err);
        send({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The fields the browser gets. Usage and trace ids stay server-side for non-executives. */
export function publicResult(r: PipelineResult, includeDiagnostics: boolean) {
  return {
    status: r.status,
    answer: r.answer,
    citations: r.citations,
    restricted: r.restricted,
    blockedBy: r.blockedBy,
    layers: r.layers,
    tools: r.tools,
    latencyMs: r.latencyMs,
    ...(includeDiagnostics ? { usage: r.usage, costUsd: r.costUsd, traceId: r.traceId } : {}),
  };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
