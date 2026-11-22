import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/roles";

export function TopBar({ current, name, email, role }: { current: "chat" | "arena" | "admin"; name: string; email: string; role: Role }) {
  const links: { key: typeof current; href: string; label: string }[] = [
    { key: "chat", href: "/chat", label: "Assistant" },
    { key: "arena", href: "/arena", label: "Red team" },
  ];
  if (role === "executive") links.push({ key: "admin", href: "/admin", label: "Admin" });

  return (
    <header className="topbar">
      <Link href="/chat" className="wordmark">
        Kestrel <small>Assist</small>
      </Link>
      <nav className="nav" aria-label="Main">
        {links.map((l) => (
          <Link key={l.key} href={l.href} aria-current={current === l.key ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="who">
        <span>
          {name} <span className="faint">·</span> {ROLE_LABEL[role]}
        </span>
        <span className="email faint">{email}</span>
        <form action={signOut}>
          <button className="btn ghost small" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
