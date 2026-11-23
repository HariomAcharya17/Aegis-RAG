"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reacts the moment it's clicked: disables itself and
 * shows a spinner while the form's server action (sign-in, redirect) runs,
 * so a slow round trip never looks like a dead click.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn",
}: {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && <span className="spinner" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
