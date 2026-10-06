/**
 * Key art for games without their own art folders in the randomizer data, on
 * the Empac CDN (uploaded by Britton 2026-10-04). `hero` is the large art used
 * for headers and app cards; `cover` is the small box art (144 x 192).
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
  "pokemon-firered-leafgreen": {
    hero: { src: `${CDN}/pokemon-apps/pokemon-firered-leafgreen-thumb.webp`, alt: "Pokémon Fire Red and Leaf Green key art", width: 1200, height: 675 },
    cover: `${CDN}/pokemon-apps/pokemon-firered-leafgreen-keyart.jpg`,
  },
  "goldeneye-007": {
    hero: { src: `${CDN}/goldeneye/goldeneye-thumb.jpg`, alt: "GoldenEye 007 key art", width: 1920, height: 1080 },
    cover: `${CDN}/goldeneye/goldeneye-keyart.jpg`,
  },
  "super-smash-bros-ultimate": {
    hero: { src: "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg", alt: "Super Smash Bros. Ultimate cast artwork", width: 1280, height: 720 },
    cover: "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg",
  },
  /* Official key art, pulled 2026-10-05 (sources in the comments). */
  "mario-kart-64": {
    /* Royal Raceway artwork, Super Mario Wiki (File:Royal_Raceway_MK64_artwork.jpg). */
    hero: { src: "/images/mario-kart-64/mario-kart-64-keyart.webp", alt: "Mario Kart 64 artwork of Mario, Wario, Donkey Kong and Bowser racing at Royal Raceway", width: 1600, height: 900 },
    cover: "/images/mario-kart-64/mario-kart-64-keyart.webp",
  },
  "perfect-dark": {
    /* Xbox store hero for the 2010 remaster (the only official landscape art at full size). */
    /* The header uses the art above the logo (our title already says Perfect Dark); the card keeps the logo. */
    hero: { src: "/images/perfect-dark/perfect-dark-header.webp", alt: "Perfect Dark key art of Joanna Dark", width: 1600, height: 575, focus: "22% center" },
    cover: "/images/perfect-dark/perfect-dark-keyart.webp",
  },
  "kirby-air-riders": {
    /* Official banner from WiKirby (File:KARs_Banner.png). The header uses its background alone
       (File:KARs_Banner_Background.jpg) because our title already names the game; the card keeps the logo. */
    hero: { src: "/images/kirby-air-riders/kirby-air-riders-header.webp", alt: "Kirby Air Riders artwork of a flowery Air Ride course from above", width: 1440, height: 836 },
    cover: "/images/kirby-air-riders/kirby-air-riders-keyart.webp",
  },
  "splatoon-3": {
    /* Official 3D render of four Inklings and Octolings, Inkipedia (File:S3_Fashion_3D_Render.jpg). */
    hero: { src: "/images/splatoon-3/splatoon-3-keyart.webp", alt: "Splatoon 3 render of four Inklings and Octolings in Splatsville", width: 1600, height: 900 },
    cover: "/images/splatoon-3/splatoon-3-keyart.webp",
  },
  "overwatch": {
    /* Talon lineup from the official Overwatch site. */
    hero: { src: "/images/overwatch/overwatch-keyart.webp", alt: "Overwatch key art of Moira, Baptiste, Doomfist, Reaper and Sombra", width: 1600, height: 900 },
    cover: "/images/overwatch/overwatch-keyart.webp",
  },
  "marvel-rivals": {
    /* Tokyo 2099 rooftop key art (Marvel Database mirror of the official art). */
    hero: { src: "/images/marvel-rivals/marvel-rivals-keyart.webp", alt: "Marvel Rivals key art of heroes on a Tokyo 2099 rooftop", width: 1600, height: 900 },
    cover: "/images/marvel-rivals/marvel-rivals-keyart.webp",
  },

};

/** GoldenEye character portraits, cropped from the CDN character sheet (named cast; everyone else gets the "?" tile). */
const GOLDENEYE_PORTRAITS = new Set(["James Bond", "Natalya", "Trevelyan", "Xenia", "Ourumov", "Boris", "Valentin", "Mishkin", "Mayday", "Jaws", "Oddjob", "Baron Samedi"]);
export function goldeneyePortrait(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `/images/goldeneye/characters/${GOLDENEYE_PORTRAITS.has(name) ? slug : "unknown"}.jpg`;
}

/** GoldenEye map screenshots (GoldenEye Wiki, pulled 2026-10-04) in /images/goldeneye/maps. Temple and Basement are low resolution. */
export function goldeneyeMapArt(id: string): string {
  return `/images/goldeneye/maps/${id}.webp`;
}

/** Perfect Dark arena screenshots in /images/perfect-dark/arenas: Xbox Live Arcade remaster captures from the Perfect Dark Wiki (same layouts as N64), pulled 2026-10-05. null = no art; the card keeps its icon. */
const PD_ARENA_ART = new Set<string>(["skedar", "pipes", "ravine", "g5-building", "sewers", "warehouse", "grid", "ruins", "area-52", "base", "fortress", "villa", "car-park", "temple", "complex", "felicity"]);
export function perfectDarkArenaArt(id: string): string | null {
  return PD_ARENA_ART.has(id) ? `/images/perfect-dark/arenas/${id}.webp` : null;
}

/**
 * Perfect Dark character tiles: no consistent portrait set exists (checked 2026-10-05), so each
 * character gets a Tabler icon for who they are (an outfit, a job) in /images/perfect-dark/icons.
 * Named cast and Joanna's outfits are listed; everyone else is matched by job.
 */
const PD_ICONS: Record<string, string> = {
  "Joanna Combat": "spy",
  "Joanna Trench Coat": "hanger",
  "Joanna Party Frock": "confetti",
  "Joanna Frock (Ripped)": "hanger-off",
  "Joanna Stewardess": "plane-inflight",
  "Joanna Leather": "jacket",
  "Joanna Negotiator": "briefcase",
  "Joanna Wet Suit": "swimming",
  "Joanna Aqualung": "scuba-mask",
  "Joanna Arctic": "snowflake",
  "Joanna Lab Tech.": "flask",
  "Elvis": "alien",
  "Elvis (Waistcoat)": "alien",
  "Maian": "alien",
  "Maian Soldier": "alien",
  "Daniel Carrington": "tie",
  "Carrington Evening Wear": "bow",
  "Mr. Blonde": "mask",
  "Cassandra De Vries": "crown",
  "Trent Easton": "id-badge-2",
  "The President": "flag",
  "President's Clone": "copy",
};
export function perfectDarkTile(name: string): string {
  const icon = PD_ICONS[name]
    ?? (/Biotech/.test(name) ? "microscope"
      : /Lab Tech/.test(name) ? "flask"
      : /Sniper/.test(name) ? "crosshair"
      : /Steward/.test(name) ? "plane-inflight"
      : /Pilot/.test(name) ? "plane"
      : /Office Casual/.test(name) ? "shirt"
      : /Secretary|Office|Negotiator|Lackey/.test(name) ? "briefcase"
      : /Agent|Bodyguard|Presidential Security/.test(name) ? "user-shield"
      : /Overalls/.test(name) ? "tool"
      : "helmet");
  return `/images/perfect-dark/icons/${icon}.svg`;
}

/** Perfect Dark character portraits in /images/perfect-dark/characters (null = none yet; use perfectDarkTile). */
const PD_PORTRAITS = new Set<string>([]);
export function perfectDarkPortrait(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return PD_PORTRAITS.has(slug) ? `/images/perfect-dark/characters/${slug}.webp` : null;
}
