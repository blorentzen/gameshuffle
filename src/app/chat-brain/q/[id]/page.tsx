import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicPrompt } from "@/lib/chatbrain/store";
import { ChatBrainHome } from "@/components/chatbrain/ChatBrainHome";

/**
 * A shareable page for one Chat Brain question (/chat-brain/q/<id>?src=<platform>).
 * Its link preview is the question on the share image; the page puts that
 * question first with its answer box, followed by the rest of the open ones.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPublicPrompt(id);
  if (!p) return { title: "Chat Brain", robots: { index: false } };
  const image = `/api/chat-brain/share/${p.id}`;
  return {
    title: `${p.text} · Chat Brain`,
    description: "Answer in 5 seconds. The most popular answers become the board in Chat Brain, a GameShuffle Original.",
    robots: { index: false, follow: true },
    openGraph: { title: p.text, description: "Answer in 5 seconds on GameShuffle.", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: p.text, images: [image] },
  };
}

export default async function ChatBrainQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPublicPrompt(id);
  if (!p) notFound();
  return (
    <Suspense>
      <ChatBrainHome focus={p.id} />
    </Suspense>
  );
}
