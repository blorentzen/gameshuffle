import Link from "next/link";
import { Button, Stack } from "@empac/cascadeds";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { DarkBand } from "@/components/marketing/DarkBand";

/**
 * Homepage "what GS Pro unlocks" band — a dark full-bleed section below
 * the app grid. The homepage stays app-forward; this is the single
 * Pro-funnel entry on the page. Three scannable beats + a conversion CTA.
 *
 * Copy condensed from `specs/gs-marketing/gameshuffle-marketing-copy-v1.md`
 * and reconciled to shipped reality. Deep links to /gs-pro and /features.
 * (A background image may replace the flat dark fill later.)
 */

const BEATS: { heading: string; body: string }[] = [
  {
    heading: "Free does the heavy lifting",
    body: "Web randomizers for Mario Kart 8 Deluxe and Mario Kart World, plus a Discord bot for standalone commands. Use it solo or pull it up in voice chat.",
  },
  {
    heading: "Pro runs the whole game night",
    body: "GameShuffle sessions tie Twitch and Discord together — OBS overlay, chat commands, channel-point rewards, and Picks & Bans modules. One session, every platform.",
  },
  {
    heading: "A token economy your chat plays in",
    body: "Arcade Tokens, prediction markets, awards, and bounties turn watchers into players — with leaderboards that give regulars a reason to keep coming back.",
  },
];

export function ProPitchBand() {
  return (
    <DarkBand>
      <div style={{ textAlign: "center", marginBottom: "var(--spacing-32)" }}>
        <p className="marketing-eyebrow">GameShuffle Pro</p>
        <h2
          style={{
            fontSize: "var(--font-size-fluid-h3)",
            fontWeight: "var(--font-weight-bold)",
            margin: "var(--spacing-12) 0",
            lineHeight: "var(--line-height-tight)",
          }}
        >
          Turn your game night into a multiplayer experience.
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-18)",
            margin: "0 auto",
            maxWidth: "60rem",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          The free tools run great on their own. Pro adds the platform layer that turns a
          stream into a game your chat plays alongside you.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "var(--spacing-24)",
          maxWidth: "52rem",
          marginInline: "auto",
        }}
      >
        {BEATS.map((beat) => (
          <div key={beat.heading} className="marketing-beat">
            <h3>{beat.heading}</h3>
            <p>{beat.body}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "var(--spacing-32, 2rem)" }}>
        <Stack direction="horizontal" gap={12} justify="center" wrap>
          <AuthAwareCTA
            variant="primary"
            size="large"
            overrides={{
              anon: { label: "Start with free", href: "/signup" },
              free: { label: "See what Pro adds", href: "/features" },
              pro: { label: "Open your hub", href: "/hub" },
            }}
          />
          <Link href="/gs-pro" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="large">
              Explore GameShuffle Pro
            </Button>
          </Link>
        </Stack>
      </div>
    </DarkBand>
  );
}
