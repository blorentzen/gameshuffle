import type { Metadata } from "next";
import { TriviaTv } from "@/components/trivia/TriviaTv";

export const metadata: Metadata = { title: "Trivia on the TV", robots: { index: false, follow: false } };

export default async function TriviaTvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TriviaTv code={code.toUpperCase()} />;
}
