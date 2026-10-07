import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { ClaimOffers } from "@/components/tournament/ClaimOffers";

/**
 * /claim — guest entries saved under the signed-in account's verified email
 * (spec F). Reached from the "we found your guest entries" notification.
 * The account picks which to link; nothing links without that.
 */

export const metadata: Metadata = { title: "Your guest entries", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClaimOffersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/claim");

  return (
    <main className="claim-page">
      <Container>
        <div className="claim-page__card">
          <p className="claim-page__eyebrow">Claim your results</p>
          <h1 className="claim-page__title">Guest entries saved under your email</h1>
          <ClaimOffers verified={!!user.email_confirmed_at} />
        </div>
      </Container>
    </main>
  );
}
