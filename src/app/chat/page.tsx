import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getSessionUser } from "@/lib/auth";
import { OFF_LIMITS, SUGGESTIONS } from "@/lib/roles";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopBar current="chat" name={user.fullName} email={user.email} role={user.role} />
      <ChatClient
        firstName={user.fullName.split(" ")[0]}
        role={user.role}
        suggestions={SUGGESTIONS[user.role]}
        offLimits={OFF_LIMITS[user.role]}
        showDiagnostics={user.role === "executive"}
      />
    </>
  );
}
