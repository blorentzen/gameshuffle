import type { Metadata } from "next";
import { PlansCompare } from "@/components/billing/PlansCompare";
import Link from "next/link";
import { Card, Container, Progress } from "@empac/cascadeds";
import { IconAward, IconCheck, IconCrown, IconHeart, IconStar } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { SupportForm } from "@/components/support/SupportForm";
import { BackingPair } from "@/components/support/BackingPair";
import { foundingTaken, monthProgress, supportSettings, supportUpdates, supportersWall } from "@/lib/support/store";
import { FOUNDING_SUPPORTERS, dollars, goalPercent, supportLevel } from "@/lib/support/rules";
import "../../styles/support.css";

export const metadata: Metadata = {
  title: "Support GameShuffle",
  description: "GameShuffle is independent and has no ads. Support it once, or monthly as a Supporter, a Backer (GS Pro included) or a Champion, to keep the servers on and new games coming.",
  alternates: { canonical: "https://www.gameshuffle.co/support" },
};
export const dynamic = "force-dynamic";

/** What support pays for, when staff haven't set the month's cost lines yet. */
const GENERIC_COSTS = ["Servers and the daily puzzles", "New randomizers and Originals", "Art for the new games"];

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/**
 * /support as a campaign page (Britton's picks, 2026-10-19, support first
 * plan): the story, this month's goal moving and what it pays for (staff set
 * both on Platform ▸ Support; a goal of 0 hides the bar), the Founding places,
 * updates from staff, the give card (monthly levels or once), the supporters
 * wall (Champions first) and GS Pro beside it. `?level=backer` starts the form
 * on a level. Works before the support migrations run: no goal, wall or updates.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ canceled?: string; level?: string }> }) {
  const sp = await searchParams;
  const [settings, month, wall, updates, founding] = await Promise.all([
    supportSettings().catch(() => null),
    monthProgress().catch(() => null),
    supportersWall().catch(() => []),
    supportUpdates(5).catch(() => []),
    foundingTaken().catch(() => 0),
  ]);
  const goal = settings?.goalCents ?? 0;
  const raised = month?.raisedCents ?? 0;
  const pct = goalPercent(raised, goal);
  const costs = settings?.costs ?? [];
  const foundingLeft = Math.max(0, FOUNDING_SUPPORTERS - founding);

  return (
    <main>
      <BrowseHero
        eyebrow="Support GameShuffle"
        title="Keep game night free"
        sub="GameShuffle is independent and has no ads. Support from players keeps it running."
        subShort="Independent, no ads. Supporters keep it going."
        accent="violet"
        field="support"
      />
      <Container className="support-page">
        <div className="support-page__cols">
          <section className="support-page__why" aria-labelledby="support-why">
            <h2 id="support-why" className="sr-only">Where support goes</h2>
            {goal > 0 && (
              <div className="support-goal">
                <p className="support-goal__big">
                  <span className="support-goal__raised">{dollars(raised)}</span>
                  <span className="support-goal__line">of {dollars(goal)} this month{month?.supporters ? ` · ${month.supporters} ${month.supporters === 1 ? "supporter" : "supporters"}` : ""}</span>
                </p>
                <Progress value={pct} variant="success" label={`${pct} percent of this month's goal`} className="admin-progress-quiet" />
              </div>
            )}
            <ul className="support-checks" aria-label="What support pays for">
              {costs.length
                ? costs.map((c) => (
                  <li key={c.label}><IconCheck size={18} stroke={2.25} aria-hidden="true" /><span>{c.label}</span>{c.cents > 0 && <span className="support-checks__cents">{dollars(c.cents)}</span>}</li>
                ))
                : GENERIC_COSTS.map((c) => <li key={c}><IconCheck size={18} stroke={2.25} aria-hidden="true" /><span>{c}</span></li>)}
            </ul>
            {foundingLeft > 0 && (
              <p className="support-founding">
                <IconAward size={18} stroke={2} aria-hidden="true" />
                <span>The first {FOUNDING_SUPPORTERS} supporters keep a Founding badge for good, at any level or amount. {foundingLeft === FOUNDING_SUPPORTERS ? "Every place is open." : `${foundingLeft} ${foundingLeft === 1 ? "place is" : "places are"} left.`}</span>
              </p>
            )}
            {updates.length > 0 && (
              <section className="support-updates" aria-labelledby="support-updates">
                <h3 id="support-updates">Updates</h3>
                <ol>
                  {updates.map((u) => (
                    <li key={u.id}><time dateTime={u.postedAt}>{shortDay(u.postedAt)}</time><p>{u.body}</p></li>
                  ))}
                </ol>
              </section>
            )}
          </section>
          <Card variant="outlined" padding="medium" className="support-page__give">
            <h2 className="support-page__give-title" id="give">Support GameShuffle</h2>
            <SupportForm canceled={sp.canceled === "1"} startLevel={supportLevel(sp.level)?.id ?? null} />
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
                  {w.level === "champion" && <span className="support-wall__level support-wall__level--champion"><IconCrown size={11} stroke={2.25} aria-hidden="true" />Champion</span>}
                  {w.level === "backer" && <span className="support-wall__level support-wall__level--backer"><IconStar size={11} stroke={2.25} aria-hidden="true" />Backer</span>}
                  {w.level === "supporter" && <span className="support-wall__monthly">Monthly</span>}
                  {w.note && <span className="support-wall__note">{w.note}</span>}
                </li>
              ))}
            </ul>
            <p className="support-wall__more"><Link href="/credits">See everyone in the credits</Link></p>
          </section>
        )}

        <PlansCompare from="support-page" />

        <section className="support-pro" aria-labelledby="support-two">
          <h2 id="support-two">Two ways to back GameShuffle</h2>
          <BackingPair from="support-page" supportHref="#give" />
        </section>

        <p className="support-page__fine">Gave the wrong amount? Email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a> within 30 days and we&apos;ll refund it. See <a href="/terms#use-of-service">section 3.6 of our Terms</a>.</p>
      </Container>
    </main>
  );
}
