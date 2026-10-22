import type { Metadata } from "next";
import Link from "next/link";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { MmrShowcase } from "@/components/mmr/MmrShowcase";
import { MmrStudio } from "@/components/mmr/MmrStudio";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { cardFor, cardView } from "@/lib/mmr/store";
import { linksFor } from "@/lib/lounge/store";
import "@/styles/mmr-card.css";
import "@/styles/mmr-studio.css";

/**
 * /mmr-card: the MMR card for Mario Kart lounge players (picks 2026-10-20, three rounds, all as
 * recommended). Signed out: what it is, the five layouts playing a made-up night, and the way in.
 * Signed in: the studio.
 */

export const dynamic = "force-dynamic";

const DESCRIPTION = "Your Mario Kart lounge MMR on stream, live: the number, your division, how far to the next one and tonight's run, with a moment each time an event is verified. Free with a GameShuffle account.";

export const metadata: Metadata = {
  title: "MMR card for Mario Kart lounge",
  description: DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/mmr-card" },
  openGraph: { title: "MMR card for Mario Kart lounge", description: DESCRIPTION, url: "https://www.gameshuffle.co/mmr-card", siteName: "GameShuffle", type: "website" },
};

const FAQ = [
  { q: "Where do the numbers come from?", a: "MKCentral's lounge, the same ratings the lounge's own site shows. The card reads your season by your lounge name and keeps following you if you change it." },
  { q: "How quickly does it update?", a: "It checks every 30 seconds. MMR only moves when an event's table is verified, usually a minute or two after the last race, and that's when the moment plays." },
  { q: "Which games does it cover?", a: "Mario Kart World (12 and 24 players) and Mario Kart 8 Deluxe. Pick the game per look; MK8DX's numbered divisions show as Platinum 1, Platinum 2 and so on." },
  { q: "Do I need Twitch or GS Pro?", a: "No. The card is a browser source, so it works in OBS, Streamlabs or anything that takes a web page, and it's free with an account. GS Pro adds looks: brand themes, your own colors and picture, fonts, foil and more saved looks." },
  { q: "What counts as tonight's run?", a: "Everything since you went live on Twitch when it's connected, or since midnight Pacific when it isn't." },
];

export default async function MmrCardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const admin = createServiceClient();
    const [card, pro, profile, links] = await Promise.all([
      cardFor(user.id),
      isProUser(user.id, admin),
      admin.from("users").select("avatar_url").eq("id", user.id).maybeSingle(),
      linksFor(user.id),
    ]);
    const avatar = (profile.data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
    return (
      <main className="mmr-page">
        <BrowseHero
          eyebrow="Mario Kart lounge"
          title="Your MMR card"
          sub="Set it up once, add the link to OBS, and it follows your lounge rating live."
          accent="blue"
          field="compete"
          compact
        />
        <div className="mmr-page__body">
          <MmrStudio initial={card ? cardView(card) : null} pro={pro} avatar={avatar && /^https:\/\//.test(avatar) ? avatar : null} links={links.map((l) => ({ game: l.game, playerId: l.playerId, name: l.name }))} />
          <p className="mmr-page__also">Your card also answers <b>!mmr</b> in your Twitch chat (with the GameShuffle bot) and <b>/gs-mmr</b> in Discord, and shows as a sticker on your profile.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mmr-page">
      <MarketingJsonLd appName="MMR card" appDescription={DESCRIPTION} appUrl="/mmr-card" appCategory="UtilitiesApplication" breadcrumb={{ label: "MMR card", path: "/mmr-card", parent: { label: "Compete", path: "/competitive-mario-kart" } }} faq={FAQ} />
      <BrowseHero
        eyebrow="Mario Kart lounge"
        title="MMR card"
        sub="Your lounge MMR on stream, live: the number, your division, how far to the next one and tonight's run, with a moment each time an event is verified."
        accent="blue"
        field="compete"
        primary={{ href: "/signup?redirect=/mmr-card", label: "Make yours free" }}
        secondary={{ href: "#how", label: "How it works" }}
      />
      <div className="mmr-page__body">
        <section aria-labelledby="mmr-layouts">
          <h2 id="mmr-layouts">Five layouts</h2>
          <p className="mmr-page__lede">Each plays a made-up night here: a win, a loss, a climb into Platinum, a streak and a new peak.</p>
          <MmrShowcase />
        </section>

        <section aria-labelledby="mmr-shows" className="mmr-page__flat">
          <h2 id="mmr-shows">What it shows</h2>
          <ul className="mmr-page__list">
            <li><b>Your division</b> as an emblem, and how far to the next one: &ldquo;88 to Platinum&rdquo;.</li>
            <li><b>Tonight&rsquo;s run</b>: &ldquo;+158 tonight, 4-1&rdquo;, so a viewer arriving late sees how it&rsquo;s going.</li>
            <li><b>Your last ten events</b> as squares, gold where an event set a new season peak.</li>
            <li><b>Moments</b>: the change pops and the number rolls, a flame after three wins in a row, a gold tag for a new peak, a banner for a new division, and a laurel the first time you reach the world top 1,000, 250, 100 or 10. Each one has its own switch.</li>
            <li><b>Your pick of what&rsquo;s on it</b>: country rank, top %, your win streak, recent events, events and win %, average score and more, each with a switch, or start from a preset like Just the number. When more are on than a layout fits, the extras take turns.</li>
            <li><b>Rolling</b>: one piece at a time as a lower-third bar, a box or a tall card for vertical streams, sliding, flipping, fading, dealt like cards or as a ticker. A change jumps straight to your MMR.</li>
          </ul>
        </section>

        <section id="how" aria-labelledby="mmr-how" className="mmr-page__flat">
          <h2 id="mmr-how">How it works</h2>
          <ol className="mmr-page__steps">
            <li><b>Make a free GameShuffle account.</b> Your card gets a private link that never changes unless you ask.</li>
            <li><b>Type your lounge name</b> and pick a layout and look.</li>
            <li><b>Paste the link into OBS</b> as a browser source. That&rsquo;s it; it updates itself.</li>
          </ol>
          <p><Link className="mmr-page__cta" href="/signup?redirect=/mmr-card">Make yours free</Link> <span className="mmr-page__muted">Already have an account? <Link href="/login?redirect=/mmr-card">Sign in</Link>.</span></p>
        </section>

        <section aria-labelledby="mmr-split" className="mmr-page__flat">
          <h2 id="mmr-split">Free and GS Pro</h2>
          <div className="mmr-page__split">
            <div>
              <h3>Free</h3>
              <p>Every piece and moment with its own switch, four presets, MMR or world rank as the big number, all five layouts (Rolling with every shape and motion), every emblem frame, dark, light or see-through, division colors, GameShuffle blue or your accent, glow and glyph backgrounds, one saved look, <b>!mmr</b> and <b>/gs-mmr</b>, and the sticker on your profile. Free cards carry a small Built by GameShuffle line.</p>
            </div>
            <div>
              <h3>GS Pro</h3>
              <p>Brand themes and your own two colors, stripes and dots, your own picture or GIF behind the card, four more fonts, a two-color border, foil, your picture as the emblem, hiding the GameShuffle line, up to ten saved looks that switch with your Twitch game, your own order of the pieces, a line of your own on the card, like Road to Master, and a time per slide on Rolling. Plus tonight&rsquo;s goal on your card (&ldquo;184 to 15,500&rdquo;) and a report of your lounge week every Monday.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="mmr-faq" className="mmr-page__flat">
          <h2 id="mmr-faq">Questions</h2>
          <FaqList items={FAQ} />
        </section>
      </div>
    </main>
  );
}
