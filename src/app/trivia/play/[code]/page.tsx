import type { Metadata } from "next";
import { TriviaPhone } from "@/components/trivia/TriviaPhone";

export const metadata: Metadata = { title: "Play trivia", robots: { index: false, follow: false } };

export default async function TriviaPlay({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TriviaPhone code={code.toUpperCase()} />;
}
