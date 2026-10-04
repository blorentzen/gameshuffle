/**
 * Drafts one Daily Shuffle clue per character with Claude, from the checked
 * facts only (scratchpad merged.json from the research pass, or the
 * daily-facts data). Writes a JSON map name → clue for review; nothing ships
 * until it's copied into src/data/originals/daily-facts.ts after a read-through.
 *
 *   npx tsx scripts/draft-daily-clues.ts <merged.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type Row = { name: string; species: string; debut_game: string; debut_year: number; debut_series: string; mk_debut_game: string | null; mk_debut_year: number | null; mp_debut_game: string | null; mp_debut_year: number | null };
const [inPath, outPath] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(inPath, "utf8")) as Row[];

const Clues = z.object({ clues: z.array(z.object({ name: z.string(), clue: z.string() })) });

const system = `You write the hint for a daily "guess the Nintendo character" game. Players see it after three wrong guesses, so it should narrow things down without giving the answer away.

Rules for every clue:
- Use ONLY the facts provided for that character. Do not add anything from memory: no personality, appearance, relationships, quotes or plot details. If it isn't in the facts, it isn't in the clue.
- Never write the character's name, any part of it, or any other name for them. Never write another character's name either.
- You may name the debut game, the first Mario Kart they were playable in, or the first Mario Party they were playable in.
- One sentence, at most 90 characters, playful and plain. No em dashes or en dashes. No exclamation marks.
- Prefer the most distinctive provided fact (usually the debut game). Avoid restating only the year or the species; the player already sees those columns.`;

const facts = rows.map((r) => ({
  name: r.name, species: r.species, debutGame: r.debut_game, debutYear: r.debut_year,
  firstPlayableMarioKart: r.mk_debut_game, firstPlayableMarioParty: r.mp_debut_game,
}));

(async () => {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: `Write one clue for each character below, in the same order, keeping each name exactly as given.\n\n${JSON.stringify(facts, null, 1)}` }],
    output_config: { effort: "medium", format: zodOutputFormat(Clues) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) { console.error("No clues:", res.stop_reason); process.exit(1); }
  const out: Record<string, string> = {};
  const problems: string[] = [];
  const allNames = rows.map((r) => r.name);
  for (const { name, clue } of res.parsed_output.clues) {
    if (!allNames.includes(name)) { problems.push(`unknown name ${name}`); continue; }
    const words = allNames.flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 4 && !["mario", "kart", "party", "baby", "king", "metal", "gold", "pink"].includes(w));
    const own = name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
    const lc = clue.toLowerCase();
    if (own.some((w) => new RegExp(`\\b${w}`).test(lc))) problems.push(`${name}: names itself: ${clue}`);
    else if (words.some((w) => new RegExp(`\\b${w}\\b`).test(lc))) problems.push(`${name}: names a character: ${clue}`);
    if (clue.length > 90) problems.push(`${name}: too long (${clue.length})`);
    if (/[—–!]/.test(clue)) problems.push(`${name}: dash or exclamation: ${clue}`);
    out[name] = clue;
  }
  for (const n of allNames) if (!out[n]) problems.push(`missing ${n}`);
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`${Object.keys(out).length} clues written; usage in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`);
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems found");
})();
