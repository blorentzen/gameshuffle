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

const BEATS: { icon: string; heading: string; body: string }[] = [
  {
    icon: "📡",
    heading: "One session, every platform",
    body: "Run one game night across Twitch and Discord: OBS overlay, chat commands, and channel-point rewards, all driven from the Hub.",
  },
  {
    icon: "🪙",
    heading: "A token economy your chat plays in",
    body: "Arcade Tokens, prediction markets, awards, and bounties turn watchers into players, with leaderboards that keep regulars coming back.",
  },
  {
    icon: "🎬",
    heading: "Every tool, live on your stream",
    body: "Overlay wheels, on-screen 8-ball, bingo, and tier lists, plus live tournament race control that pushes the current race to your overlay and chat.",
  },
];

export function ProPitchBand() {
  return (
    <DarkBand premium>
      <div style={{ textAlign: "center", marginBottom: "var(--spacing-32)" }}>
        <p className="marketing-eyebrow">GameShuffle Pro</p>
        <h2
          className="pro-band__title"
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

      <div className="pro-pitch-beats">
        {BEATS.map((beat) => (
          <div key={beat.heading} className="marketing-beat">
            <span className="marketing-beat__icon" aria-hidden="true">{beat.icon}</span>
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
