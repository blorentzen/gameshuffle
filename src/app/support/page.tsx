import type { Metadata } from "next";
import { Card, Container, Progress } from "@empac/cascadeds";
import { IconHeart } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { SupportForm } from "@/components/support/SupportForm";
import { BackingPair } from "@/components/support/BackingPair";
import { monthProgress, supportSettings, supportersWall } from "@/lib/support/store";
import { dollars, goalPercent } from "@/lib/support/rules";
import "../../styles/support.css";

export const metadata: Metadata = {
  title: "Support GameShuffle",
  description: "GameShuffle is independent, with no ads and the core tools free for everyone. Chip in once or monthly to keep the servers on and new games coming.",
  alternates: { canonical: "https://www.gameshuffle.co/support" },
};
export const dynamic = "force-dynamic";

/** What support pays for, when staff haven't set the month's cost lines yet. */
const GENERIC_COSTS = ["Servers and the database", "Game and card data", "Email and texts", "The AI features"];

/**
 * /support — Support GameShuffle (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/Aq45TevdtaE5nqiUhFJNSz): why it matters, the give
 * form, this month's goal and what it covers (staff set both on Platform ▸
 * Support; a goal of 0 hides the bar), the supporters wall, and GS Pro beside Support as the two
 * ways to back GameShuffle (picks 2026-10-19). Works before support-m1 runs: no goal, no wall.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const sp = await searchParams;
  const [settings, month, wall] = await Promise.all([
    supportSettings().catch(() => null),
    monthProgress().catch(() => null),
    supportersWall().catch(() => []),
  ]);
  const goal = settings?.goalCents ?? 0;
  const raised = month?.raisedCents ?? 0;
  const pct = goalPercent(raised, goal);
  const costs = settings?.costs ?? [];

  return (
    <main>
      <BrowseHero
        eyebrow="Keep game night free"
        title="Support GameShuffle"
        sub="GameShuffle is independent, with no ads and the core tools free for everyone. If it's made your game nights better, chipping in keeps the servers on and new games coming."
        accent="violet"
        field="support"
      />
      <Container className="support-page">
        <div className="support-page__cols">
          <section className="support-page__why" aria-labelledby="support-why">
            <h2 id="support-why">Where it goes</h2>
            <p>Every randomizer, the Daily, trivia nights, tournaments and the stream tools run on servers and data that cost money every month. GS Pro covers some of it; support from players covers the rest, so the free tools stay free.</p>
            {goal > 0 && (
              <div className="support-goal">
                <h3>This month: {pct}% covered</h3>
                <Progress value={pct} variant="success" label={`${pct} percent of this month's costs covered`} className="admin-progress-quiet" />
                <p className="support-goal__line">{dollars(raised)} of {dollars(goal)}{month?.supporters ? ` from ${month.supporters} ${month.supporters === 1 ? "supporter" : "supporters"}` : ""}</p>
              </div>
            )}
            <ul className="support-costs">
              {costs.length
                ? costs.map((c) => <li key={c.label}><span>{c.label}</span><span>{dollars(c.cents)}</span></li>)
                : GENERIC_COSTS.map((c) => <li key={c}><span>{c}</span></li>)}
            </ul>
          </section>
          <Card variant="outlined" padding="medium" className="support-page__give">
            <h2 className="support-page__give-title" id="give">Chip in</h2>
            <SupportForm canceled={sp.canceled === "1"} />
          </Card>
        </div>

        {wall.length > 0 && (
          <section className="support-wall" aria-labelledby="support-wall">
            <h2 id="support-wall">Supporters</h2>
            <ul className="support-wall__list">
              {wall.map((w, i) => (
                <li key={`${w.name}-${i}`} className="support-wall__item">
                  <IconHeart size={14} stroke={2.25} aria-hidden="true" className="support-wall__heart" />
                  <span className="support-wall__name">{w.name}</span>
                  {w.monthly && <span className="support-wall__monthly">Monthly</span>}
                  {w.note && <span className="support-wall__note">{w.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="support-pro" aria-labelledby="support-two">
          <h2 id="support-two">Two ways to back GameShuffle</h2>
          <p>GS Pro gets you tools. Support is for anyone who enjoys GameShuffle and wants to keep it going.</p>
          <BackingPair from="support-page" supportHref="#give" />
        </section>

        <p className="support-page__fine">Gave the wrong amount? Email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a> within 30 days and we&apos;ll refund it. See <a href="/terms#use-of-service">section 3.6 of our Terms</a>.</p>
      </Container>
    </main>
  );
}
