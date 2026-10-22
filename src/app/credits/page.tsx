import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { IconCrown, IconHeart, IconStar, type Icon } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { supportCredits } from "@/lib/support/store";
import "../../styles/support.css";

export const metadata: Metadata = {
  title: "Credits",
  description: "GameShuffle is made possible by the people who support it. Every supporter who asked to be named, Champions first.",
  alternates: { canonical: "https://www.gameshuffle.co/credits" },
};
export const revalidate = 600;

/**
 * /credits, "Made possible by" (Britton's picks, 2026-10-19): every supporter
 * who asked to be on the supporters wall, Champions first, then Backers, then
 * everyone else, alphabetical within each. Names come from the wall settings
 * (src/lib/support/store.ts supportCredits); a hidden name stays hidden here.
 * Linked from the footer, /support and the welcome page.
 */
export default async function CreditsPage() {
  const credits = await supportCredits().catch(() => ({ champions: [], backers: [], supporters: [] }));
  const groups: { id: string; title: string; Icon: Icon; names: string[] }[] = [
    { id: "champions", title: "Champions", Icon: IconCrown, names: credits.champions },
    { id: "backers", title: "Backers", Icon: IconStar, names: credits.backers },
    { id: "supporters", title: "Supporters", Icon: IconHeart, names: credits.supporters },
  ];
  const anyone = groups.some((g) => g.names.length);

  return (
    <main>
      <BrowseHero
        eyebrow="Credits"
        title="Made possible by"
        sub="GameShuffle is independent and has no ads. These are the people who keep it running. Thank you."
        subShort="The people who keep GameShuffle running."
        accent="violet"
        field="support"
        compact
      />
      <Container className="credits-page">
        {anyone ? groups.filter((g) => g.names.length).map((g) => (
          <section key={g.id} className={`credits-group credits-group--${g.id}`} aria-labelledby={`credits-${g.id}`}>
            <h2 id={`credits-${g.id}`}><g.Icon size={20} stroke={2} aria-hidden="true" />{g.title}</h2>
            <ul className="credits-names">
              {g.names.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
            </ul>
          </section>
        )) : (
          <p className="credits-empty">The first names go here soon. Support GameShuffle and ask to be named to be one of them.</p>
        )}
        <section className="credits-join" aria-labelledby="credits-join">
          <h2 id="credits-join">Add your name</h2>
          <p>Support once or monthly and choose to show your name. Champions are listed first.</p>
          <Link href="/support#give" className="credits-join__link"><Button variant="primary">Support GameShuffle</Button></Link>
        </section>
      </Container>
    </main>
  );
}
