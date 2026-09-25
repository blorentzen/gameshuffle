import Link from "next/link";
import { IconBroadcast, IconDice5, IconTrophy, IconUsers } from "@tabler/icons-react";
import { PILLARS, type PillarId } from "@/lib/nav/pillars";

/**
 * The homepage's four doors — Play, Compete, Community, Stream.
 *
 * The homepage used to open on a grid of apps, which answers "what have you
 * built" rather than "what do I want to do today". Those are close enough to
 * feel similar and far enough apart to send people to the wrong place: someone
 * who came to find a game night had to recognise which product that was.
 *
 * Each door leads with the intent, then names two or three destinations so the
 * pillar is concrete rather than an abstract category. Reads from the same
 * pillar map as the nav, footer and sitemap, so a new destination appears in
 * all four by being added once.
 */

/**
 * One Tabler icon per pillar. Decorative — the label right below says the same
 * thing — so each is hidden from assistive tech.
 *
 * Tabler rather than emoji: emoji render as a different typeface on every
 * platform, ignore our colour tokens, and sit off the text baseline. Emoji is
 * still correct where the text IS the content — a Twitch chat reply or a
 * reaction — but not for UI chrome.
 */
const ICON: Record<PillarId, typeof IconDice5> = {
  play: IconDice5,
  compete: IconTrophy,
  community: IconUsers,
  stream: IconBroadcast,
};

export function PillarDoors() {
  return (
    <section className="pillars" aria-labelledby="pillars-heading">
      <h2 id="pillars-heading" className="pillars__heading">
        What do you want to do today?
      </h2>
      <div className="pillars__grid">
        {PILLARS.map((p) => {
          // Two or three named destinations per door. Everyone-audience only:
          // the homepage is mostly met while logged out, and a door that lists
          // something you cannot reach is worse than one that lists less.
          const links = p.groups
            .flatMap((g) => g.items)
            .filter((i) => !i.secondary && (!i.audience || i.audience === "everyone"))
            .slice(0, 3);
          return (
            <Link key={p.id} href={p.href} className="pillars__door">
              <span className="pillars__glyph" aria-hidden>
                {(() => { const I = ICON[p.id]; return <I size={28} stroke={1.75} />; })()}
              </span>
              <span className="pillars__label">{p.label}</span>
              <span className="pillars__intent">{p.intent}</span>
              <span className="pillars__links">
                {links.map((l) => (
                  <span key={l.href} className="pillars__link">{l.label}</span>
                ))}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
