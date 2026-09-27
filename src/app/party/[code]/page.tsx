import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { LivePartyNight } from "@/components/party/LivePartyNight";

/** /party/[code] — a live party night. Private to the people in it, never indexed. */

export const metadata: Metadata = { title: "Party night", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PartyNightPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main>
      <Container className="tool-page">
        <LivePartyNight code={code.toUpperCase()} />
      </Container>
    </main>
  );
}
