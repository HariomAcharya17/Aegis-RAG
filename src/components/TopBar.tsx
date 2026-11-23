import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { DemoGuide } from "@/components/DemoGuide";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { SubmitButton } from "@/components/SubmitButton";
import { demoMode } from "@/lib/env";
import { ROLE_LABEL, type Role } from "@/lib/roles";

const PATHS = { chat: "/chat", arena: "/arena", admin: "/admin" } as const;

export function TopBar({ current, name, email, role }: { current: "chat" | "arena" | "admin"; name: string; email: string; role: Role }) {
  const demo = demoMode();
  const links: { key: typeof current; href: string; label: string }[] = [
    { key: "chat", href: "/chat", label: "Assistant" },
    { key: "arena", href: "/arena", label: "Red team" },
  ];
  if (role === "executive") links.push({ key: "admin", href: "/admin", label: "Admin" });

  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark" title="About this project">
          <AegisMark /> Aegis <small>Kestrel demo</small>
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) => (
            <Link key={l.key} href={l.href} aria-current={current === l.key ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/#how">How it works</Link>
        </nav>
        <div className="who">
          {demo ? (
            <RoleSwitcher role={role} next={PATHS[current]} />
          ) : (
            <span>
              {name} <span className="faint">·</span> {ROLE_LABEL[role]}
            </span>
          )}
          <span className="email faint">{email}</span>
          <form action={signOut}>
            <SubmitButton className="btn ghost small">Sign out</SubmitButton>
          </form>
        </div>
      </header>
      {demo && <DemoGuide role={role} />}
    </>
  );
}

export function AegisMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="mark">
      <path d="M12 2.5 4 5.5v6.2c0 4.6 3.3 8.6 8 9.8 4.7-1.2 8-5.2 8-9.8V5.5l-8-3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12.2 11.2 14.4 15.4 9.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
