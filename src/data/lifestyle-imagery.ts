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
  | "door-stream"
  /** The picks after the dailies and on the room (dailies + explore picks 2026-11-05): a photo where a pick has no game art. */
  | "pick-trivia"
  | "pick-most-likely"
  | "pick-odd-one-out"
  | "pick-time-trial"
  | "pick-stream"
  | "pick-bracket";

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
  "pick-trivia": {
    src: "/images/lifestyle/pick-trivia.19928efa.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "Digicells International",
      url: "https://www.pexels.com/photo/lively-gathering-of-friends-in-islamabad-cafe-29200727/",
      licence: "Pexels Licence",
    },
  },
  "pick-most-likely": {
    src: "/images/lifestyle/pick-most-likely.3a6db28a.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "Anna Shvets",
      url: "https://www.pexels.com/photo/friends-in-pink-clothes-5325597/",
      licence: "Pexels Licence",
    },
  },
  "pick-odd-one-out": {
    src: "/images/lifestyle/pick-odd-one-out.8a9c29c6.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "Kevin Malik",
      url: "https://www.pexels.com/photo/smiling-guys-playing-retro-video-games-on-party-8763240/",
      licence: "Pexels Licence",
    },
  },
  "pick-time-trial": {
    src: "/images/lifestyle/pick-time-trial.94f5c6c6.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "Patrick",
      url: "https://www.pexels.com/photo/controllers-for-nintendo-switch-17091544/",
      licence: "Pexels Licence",
    },
  },
  "pick-stream": {
    src: "/images/lifestyle/pick-stream.f3ae064d.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "RDNE Stock project",
      url: "https://www.pexels.com/photo/close-up-view-of-a-woman-wearing-white-headphones-7915355/",
      licence: "Pexels Licence",
    },
  },
  "pick-bracket": {
    src: "/images/lifestyle/pick-bracket.26764904.jpg",
    width: 1880,
    height: 1253,
    alt: "",
    credit: {
      source: "pexels",
      photographer: "RDNE Stock project",
      url: "https://www.pexels.com/photo/men-watching-their-friends-play-a-video-game-7915392/",
      licence: "Pexels Licence",
    },
  },
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
