import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { RankedStaffHub } from "@/components/ladders/staff/RankedStaffHub";
import { STAFF_TABS, type StaffTab } from "@/components/ladders/staff/types";
import { rankedAccess } from "@/lib/ladders/access";
import { getLadder, laddersReady } from "@/lib/ladders/store";
import { ladderPath, ladderStaffPath, RANKED } from "@/lib/ladders/types";
import "@/styles/lounge.css";
import "@/styles/ladders.css";

/**
 * A lounge's staff page (name, web and docs picks 2026-11-01, picks 3A to 6A): the lounge's admins and updaters, as
 * the bot reads their roles in the lounge's Discord server, plus GameShuffle staff. Never indexed.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ladder = (await laddersReady()) ? await getLadder({ slug: (await params).slug }) : null;
  return { title: ladder ? `${ladder.name} staff` : "Lounge staff", robots: { index: false, follow: false } };
}

export default async function RankedStaffPage({ params, searchParams }: Props) {
  if (!(await laddersReady())) notFound();
  const ladder = await getLadder({ slug: (await params).slug });
  if (!ladder) notFound();
  const access = await rankedAccess(ladder);
  const asked = (await searchParams).tab;
  const tab: StaffTab = (STAFF_TABS as readonly string[]).includes(asked ?? "") ? (asked as StaffTab) : "tables";
  const here = ladderStaffPath(ladder.slug);

  return (
    <main className="ladder-page">
      <BrowseHero
        eyebrow="Staff"
        title={ladder.name}
        sub={access.staff ? `Signed in as ${access.name}, ${access.role === "admin" ? "an admin" : "an updater"}. ${RANKED.line}.` : `The lounge's staff page. ${RANKED.line}.`}
        accent="blue"
        field="compete"
        compact
      />
      <Container className="lounge-body">
        {access.staff ? (
          <>
            <RankedStaffHub ladderId={ladder.id} initialTab={tab} />
            <p className="ladder-note ranked-staff__help">Every tool here, step by step: <ArrowLink href="/help/ranked#ranked-staff">help for lounge staff</ArrowLink></p>
          </>
        ) : (
          <section className="lounge-sec lounge-sec--flat ranked-gate" aria-labelledby="staff-gate">
            <h2 id="staff-gate">{access.why === "signed_out" ? "Sign in to continue" : "This page is for the lounge's staff"}</h2>
            <p className="ladder-note">
              {access.why === "signed_out" && "Sign in with Discord and we check your roles in the lounge's server: its admins and updaters get in."}
              {access.why === "no_discord" && "Your account doesn't have Discord connected, so we can't check your roles in the lounge's server. Connect it, then come back."}
              {access.why === "not_member" && "We couldn't find your Discord account in the lounge's server. Staff are the server's admins and its updater roles."}
              {access.why === "no_role" && "You're in the lounge's server without an updater role. Ask the lounge's admins if you should have one; your roles count here as soon as you have them."}
            </p>
            <div className="ranked-gate__links">
              {access.why === "signed_out" && <ArrowLink href={`/login?redirect=${encodeURIComponent(here)}`}>Sign in</ArrowLink>}
              {access.why === "no_discord" && <ArrowLink href="/account?tab=security">Connect Discord</ArrowLink>}
              <ArrowLink href={ladderPath(ladder.slug)}>{ladder.name}&apos;s standings</ArrowLink>
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}
