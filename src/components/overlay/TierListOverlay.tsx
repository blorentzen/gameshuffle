"use client";

/**
 * Tier List overlay renderer (Streamer Tools Integration, Phase 3). Draws the
 * S/A/B/C/D rows with a colored label cell and the items placed in each. Items
 * still in the unranked tray are omitted from the overlay (they're the streamer's
 * staging area in the Hub). A `cleared` payload renders nothing.
 */

import { type CSSProperties } from "react";

export interface TierRow {
  key: string;
  label: string;
  color: string;
}
export interface TierItem {
  id: number;
  text: string;
  tier: string | null;
}
export interface TierListOverlayPayload {
  title?: string | null;
  tiers?: TierRow[];
  items?: TierItem[];
  accentColor?: string;
  cleared?: boolean;
}

export function TierListOverlay({
  payload,
  style,
}: {
  payload: TierListOverlayPayload;
  style?: CSSProperties;
}) {
  const tiers = payload.tiers ?? [];
  const items = payload.items ?? [];
  if (payload.cleared || tiers.length === 0) return null;

  const accent = payload.accentColor ?? "#2f6fd6";
  const rootStyle: CSSProperties = { ...style, ["--tier-accent" as string]: accent };

  return (
    <div className="gs-overlay-tierlist-pos" style={rootStyle}>
      <div className="gs-overlay-tierlist">
        {payload.title ? (
          <div className="gs-overlay-tierlist__title">{payload.title}</div>
        ) : null}
        {tiers.map((t) => {
          const row = items.filter((it) => it.tier === t.key);
          return (
            <div key={t.key} className="gs-overlay-tierlist__row">
              <div
                className="gs-overlay-tierlist__label"
                style={{ background: t.color }}
              >
                {t.label}
              </div>
              <div className="gs-overlay-tierlist__items">
                {row.map((it) => (
                  <span key={it.id} className="gs-overlay-tierlist__chip">
                    {it.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
