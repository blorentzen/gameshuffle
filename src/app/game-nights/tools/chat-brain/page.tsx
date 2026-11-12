import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { brainTableOpenFor } from "@/lib/chatbrain/tableGate";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { ChatBrainTable } from "@/components/game-nights/companion/ChatBrainTable";

export const metadata: Metadata = {
  title: "Chat Brain on one phone",
  description: "Guess what most people said: the whole table as one team, or two teams taking turns, on one phone.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/chat-brain" },
  robots: { index: false, follow: true },
};

// Staff only until Chat Brain launches (src/lib/chatbrain/tableGate.ts).
export const dynamic = "force-dynamic";

export default async function ChatBrainTablePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await brainTableOpenFor(user?.id ?? null))) notFound();
  return (
    <ToolPageShell toolId="chat-brain">
      <ChatBrainTable />
    </ToolPageShell>
  );
}
