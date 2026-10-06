/**
 * Drafts one Smash Ultimate Daily Shuffle clue per fighter with Claude, from the
 * checked facts only (src/data/originals/daily-facts-smash.ts). Writes a JSON
 * map name → clue for review; nothing ships until it's copied into that file
 * after a read-through.
 *
 *   npx tsx scripts/draft-daily-clues-smash.ts <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SMASH_FACTS, smashWeightClass } from "../src/data/originals/daily-facts-smash";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const [outPath] = process.argv.slice(2);
const Clues = z.object({ clues: z.array(z.object({ name: z.string(), clue: z.string() })) });

const system = `You write the hint for a daily "guess the Super Smash Bros. Ultimate fighter" game. Players see it after three wrong guesses, so it should narrow things down without giving the answer away.

Rules for every clue:
- Use ONLY the facts provided for that fighter. Do not add anything from memory: no moves, personality, appearance, relationships, quotes or plot details. If it isn't in the facts, it isn't in the clue.
- Never write the fighter's name, any part of it, or any other name for them. Never write another fighter's name as a character either.
- Name the debut game whenever its title does not contain this fighter's own name (a title with another character's or a series name in it is fine, e.g. "Debuted in Donkey Kong"). If the title does contain the fighter's own name, say "debuted in a self-titled game" plus the year instead.
- The player already sees the series, first Smash game, debut year, weight class and third party as columns, so a clue must add something: usually the debut game. Never write a clue that only repeats those columns.
- One sentence, at most 90 characters, playful and plain. No em dashes or en dashes. No exclamation marks.`;

const names = Object.keys(SMASH_FACTS);
const facts = names.map((name) => {
  const f = SMASH_FACTS[name];
  const firstSmash = f.firstSmash === "64" ? "Super Smash Bros. (N64)" : f.firstSmash === "Smash 4" ? "Super Smash Bros. for 3DS / Wii U" : `Super Smash Bros. ${f.firstSmash}`;
  return { name, series: f.series, debutGame: f.debutGame, debutYear: f.debutYear, firstPlayableIn: firstSmash, weightClass: smashWeightClass(f.weight), thirdParty: f.thirdParty };
});

(async () => {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: `Write one clue for each fighter below, in the same order, keeping each name exactly as given.\n\n${JSON.stringify(facts, null, 1)}` }],
    output_config: { effort: "medium", format: zodOutputFormat(Clues) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) { console.error("No clues:", res.stop_reason); process.exit(1); }
  const out: Record<string, string> = {};
  const problems: string[] = [];
  const generic = new Set(["pokémon", "super", "bros", "kong", "king", "mega", "dark", "young", "toon", "zero", "suit", "trainer", "plant", "hunt", "fighter", "brawler", "gunner", "swordfighter", "game", "watch", "little"]);
  for (const { name, clue } of res.parsed_output.clues) {
    if (!names.includes(name)) { problems.push(`unknown name ${name}`); continue; }
    const lc = clue.toLowerCase();
    const own = name.toLowerCase().split(/[^a-zé]+/).filter((w) => w.length >= 3 && !generic.has(w));
    const others = names.filter((n) => n !== name).flatMap((n) => n.toLowerCase().split(/[^a-zé]+/)).filter((w) => w.length >= 4 && !generic.has(w));
    if (own.some((w) => new RegExp(`\\b${w}\\b`).test(lc))) problems.push(`${name}: names itself: ${clue}`);
    else if (others.some((w) => new RegExp(`\\b${w}\\b`).test(lc))) problems.push(`${name}: names a fighter: ${clue}`);
    if (clue.length > 90) problems.push(`${name}: too long (${clue.length})`);
    if (/[—–!]/.test(clue)) problems.push(`${name}: dash or exclamation: ${clue}`);
    out[name] = clue;
  }
  for (const n of names) if (!out[n]) problems.push(`missing ${n}`);
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`${Object.keys(out).length} clues written; usage in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`);
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems found");
})();
