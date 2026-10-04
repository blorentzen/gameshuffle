/**
 * Key art for games without their own art folders in the randomizer data, on
 * the Empac CDN (uploaded by Britton 2026-10-04). `hero` is the large art used
 * for headers and app cards; `cover` is the small box art (144 x 192).
 * FireRed/LeafGreen art is still to come.
 */

const CDN = "https://cdn.empac.co/gameshuffle/images";

export interface GameArt {
  hero: { src: string; alt: string; width: number; height: number; focus?: string };
  cover: string;
}

export const GAME_ART: Record<string, GameArt> = {
  "mario-party": {
    hero: { src: `${CDN}/legacy-mario-party/mario-party-thumb.jpg`, alt: "Mario Party key art", width: 1920, height: 1080 },
    cover: `${CDN}/legacy-mario-party/mario-party-keyart.jpg`,
  },
  "mario-party-2": {
    hero: { src: `${CDN}/legacy-mario-party/mario-party-2-thumb.jpg`, alt: "Mario Party 2 key art", width: 1824, height: 1248 },
    cover: `${CDN}/legacy-mario-party/mario-party-2-keyart.jpg`,
  },
  "mario-party-3": {
    hero: { src: `${CDN}/legacy-mario-party/mario-party-3-thumb.jpg`, alt: "Mario Party 3 key art", width: 1200, height: 1800, focus: "center 30%" },
    cover: `${CDN}/legacy-mario-party/mario-party-3-keyart.jpg`,
  },
  "pokemon-stadium": {
    hero: { src: `${CDN}/pokemon-apps/pokemon-stadium-thumb.jpg`, alt: "Pokémon Stadium key art", width: 1600, height: 800 },
    cover: `${CDN}/pokemon-apps/pokemon-stadium-keyart.jpg`,
  },
  "pokemon-stadium-2": {
    hero: { src: `${CDN}/pokemon-apps/pokemon-stadium-2-thumb.jpg`, alt: "Pokémon Stadium 2 key art", width: 1000, height: 1500, focus: "center 35%" },
    cover: `${CDN}/pokemon-apps/pokemon-stadium-2-keyart.jpg`,
  },
  "goldeneye-007": {
    hero: { src: `${CDN}/goldeneye/goldeneye-thumb.jpg`, alt: "GoldenEye 007 key art", width: 1920, height: 1080 },
    cover: `${CDN}/goldeneye/goldeneye-keyart.jpg`,
  },
};

/** GoldenEye character portraits, cropped from the CDN character sheet (named cast; everyone else gets the "?" tile). */
const GOLDENEYE_PORTRAITS = new Set(["James Bond", "Natalya", "Trevelyan", "Xenia", "Ourumov", "Boris", "Valentin", "Mishkin", "Mayday", "Jaws", "Oddjob", "Baron Samedi"]);
export function goldeneyePortrait(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `/images/goldeneye/characters/${GOLDENEYE_PORTRAITS.has(name) ? slug : "unknown"}.jpg`;
}
