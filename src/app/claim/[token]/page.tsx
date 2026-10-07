import type { Metadata } from "next";
import { Alert, Container } from "@empac/cascadeds";
import { createServiceClient } from "@/lib/supabase/admin";
import { findClaim } from "@/lib/tournaments/claims";
import { formatEventTime } from "@/lib/time/format";
import { ClaimFlow } from "@/components/tournament/ClaimFlow";

/**
 * /claim/[token] — where guest claim links land (spec F, phase 1).
 *
 * Links used to point at the public tournament page with ?claim=<token>,
 * which put a credential in a URL people share. This page is not public in
 * that sense: it is never linked from anywhere, it is not indexed, and the
 * token here only reveals the entry name and a masked address. Claiming
 * still needs a signed-in account that proves control of that address.
 */

export const metadata: Metadata = { title: "Claim your results", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = await findClaim(token).catch(() => null);
  const { data: t } = claim
    ? await createServiceClient().from("tournaments").select("id, title, date_time").eq("id", claim.tournament_id).maybeSingle()
    : { data: null };
  const tournament = t as { id: string; title: string; date_time: string | null } | null;

  return (
    <main className="claim-page">
      <Container>
        <div className="claim-page__card">
          <p className="claim-page__eyebrow">Claim your results</p>
          {tournament ? (
            <>
              <h1 className="claim-page__title">{tournament.title}</h1>
              {tournament.date_time && <p className="claim-page__when">{formatEventTime(tournament.date_time, null)}</p>}
              <ClaimFlow tournamentId={tournament.id} token={token} tournamentHref={`/tournament/${tournament.id}`} />
            </>
          ) : (
            <>
              <h1 className="claim-page__title">This link doesn&apos;t work</h1>
              <Alert variant="error">It may have been mistyped, or it has already been replaced. Ask the organizer for a new one.</Alert>
            </>
          )}
        </div>
      </Container>
    </main>
  );
}
