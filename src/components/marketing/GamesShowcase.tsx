import Link from "next/link";
import { Badge, Button } from "@empac/cascadeds";
import {
  AVAILABLE_GAMES,
  IN_DEVELOPMENT_GAMES,
  type MarketingGame,
} from "@/data/marketing-games";

/**
 * Games showcase — the games/modes GameShuffle supports today plus titles
 * in active development, ending with a "suggest a game" contact CTA.
 * Driven by `src/data/marketing-games.ts`.
 *
 * `showModes` surfaces each game's mode chips (used on the Features page).
 * Titles without art render a gradient placeholder instead of a broken
 * image, so the grid stays clean until real art is added to the data.
 */

function GameCard({
  game,
  status,
  showModes,
}: {
  game: MarketingGame;
  status: "available" | "development";
  showModes?: boolean;
}) {
  return (
    <article className="games-card">
      <div className="games-card__media">
        {game.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.image} alt={game.imageAlt ?? game.name} loading="lazy" />
        ) : (
          <div className="games-card__media-placeholder">{game.name}</div>
        )}
        {/* Only the in-progress marker is a badge; a shipped game carries none
            (per the badge taxonomy — "Live" as a maturity badge was retired). */}
        {status === "development" ? (
          <span className="games-card__badge">
            <Badge variant="warning" size="small">
              In development
            </Badge>
          </span>
        ) : null}
      </div>
      <div className="games-card__body">
        <h3 className="games-card__title">{game.name}</h3>
        <p className="games-card__blurb">{game.blurb}</p>
        {showModes && game.modes?.length ? (
          <ul className="games-card__modes">
            {game.modes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
        {status === "available" && game.href ? (
          <div className="games-card__cta">
            <Link href={game.href} style={{ textDecoration: "none" }}>
              <Button variant="tertiary" size="small" style={{ color: "var(--bg-primary, var(--primary-600))" }}>
                Open it →
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function GamesShowcase({
  heading = "Games we support",
  intro,
  showModes = false,
  showAvailable = true,
  showDevelopment = true,
}: {
  heading?: string;
  intro?: string;
  showModes?: boolean;
  /** Render the "available now" games. Off for the /apps page, which
   *  already lists those as app cards above. */
  showAvailable?: boolean;
  showDevelopment?: boolean;
}) {
  return (
    <section style={{ margin: "var(--spacing-80) 0" }}>
      <h2
        style={{
          fontSize: "var(--font-size-fluid-h3)",
          fontWeight: "var(--font-weight-bold)",
          margin: "0 0 var(--spacing-8)",
          lineHeight: "var(--line-height-tight)",
        }}
      >
        {heading}
      </h2>
      {intro ? (
        <p
          style={{
            fontSize: "var(--font-size-18)",
            color: "var(--text-secondary)",
            margin: "0 0 var(--spacing-24)",
            maxWidth: "52rem",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          {intro}
        </p>
      ) : null}

      {showAvailable ? (
        <div className="games-showcase__grid">
          {AVAILABLE_GAMES.map((g) => (
            <GameCard key={g.name} game={g} status="available" showModes={showModes} />
          ))}
        </div>
      ) : null}

      {showDevelopment ? (
        <>
          {showAvailable ? (
            <h3
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-tertiary)",
                margin: "var(--spacing-40) 0 var(--spacing-16)",
              }}
            >
              In development
            </h3>
          ) : null}
          <div className="games-showcase__grid">
            {IN_DEVELOPMENT_GAMES.map((g) => (
              <GameCard key={g.name} game={g} status="development" showModes={showModes} />
            ))}
          </div>
        </>
      ) : null}

      {/* Suggest-a-game — a simple line of copy + CTA under the cards */}
      <p
        style={{
          marginTop: "var(--spacing-24)",
          color: "var(--text-secondary)",
          fontSize: "var(--font-size-16)",
          lineHeight: "var(--line-height-relaxed)",
        }}
      >
        Want a game or mode we don&apos;t have yet?{" "}
        <Link href="/contact-us" style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 600 }}>
          Suggest a game or mode →
        </Link>
      </p>
    </section>
  );
}
