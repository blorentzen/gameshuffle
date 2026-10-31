"use client";

/** The four layouts on a stream-like backdrop, each playing the made-up night (signed-out /mmr-card).
 *  The panel shows Everything, so its last tile takes turns; the others are on Standard. The rolling bar
 *  gets 20 seconds between events so it can roll through its slides. */

import { DEFAULT_LOOK, type MmrLook } from "@/lib/mmr/look";
import { applyPreset } from "@/lib/mmr/pieces";
import { MmrDemo } from "./MmrLive";

const LOOKS: { label: string; look: MmrLook }[] = [
  { label: "Deck card", look: DEFAULT_LOOK },
  { label: "Overlay panel, everything on", look: { ...DEFAULT_LOOK, id: "panel", layout: "panel", fill: "solid", info: applyPreset(DEFAULT_LOOK.info, "everything") } },
  { label: "Squares strip", look: { ...DEFAULT_LOOK, id: "strip", layout: "strip", surface: "glass", colors: "division", fill: "solid" } },
  { label: "Sticker", look: { ...DEFAULT_LOOK, id: "sticker", layout: "sticker", colors: "division", fill: "gradient" } },
  { label: "Rolling, as a bar", look: { ...DEFAULT_LOOK, id: "rolling", layout: "rolling" } },
];

export function MmrShowcase() {
  return (
    <div className="mmr-showcase">
      {LOOKS.map(({ label, look }) => (
        <figure key={look.id} className="mmr-showcase__item">
          <figcaption>{label}</figcaption>
          <div className="mmr-stage">
            <div className="mmr-frame" tabIndex={0} role="region" aria-label={`${label} example`}>
              <MmrDemo look={look} gap={look.layout === "rolling" ? 20_000 : undefined} />
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
