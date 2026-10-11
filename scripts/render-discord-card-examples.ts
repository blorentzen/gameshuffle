/**
 * Renders the example Daily card and morning podium shown on /discord
 * (DiscordMock), through the same renderer the bot uses
 * (src/lib/discord/cards.tsx), so the illustration always matches the real
 * posts. Made-up players with initials, no real faces.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/render-discord-card-examples.ts
 *
 * Writes public/images/discord/daily-card-example.webp and daily-podium-example.webp.
 * Rerun it after changing the card's look.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { renderDailyCard, renderPodium, type CardPlayer, type CellStatus } from "@/lib/discord/cards";

const cells = (row: string): CellStatus[] => [...row].map((c) => (c === "g" ? "match" : c === "y" ? "close" : "miss"));
const player = (name: string, rows: string[], o: Partial<CardPlayer> = {}): CardPlayer => {
  const solved = rows.at(-1) === "ggggg";
  return { name, avatar: null, rows: rows.map(cells), finished: solved || rows.length >= 6, solved, guesses: rows.length, streak: 0, ...o };
};

// Keep these in step with PLAYERS and LABELS in src/components/discord/DiscordMock.tsx.
const today = [
  player("Sam", ["xgxxx", "xgyxx", "ggggg"], { streak: 4 }),
  player("Riley", ["xxxxx", "xxyxg", "ggxyg", "ggggg"]),
  player("Jordan", ["xgxxx", "xxyxx"]),
  player("Alex", ["xxxxx", "xyxxx", "xxyxx", "yxxgx", "xgxgx", "xygxx"]),
];
const yesterday = [
  player("Sam", ["xxyxx", "xgyxx", "ggggg"], { streak: 4 }),
  player("Riley", ["xxxxx", "xxyxg", "ggxyg", "ggggg"]),
  player("Jordan", ["xxxxx", "xyxxx", "xgyxx", "ggxgg", "ggggg"]),
];

async function save(png: Buffer, name: string) {
  const file = join(process.cwd(), "public/images/discord", name);
  await writeFile(file, await sharp(png).webp({ quality: 88 }).toBuffer());
  console.log("wrote", file);
}

async function main() {
  await save(await renderDailyCard({ number: 9, game: "Mario Party", channel: "game-night", max: 6, cols: 5, players: today }), "daily-card-example.webp");
  await save(await renderPodium({ number: 8, game: "Mario Kart World", channel: "game-night", top: yesterday, played: 4, solved: 3, streak: 6 }), "daily-podium-example.webp");
}

main().catch((err) => { console.error(err); process.exit(1); });
