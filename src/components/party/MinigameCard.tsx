import { Badge } from "@empac/cascadeds";
import { IconField } from "@/components/events/EventHeaderArt";
import { useRollFrames } from "@/components/randomizer/RollingText";
import type { PartyMinigame } from "@/lib/party/types";

/**
 * A minigame as a card: its category's colour, a glyph pattern unique to the
 * minigame (hashed off its name), the category, the name and what it needs.
 * Real screenshots slot in through `artSrc` once they're pulled. `children`
 * renders in the footer (who won, in a set list). With a `reel` it plays the
 * rolling animation on mount (parents re-key it on each spin).
 */

const CATEGORY_COLORS: Record<string, string> = {
  ffa: "#2f66ec", "1v3": "#e8761e", "2v2": "#2e9e44", duel: "#d32f2f", item: "#6b3fa0", showdown: "#b88a0d",
  boss: "#8b1e3f", kaboom: "#0e8f9b", rhythm: "#d9437f", koopathlon: "#3949ab", survivathon: "#4f8a2a",
  mouse: "#546e7a", bowserlive: "#b71c1c", sports: "#00897b",
};
export const minigameColor = (category: string | null | undefined) => CATEGORY_COLORS[category ?? ""] ?? "#6d4ee6";

export function MinigameCard({
  minigame, categoryLabel, round, feature = false, artSrc, reel, children,
}: {
  minigame: PartyMinigame | null;
  categoryLabel: string;
  round?: number;
  /** The big single-spin card (ambient motion, larger type). */
  feature?: boolean;
  artSrc?: string;
  /** Spin through these when the card mounts (the rolling animation). */
  reel?: PartyMinigame[];
  children?: React.ReactNode;
}) {
  const frame = useRollFrames(reel, !!reel?.length);
  const m = frame ?? minigame;
  if (frame) artSrc = undefined;
  return (
    <article className={`mg-card${feature ? " mg-card--feature" : ""}${frame ? " is-rolling" : ""}`} aria-hidden={frame ? true : undefined} style={{ "--mg": m ? minigameColor(m.category) : "#6d4ee6" } as React.CSSProperties}>
      <div className="mg-card__art">
        {artSrc ? <img className="mg-card__img" src={artSrc} alt="" /> : <IconField category={m ? "minigame" : "mystery"} seed={m?.name ?? "minigame"} opacity={0.22} motion={feature ? "ambient" : "none"} />}
        <div className="mg-card__body">
          <span className="mg-card__eyebrow">{round ? `Round ${round} · ` : ""}{frame ? "Minigame" : categoryLabel}</span>
          <strong className="mg-card__name">{m?.name ?? "Spin for a minigame"}</strong>
          {m && (m.motion || m.coin || m.edition === "switch2" || (m.controls && m.controls !== "mouse")) && (
            <span className="mg-card__badges">
              {m.motion && <Badge size="small">Motion</Badge>}
              {m.coin && <Badge size="small">Coins</Badge>}
              {m.edition === "switch2" && <Badge size="small">Switch 2</Badge>}
              {m.controls && m.controls !== "mouse" && <Badge size="small">{m.controls === "camera" ? "Camera" : "Microphone"}</Badge>}
            </span>
          )}
        </div>
      </div>
      {children && <div className="mg-card__foot">{children}</div>}
    </article>
  );
}
