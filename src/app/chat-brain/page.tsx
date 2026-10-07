import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatBrainHome } from "@/components/chatbrain/ChatBrainHome";

export const metadata: Metadata = {
  title: "Chat Brain: answer the survey",
  description: "Answer quick survey prompts in a few seconds. The most popular answers become the boards in Chat Brain, a GameShuffle Original.",
  // Not indexed until boards and the game are live.
  robots: { index: false, follow: true },
};

export default function ChatBrainPage() {
  return (
    <Suspense>
      <ChatBrainHome />
    </Suspense>
  );
}
