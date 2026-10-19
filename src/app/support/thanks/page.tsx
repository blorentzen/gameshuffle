import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { SupportThanksTracker } from "@/components/support/SupportThanksTracker";
import { SupporterShare } from "@/components/support/SupporterShare";
import { createClient } from "@/lib/supabase/server";
import { fulfilSupportSession } from "@/lib/support/store";
import { dollars } from "@/lib/support/rules";
import "../../../styles/support.css";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /support/thanks?session_id= — after Stripe Checkout. Records the support if
 * the webhook hasn't yet (fulfilSupportSession is idempotent) and says thanks, with the
 * supporter card to share (picks 2026-10-19). Signed out, it says an account with the same email
 * brings the badge (the gift is claimed by that email at sign-in).
 */
export default async function SupportThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const result = session_id && /^cs_[A-Za-z0-9_]+$/.test(session_id) ? await fulfilSupportSession(session_id).catch((e) => { console.error("[support] thanks fulfil failed:", e); return null; }) : null;
  const paid = !!result?.ok && !result.refunded;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main>
      <BrowseHero eyebrow="Support GameShuffle" title={paid ? "Thank you" : "Thanks for stopping by"} sub={paid ? "You're helping keep game night free for everyone." : "We couldn't find a finished payment for this page."} accent="violet" field="support" />
      <Container className="support-page support-thanks">
        {result?.refunded ? (
          <Alert variant="info" title="Support is open in the US for now">Your billing address is outside the US, so we refunded it in full. Thank you for wanting to help: we&apos;ll open support in more countries soon.</Alert>
        ) : paid ? (
          <>
            <SupportThanksTracker kind={result!.kind ?? "once"} amount={Math.round((result!.cents ?? 0) / 100)} />
            <p className="support-thanks__lead">
              {result!.kind === "monthly" ? `You're supporting GameShuffle with ${dollars(result!.cents ?? 0)} a month.` : `You supported GameShuffle with ${dollars(result!.cents ?? 0)}.`}
              {" "}A thank-you email is on its way, and Stripe sends your receipt.
            </p>
            <div className="support-thanks__share">
              <p>Tell your friends: a card that says you back GameShuffle brings them here to play.</p>
              <SupporterShare session={session_id} />
            </div>
            <ul className="support-thanks__list">
              {result!.onWall && <li>Your name is on the <Link href="/support">supporters wall</Link>.</li>}
              {user
                ? <li>A Supporter badge now shows on your profile. See it all in <Link href="/account?tab=support">Account ▸ Support</Link>.</li>
                : <li><Link href="/signup?redirect=/account?tab=support">Make a free account</Link> with the email you just used, and your Supporter badge shows on your profile.</li>}
              {result!.kind === "monthly" && <li>Change or stop monthly support any time from <Link href="/account?tab=support">Account ▸ Support</Link>.</li>}
            </ul>
            <p><Link href="/daily">Play today&apos;s Daily</Link> · <Link href="/apps">See every app</Link></p>
          </>
        ) : (
          <p><Link href="/support">Back to Support GameShuffle</Link></p>
        )}
      </Container>
    </main>
  );
}
