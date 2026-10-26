/** A tool's picture (tools picks 2026-10-25): its Item card's art window and credit, from TOOL_ART. */

import { TOOL_ART } from "@/data/originals/duel/tool-art";
import type { ToolArtView } from "./view";

/** "Potion (Scarlet & Violet), illustrated by Ayaka Yoshida." */
export function toolArtView(id: string | undefined): ToolArtView | null {
  const c = id ? TOOL_ART[id] : null;
  if (!id || !c) return null;
  return {
    img: `https://images.scrydex.com/pokemon/${id}/large`,
    box: c.box, w: c.w, h: c.h,
    credit: `${c.name} (${c.set})${c.artist ? `, illustrated by ${c.artist}` : ""}.`,
  };
}
