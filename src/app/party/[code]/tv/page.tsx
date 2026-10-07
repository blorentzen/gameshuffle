import type { Metadata } from "next";
import { PartyTvView } from "@/components/party/PartyTvView";

/** /party/[code]/tv — a live night on the big screen. Chrome-free, public view only, never indexed. */

export const metadata: Metadata = { title: "Live night on the TV", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PartyTvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PartyTvView code={code.toUpperCase()} />;
}
