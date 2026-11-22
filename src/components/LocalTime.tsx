"use client";

import { useEffect, useState } from "react";

/**
 * Shows a timestamp in the viewer's own timezone. The server renders a
 * neutral UTC value first, so server and browser HTML match (no hydration
 * error), then the browser swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
