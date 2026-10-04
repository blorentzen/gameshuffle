/**
 * GET /api/chat-brain/share/[id]?format=og|story
 * The share image for one Chat Brain question: og (1200×630, link previews on
 * X, Bluesky, Discord, Reddit) or story (1080×1920, Instagram and TikTok
 * stories, where links don't preview).
 *
 * Same style as every other GameShuffle share image (the static
 * opengraph-image.jpg files): the #2f66ec→#4b5cf5 wash, a faint field of Tabler
 * glyphs for the page, and Gabarito set as wordmark + title + subtitle. No word
 * repeats between those three lines, so the subtitle is picked against the
 * question (a question about chat drops "Chat Brain" from the subtitle).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getPublicPrompt } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

// Tabler outline glyphs (@tabler/icons: brain, messages, chart-bar), 24×24.
const GLYPHS: string[][] = [
  ["M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8", "M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8", "M17.5 16a3.5 3.5 0 0 0 0 -7h-.5", "M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0", "M6.5 16a3.5 3.5 0 0 1 0 -7h.5", "M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"],
  ["M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10", "M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2"],
  ["M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6", "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10", "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14", "M4 20h14"],
];

/** The glyph field as one SVG: a staggered grid cycling the three glyphs. */
function glyphField(w: number, h: number): string {
  const step = 84, row = 80, size = 40;
  const cells: string[] = [];
  for (let r = 0, y = 18; y < h; r++, y += row) {
    for (let c = 0, x = (r % 2 ? step / 2 : 0) - 20; x < w; c++, x += step) {
      const g = GLYPHS[(c + r) % GLYPHS.length];
      cells.push(`<g transform="translate(${x} ${y}) scale(${size / 24})">${g.map((d) => `<path d="${d}"/>`).join("")}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${cells.join("")}</g></svg>`;
}

const STOP = new Set(["a", "an", "the", "in", "on", "of", "to", "you", "your", "is", "it", "and", "or", "for", "at", "what", "name", "something"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x)));

/** First subtitle that shares no word with the question or the wordmark. */
function subtitleFor(question: string): string {
  const q = words(`${question} gameshuffle`);
  const options = ["Chat Brain: answer in 5 seconds", "Chat Brain: what would you say?", "Answer in 5 seconds", "What would you say?", "Your first thought counts"];
  return options.find((o) => ![...words(o)].some((x) => q.has(x))) ?? options[options.length - 1];
}

function titleSize(len: number, story: boolean): number {
  if (story) return len <= 40 ? 112 : len <= 70 ? 96 : len <= 100 ? 82 : 70;
  return len <= 40 ? 92 : len <= 70 ? 76 : len <= 100 ? 64 : 54;
}

let font: Promise<Buffer> | null = null;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = new URL(req.url).searchParams.get("format") === "story";
  const p = await getPublicPrompt(id);
  if (!p) return new Response("not found", { status: 404 });
  font ??= readFile(join(process.cwd(), "src/app/fonts/gabarito-bold.ttf"));
  const w = story ? 1080 : 1200, h = story ? 1920 : 630;
  const field = `data:image/svg+xml;base64,${Buffer.from(glyphField(w, h)).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Gabarito", color: "#ffffff", background: "linear-gradient(135deg, #2f66ec 0%, #4b5cf5 100%)" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.10), rgba(255,255,255,0) 62%)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
        <img src={field} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: story ? "0 90px" : "0 80px", textAlign: "center" }}>
          <div style={{ display: "flex", fontSize: story ? 76 : 56, letterSpacing: -1 }}>GameShuffle</div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: titleSize(p.text.length, story), lineHeight: 1.08, letterSpacing: -2, marginTop: story ? 56 : 18, maxWidth: story ? 900 : 1040 }}>{p.text}</div>
          <div style={{ display: "flex", fontSize: story ? 60 : 46, marginTop: story ? 64 : 26 }}>{subtitleFor(p.text)}</div>
        </div>
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: [{ name: "Gabarito", data: await font, weight: 700, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
