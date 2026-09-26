/**
 * The lifestyle photo library: real people at real tables and real setups.
 *
 * Why a manifest rather than loose files in public/: a photo carries
 * provenance. Which source it came from, who shot it, and the licence it
 * shipped under are facts we need years from now when someone asks, and they
 * are not recoverable from a jpeg on disk. Written by
 * `scripts/fetch-lifestyle-imagery.ts`, hand-editable after.
 *
 * Neither licence we use requires attribution on a web surface (Pexels waives
 * it outright; the Freepik Premium Licence covers commercial use under the
 * seat), but `credit` is here so a page CAN attribute, and so the licence a
 * given file arrived under is never in doubt.
 *
 * Photos are a top layer, never the baseline. Two hundred events cannot each
 * have one, and one photo shared by all of them is the identical-AI-trophy
 * problem again. `EventHeaderArt` stays the default; a photo is an override on
 * the handful of surfaces where a specific image earns its weight.
 */

export type LifestyleSlot =
  /** /game-nights hero band. */
  | "hero-game-nights"
  /** /tournament hero band. */
  | "hero-tournaments"
  /** /communities hero band. */
  | "hero-community"
  /** Homepage Play door. */
  | "door-play"
  /** Homepage Compete door. */
  | "door-compete"
  /** Homepage Community door. */
  | "door-community"
  /** Homepage Stream door. */
  | "door-stream";

export interface LifestylePhoto {
  /** Path under public/. */
  src: string;
  /** Intrinsic size, so next/image can reserve the box. */
  width: number;
  height: number;
  /**
   * Decorative on every surface we use it (the copy carries the meaning), so
   * alt is empty by design. Kept as a field because a future editorial use
   * would need a real one.
   */
  alt: string;
  /** Where the subject sits, for object-position when the crop is tight. */
  focus?: string;
  credit: {
    /** `magnific` is the former Freepik. */
    source: "magnific" | "pexels" | "original";
    /** Photographer name as the source gives it. */
    photographer: string;
    /** The asset's page on the source, not the file. */
    url: string;
    /** Licence label, e.g. "Pexels Licence". */
    licence: string;
  };
}

/**
 * Empty until the first pull. A slot with no entry renders the generated art,
 * which is the designed state rather than a fallback, so shipping half-filled
 * is fine.
 */
export const LIFESTYLE: Partial<Record<LifestyleSlot, LifestylePhoto>> = {
  "hero-game-nights": {
    src: "/images/lifestyle/hero-game-nights.96d98118.jpg",
    width: 2400,
    height: 1567,
    alt: "",
    // The game is the point of the picture. Centred, the band keeps the faces
    // and crops the tower straight off the bottom.
    focus: "center 63%",
    credit: {
      source: "magnific",
      photographer: "prostock-studio",
      url: "https://www.magnific.com/premium-photo/young-multiethnic-friends-playing-board-game-having-fun-home_126468755.htm",
      licence: "Freepik Premium Licence",
    },
  },
};

export function lifestyle(slot: LifestyleSlot): LifestylePhoto | null {
  return LIFESTYLE[slot] ?? null;
}
