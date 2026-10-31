/**
 * Drafts one Daily Shuffle clue per character for ONE puzzle, with Claude,
 * from a fact sheet of checked facts only. Each puzzle gets its own clue
 * (about that game), so Koopa Troopa's Mario Kart clue no longer talks about
 * Mario Party. Writes a JSON map name → clue for review; nothing ships until
 * it's copied into src/data/originals/daily-clues.ts after a read-through.
 *
 *   npx tsx scripts/draft-daily-clues-by-game.ts <sheet.json> <out.json>
 *
 * The sheet: { puzzle, game, columns: string[] (what each guess already shows),
 * guidance: string (which facts make the best clue for this game),
 * rows: [{ name, facts: { label: value } }] }.
 */
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

interface Sheet { puzzle: string; game: string; columns: string[]; guidance: string; rows: { name: string; facts: Record<string, unknown> }[] }
const [inPath, outPath] = process.argv.slice(2);
const sheet = JSON.parse(readFileSync(inPath, "utf8")) as Sheet;

const Clues = z.object({ clues: z.array(z.object({ name: z.string(), clue: z.string() })) });

const system = `You write the hint for a daily "guess the character" game about ${sheet.game}. Players see it after three wrong guesses, so it should narrow things down without giving the answer away.

Each guess already shows these columns, so a clue that only repeats one of them is wasted: ${sheet.columns.join(", ")}.

What makes a good clue for this game: ${sheet.guidance}

Rules for every clue:
- Use ONLY the facts provided for that character. Do not add anything from memory: no personality, appearance, relationships, quotes, moves or plot details that aren't in the facts. If it isn't in the facts, it isn't in the clue.
- Never write the character's name, any part of it, or any other name for them. Never write another character's name either, including inside a game, move or ability name; if the best fact contains a character's name, use a different fact.
- One sentence, at most 100 characters, playful and plain. No em dashes or en dashes. No exclamation marks.
- Write about this game (${sheet.game}) where the facts allow it.`;

(async () => {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: `Write one clue for each character below, in the same order, keeping each name exactly as given.\n\n${JSON.stringify(sheet.rows, null, 1)}` }],
    output_config: { effort: "medium", format: zodOutputFormat(Clues) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) { console.error("No clues:", res.stop_reason); process.exit(1); }
  const out: Record<string, string> = {};
  const problems: string[] = [];
  const allNames = sheet.rows.map((r) => r.name);
  // Words that are common English or shared across names don't count as naming someone.
  const common = new Set(["mario", "kart", "party", "baby", "king", "metal", "gold", "pink", "dark", "young", "toon", "trainer", "fighter", "little", "piranha", "plant", "zero", "suit", "game", "watch", "hero", "duck", "hunt", "wii", "fit", "mega", "man", "pokemon", "pokémon", "ice", "dr", "mr", "the", "and", "brawler", "swordfighter", "gunner", "bros", "bro", "dry"]);
  const words = [...new Set(allNames.flatMap((n) => n.toLowerCase().split(/[^a-zà-ÿ]+/)).filter((w) => w.length >= 3 && !common.has(w)))];
  for (const { name, clue } of res.parsed_output.clues) {
    if (!allNames.includes(name)) { problems.push(`unknown name ${name}`); continue; }
    const own = name.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length >= 3 && !common.has(w));
    const lc = clue.toLowerCase();
    const hit = (w: string) => new RegExp(`(^|[^a-zà-ÿ])${w}([^a-zà-ÿ]|$)`).test(lc);
    if (own.some(hit)) problems.push(`${name}: names itself: ${clue}`);
    else { const other = words.find(hit); if (other) problems.push(`${name}: names a character (${other}): ${clue}`); }
    if (clue.length > 100) problems.push(`${name}: too long (${clue.length}): ${clue}`);
    if (/[—–!]/.test(clue)) problems.push(`${name}: dash or exclamation: ${clue}`);
    out[name] = clue;
  }
  for (const n of allNames) if (!out[n]) problems.push(`missing ${n}`);
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`${Object.keys(out).length} clues written for ${sheet.puzzle}; tokens in/out: ${res.usage.input_tokens}/${res.usage.output_tokens}`);
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems found");
})();
