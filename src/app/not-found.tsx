import type { Metadata } from "next";
import { Container, Icon, type IconName } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * The site's 404: a wrong or old link lands here (in place of Next's default
 * black page) with the nav, a plain line, and doors to where people usually
 * meant to go. Same hero and tiles as the rest of the marketing site.
 */
const DOORS: { icon: IconName; label: string; desc: string; href: string; family: string }[] = [
  { icon: "sparkles", label: "Randomizers", desc: "Mario Kart, Mario Party, Smash and more", href: "/randomizers", family: "pick" },
  { icon: "rotate", label: "Free tools", desc: "Wheel spinner, dice, tier lists, bingo", href: "/tools", family: "board" },
  { icon: "calendar", label: "The Daily Shuffle", desc: "Guess today's character in six", href: "/daily", family: "party" },
  { icon: "tool", label: "Game night tools", desc: "Score sheets, timers and pickers", href: "/game-nights/tools", family: "kit" },
  { icon: "users", label: "Game nights", desc: "Find or host a night near you", href: "/game-nights", family: "kit" },
  { icon: "award", label: "Tournaments", desc: "Browse events or run your own", href: "/tournament", family: "stream" },
  { icon: "star", label: "GS Pro", desc: "Turn your whole chat into players", href: "/gs-pro", family: "stream" },
  { icon: "help-circle", label: "Help", desc: "Guides for every feature", href: "/help", family: "pick" },
];

export default function NotFound() {
  return (
    <main>
      <BrowseHero
        eyebrow="Page not found"
        title={"That page isn’t here."}
        sub="The link may be old or have a typo. Here are the places people usually look for."
        accent="blue"
        field="mixed"
        primary={{ href: "/", label: "Go to the homepage" }}
        secondary={{ href: "/randomizers", label: "Browse the randomizers" }}
      />
      <Container>
        <section style={{ margin: "var(--spacing-48) 0" }} aria-label="Popular places">
          <div className="home-tiles">
            {DOORS.map((d) => (
              <a key={d.href} href={d.href} className="home-tile gs-hover-gradient">
                <span className={`home-tile__icon home-tile__icon--${d.family}`} aria-hidden="true">
                  <Icon name={d.icon} size="32" />
                </span>
                <span className="home-tile__label">{d.label}</span>
                <span className="home-tile__desc">{d.desc}</span>
              </a>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
}
