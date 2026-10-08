import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { createServiceClient } from "@/lib/supabase/admin";
import { shareMeta } from "@/lib/og/meta";
import { JoinClient } from "./JoinClient";

/** An invite link is personal: it previews as the invite (with the season's
 *  card from opengraph-image) but never goes in search. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { data: inv } = await createServiceClient()
    .from("championship_invitations")
    .select("status, championships(name)")
    .eq("token", token)
    .maybeSingle();
  const name = (inv as { championships?: { name?: string } } | null)?.championships?.name;
  const robots = { index: false, follow: false };
  if (!inv || inv.status === "revoked" || !name) return { title: "Championship invite", robots };
  const title = `You're invited to ${name}`;
  const description = `Join the ${name} championship series on GameShuffle: race every event and climb the season standings.`;
  return { title, description, robots, ...shareMeta({ title, description, path: `/championship/join/${token}`, canonical: false }) };
}

/** Landing for a championship email invite. Resolves the token (service role,
 *  since the invitee isn't the owner) and hands off to the client join action. */
export default async function ChampionshipJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createServiceClient();
  const { data: inv } = await admin
    .from("championship_invitations")
    .select("championship_id, status, championships(name)")
    .eq("token", token)
    .maybeSingle();

  if (!inv) {
    return (
      <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
        <Container>
          <div className="comp-card" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", padding: "2.5rem 1.5rem" }}>
            <h1 style={{ fontSize: "var(--font-size-16)", marginBottom: "0.5rem" }}>Invite not found</h1>
            <p style={{ color: "var(--text-secondary)" }}>This invite link is invalid or has been revoked.</p>
          </div>
        </Container>
      </main>
    );
  }

  const name = (inv as { championships?: { name?: string } }).championships?.name ?? "a championship";
  return <JoinClient token={token} championshipId={inv.championship_id as string} name={name} />;
}
