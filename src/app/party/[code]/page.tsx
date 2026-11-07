import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { LivePartyNight } from "@/components/party/LivePartyNight";
import { CameFrom } from "@/components/social/CameFrom";
import { createServiceClient } from "@/lib/supabase/admin";

/** /party/[code] — a live party night. Private to the people in it, never indexed. */

export const metadata: Metadata = { title: "Party night", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PartyNightPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // A friend who opens the host's night link and then signs up was brought by the host (bring-along picks).
  const { data } = await createServiceClient().from("party_nights").select("host_user_id").eq("join_code", code.toUpperCase()).maybeSingle();
  const host = (data as { host_user_id: string | null } | null)?.host_user_id ?? null;
  return (
    <main>
      {host && <CameFrom userId={host} />}
      <Container className="tool-page">
        <LivePartyNight code={code.toUpperCase()} />
      </Container>
    </main>
  );
}
