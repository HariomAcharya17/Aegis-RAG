/**
 * Reads a JWT's claims WITHOUT verifying the signature. Only use the result
 * to choose what to ask the database for: the database (PostgREST) verifies
 * the same token on that request and rejects it if forged or expired.
 */
export function unverifiedClaims(token: string): { sub?: string; email?: string; exp?: number } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
