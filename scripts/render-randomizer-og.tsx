/**
 * Renders randomizer share images (1200x630) in the site's style: the
 * GameShuffle wordmark, a big title and a subtitle in Gabarito, centred over
 * game art under the blue wash. No word may repeat across the three lines.
 * Writes public/images/opengraph/<slug>-og.jpg; set the landing's ogImage to it.
 *
 *   npx tsx scripts/render-randomizer-og.tsx            (all below)
 *   npx tsx scripts/render-randomizer-og.tsx perfect-dark
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import sharp from "sharp";

const CDN = "https://cdn.empac.co/gameshuffle/images";
/** `crop` = [left, top, width, height] as fractions of the art, to keep baked-in logos out. */
const SPECS: { slug: string; title: string; sub: string; art: string; size?: number; crop?: [number, number, number, number] }[] = [
  { slug: "mario-kart-64", title: "Mario Kart 64", sub: "Racer & Track Randomizer", art: "public/images/mario-kart-64/mario-kart-64-keyart.webp" },
  { slug: "perfect-dark", title: "Perfect Dark", sub: "Combat Simulator Randomizer", art: "public/images/perfect-dark/perfect-dark-header.webp", crop: [0, 0, 1, 0.82] },
  { slug: "overwatch", title: "Overwatch", sub: "Hero Randomizer", art: "public/images/overwatch/overwatch-keyart.webp" },
  { slug: "marvel-rivals", title: "Marvel Rivals", sub: "Hero Randomizer", art: "public/images/marvel-rivals/marvel-rivals-keyart.webp" },
  { slug: "super-smash-bros-ultimate", title: "Smash Ultimate", sub: "Fighter Randomizer", art: `${CDN}/standard/smash-bros-ultimate-cast-artwork.jpg` },
  { slug: "kirby-air-riders", title: "Kirby Air Riders", sub: "Machine & Course Randomizer", art: "public/images/kirby-air-riders/kirby-air-riders-header.webp", size: 140 },
  { slug: "splatoon-3", title: "Splatoon 3", sub: "Weapon & Stage Randomizer", art: "public/images/splatoon-3/splatoon-3-keyart.webp" },
  { slug: "goldeneye-007", title: "GoldenEye 007", sub: "Match Randomizer", art: "public/images/goldeneye/maps/facility.webp" },
  { slug: "pokemon-stadium", title: "Pokémon Stadium", sub: "Rental Randomizer", art: `${CDN}/pokemon-apps/pokemon-stadium-thumb.jpg`, size: 126, crop: [0, 0.45, 1, 0.55] },
  { slug: "pokemon-firered-leafgreen", title: "Fire Red & Leaf Green", sub: "Run Challenge", art: `${CDN}/pokemon-apps/pokemon-firered-leafgreen-thumb.webp`, size: 118 },
  { slug: "mario-party", title: "Mario Party", sub: "N64 Randomizer", art: `${CDN}/legacy-mario-party/mario-party/boards/peachs-birthday-cake.png` },
  { slug: "mario-party-2", title: "Mario Party 2", sub: "N64 Randomizer", art: `${CDN}/legacy-mario-party/mario-party-2/boards/pirate-land.png` },
  { slug: "mario-party-3", title: "Mario Party 3", sub: "N64 Randomizer", art: `${CDN}/legacy-mario-party/mario-party-3/boards/chilly-waters.webp` },
];

const font = readFileSync("src/app/fonts/gabarito-bold.ttf");

async function artDataUrl(src: string, crop?: [number, number, number, number]): Promise<string> {
  let buf: Buffer = src.startsWith("http") ? Buffer.from(await (await fetch(src)).arrayBuffer()) : readFileSync(src);
  if (crop) {
    const m = await sharp(buf).metadata();
    const [l, t, w, h] = crop;
    buf = await sharp(buf).extract({ left: Math.round(l * m.width!), top: Math.round(t * m.height!), width: Math.round(w * m.width!), height: Math.round(h * m.height!) }).toBuffer();
  }
  const jpg = await sharp(buf).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

(async () => {
  const only = process.argv[2];
  for (const s of SPECS.filter((x) => !only || x.slug === only)) {
    const words = (t: string) => t.toLowerCase().split(/[^a-z0-9é]+/).filter((w) => w.length > 2);
    const seen = new Set(words("GameShuffle"));
    for (const w of [...words(s.title), ...words(s.sub)]) {
      if (seen.has(w)) throw new Error(`${s.slug}: "${w}" repeats across the share image lines`);
      seen.add(w);
    }
    const bg = await artDataUrl(s.art, s.crop);
    const titleSize = s.size ?? (s.title.length > 12 ? 150 : 190);
    const img = new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", fontFamily: "Gabarito" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} alt="" />
          <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(135deg, rgba(47,102,236,0.86), rgba(75,92,245,0.86))" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: "0 60px" }}>
            <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>GameShuffle</div>
            <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3, marginTop: 8 }}>{s.title}</div>
            <div style={{ fontSize: 64, fontWeight: 700, marginTop: 18 }}>{s.sub}</div>
          </div>
        </div>
      ),
      { width: 1200, height: 630, fonts: [{ name: "Gabarito", data: font, weight: 700, style: "normal" }] },
    );
    const png = Buffer.from(await img.arrayBuffer());
    await sharp(png).jpeg({ quality: 84 }).toFile(`public/images/opengraph/${s.slug}-og.jpg`);
    console.log("wrote", s.slug);
  }
})();
