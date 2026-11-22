// Deterministic PII redaction. Regex, not an LLM: fast, free, predictable,
// and it cannot be talked out of redacting.

const PATTERNS: { type: string; re: RegExp; mask: string }[] = [
  { type: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, mask: "[email redacted]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, mask: "[id redacted]" },
  { type: "card", re: /\b(?:\d{4}[ -]){3}\d{4}\b/g, mask: "[card redacted]" },
  { type: "phone", re: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, mask: "[phone redacted]" },
];

export type Redaction = { text: string; count: number; types: string[] };

export function redactPII(input: string): Redaction {
  let text = input;
  let count = 0;
  const types = new Set<string>();
  for (const { type, re, mask } of PATTERNS) {
    text = text.replace(re, () => {
      count++;
      types.add(type);
      return mask;
    });
  }
  return { text, count, types: [...types] };
}
