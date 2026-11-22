/**
 * Case-insensitive match of a whole token: it must not sit inside a longer
 * word or number, so "Ann Lee" doesn't match "Joann Leeds" and "$4,218"
 * doesn't match "$4,218,775". Pure function, shared by the app and evals.
 */
export function containsWhole(text: string, token: string): boolean {
  const haystack = text.toLowerCase();
  const needle = token.toLowerCase();
  const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch);
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const before = haystack[i - 1];
    const after = haystack[i + needle.length];
    const continuesNumber = after === "," && /\d/.test(haystack[i + needle.length + 1] ?? "");
    if (!isWordChar(before) && !isWordChar(after) && !continuesNumber) return true;
  }
  return false;
}
