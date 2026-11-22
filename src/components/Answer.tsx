"use client";

import type { ReactNode } from "react";

// Small, safe renderer for the subset of markdown the model produces:
// paragraphs, bullet and numbered lists, pipe tables, **bold**, `code`
// and [n] citations. No HTML injection: everything becomes React text.

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; rows: string[][] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }

    if (trimmed.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim();
        // skip the |---|:---:| separator row
        if (!/^[\s|:-]+$/.test(row)) rows.push(row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      blocks.push({ kind: "table", rows });
      continue;
    }

    const ul = trimmed.match(/^[-*•]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = (ul ?? ol)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }

    if (trimmed.startsWith("#")) {
      // headings are asked against in the prompt; render any that slip through as a bold line
      flush();
      blocks.push({ kind: "p", text: `**${trimmed.replace(/^#+\s*/, "")}**` });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

function inline(text: string, onCite?: (n: number) => void): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\](?:\[\d+\])*|【\d+[^】]*】)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const cites = [...part.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    if (cites.length && /^(\[\d+\])+$/.test(part)) {
      return cites.map((n) => (
        <button key={`${i}-${n}`} type="button" className="cite" onClick={() => onCite?.(n)} aria-label={`Source ${n}`}>
          {n}
        </button>
      ));
    }
    if (part.startsWith("【")) return null; // stray model citation markup
    return <span key={i}>{part}</span>;
  });
}

export function Answer({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const blocks = parseBlocks(text);
  return (
    <div className="answer">
      {blocks.map((b, i) => {
        if (b.kind === "p") return <p key={i}>{inline(b.text, onCite)}</p>;
        if (b.kind === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, onCite)}</li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, onCite)}</li>
              ))}
            </ol>
          );
        const [head, ...body] = b.rows;
        return (
          <div className="table-wrap" key={i}>
            <table className="data">
              {head && (
                <thead>
                  <tr>
                    {head.map((c, j) => (
                      <th key={j}>{inline(c, onCite)}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{inline(c, onCite)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Reads an NDJSON response and calls onEvent for each line. */
export async function readEvents(res: Response, onEvent: (e: Record<string, unknown>) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
