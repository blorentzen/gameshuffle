/**
 * Builds the Daily Dex's facts (src/data/originals/daily-dex-facts.ts) from
 * PokeAPI's open data: every Pokémon's English name, generation, current
 * types, evolution stage, Pokédex color, height, weight and category. Rerun it
 * when new Pokémon arrive; the file is regenerated whole.
 *
 *   npx tsx scripts/build-daily-dex.ts [--csv <folder with the PokeAPI csv files>]
 *
 * Without --csv it downloads the tables from the PokeAPI repository.
 *
 * The roster is in National Pokédex order, and that order feeds the answer
 * shuffle: new Pokémon only ever go on the end (the script refuses to drop or
 * move one that's already in the file).
 */

import fs from "node:fs";
import path from "node:path";

const TABLES = ["pokemon_species", "pokemon_species_names", "pokemon", "pokemon_types", "types", "pokemon_colors"] as const;
const SOURCE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const OUT = path.join(__dirname, "../src/data/originals/daily-dex-facts.ts");
const ENGLISH = "9";

const csvAt = process.argv.indexOf("--csv");
const csvDir = csvAt >= 0 ? process.argv[csvAt + 1] : null;

/** A small CSV reader: quoted fields, doubled quotes, commas inside quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function table(name: (typeof TABLES)[number]): Promise<Record<string, string>[]> {
  if (csvDir) return parseCsv(fs.readFileSync(path.join(csvDir, `${name}.csv`), "utf8"));
  const res = await fetch(`${SOURCE}/${name}.csv`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} for ${name}.csv`);
  return parseCsv(await res.text());
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function main() {
  const [species, names, pokemon, pokemonTypes, types, colors] = await Promise.all(TABLES.map(table));

  const typeName = new Map(types.map((t) => [t.id, title(t.identifier)]));
  const colorName = new Map(colors.map((c) => [c.id, title(c.identifier)]));
  const english = new Map(names.filter((n) => n.local_language_id === ENGLISH).map((n) => [n.pokemon_species_id, n]));
  const defaultForm = new Map(pokemon.filter((p) => p.is_default === "1").map((p) => [p.species_id, p]));
  const typesOf = new Map<string, { slot: number; type: string }[]>();
  for (const t of pokemonTypes) {
    const list = typesOf.get(t.pokemon_id) ?? [];
    list.push({ slot: Number(t.slot), type: typeName.get(t.type_id) ?? "?" });
    typesOf.set(t.pokemon_id, list);
  }
  const evolvesInto = new Set(species.map((s) => s.evolves_from_species_id).filter(Boolean));

  const rows = species
    .map((s) => {
      const id = Number(s.id);
      const n = english.get(s.id);
      const form = defaultForm.get(s.id);
      if (!n || !form) throw new Error(`Missing name or form for species ${s.id} (${s.identifier})`);
      const hasParent = !!s.evolves_from_species_id, hasChild = evolvesInto.has(s.id);
      const stage = hasParent ? (hasChild ? "Middle" : "Final") : hasChild ? "First" : "Single";
      const typeList = (typesOf.get(form.id) ?? []).sort((a, b) => a.slot - b.slot).map((t) => t.type);
      if (!typeList.length) throw new Error(`No types for ${n.name}`);
      return {
        id,
        name: n.name,
        gen: Number(s.generation_id),
        types: typeList,
        stage,
        color: colorName.get(s.color_id) ?? "?",
        // PokeAPI keeps height in decimetres and weight in hectograms.
        heightM: Number(form.height) / 10,
        weightKg: Number(form.weight) / 10,
        genus: n.genus.replace(/\s*Pokémon$/, ""),
        legendary: s.is_legendary === "1" || s.is_mythical === "1",
      };
    })
    .sort((a, b) => a.id - b.id);

  rows.forEach((r, i) => { if (r.id !== i + 1) throw new Error(`Gap in the National Pokédex at #${i + 1}`); });

  // New Pokémon go on the end; nothing already published may move or vanish.
  if (fs.existsSync(OUT)) {
    const before = [...fs.readFileSync(OUT, "utf8").matchAll(/^\s*\[(\d+),\s*("(?:[^"\\]|\\.)*")/gm)].map((m) => [Number(m[1]), JSON.parse(m[2]) as string] as const);
    for (const [id, name] of before) {
      const now = rows[id - 1];
      if (!now || now.name !== name) throw new Error(`#${id} ${name} would change to ${now ? now.name : "nothing"}: the roster order feeds past answers`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const lines = rows.map((r) => `  ${JSON.stringify([r.id, r.name, r.gen, r.types, r.stage, r.color, r.heightM, r.weightKg, r.genus, r.legendary ? 1 : 0])},`);
  const file = `/**
 * Every Pokémon's facts for the Daily Dex, generated by scripts/build-daily-dex.ts
 * from PokeAPI's open data (retrieved ${today}). Don't edit by hand: rerun the
 * script. National Pokédex order, and that order feeds the answer shuffle, so
 * new Pokémon only ever go on the end.
 *
 * Each row: [number, name, generation, types (in slot order), stage, Pokédex
 * color, height in metres, weight in kilograms, category (without "Pokémon"),
 * legendary or mythical (1/0)].
 */

export type DexStage = "Single" | "First" | "Middle" | "Final";
export type DexRow = [number, string, number, string[], DexStage, string, number, number, string, 0 | 1];

export const DEX_ROWS: DexRow[] = [
${lines.join("\n")}
];
`;
  fs.writeFileSync(OUT, file);
  console.log(`Wrote ${rows.length} Pokémon to ${path.relative(process.cwd(), OUT)}`);
  const stages = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.stage]: (acc[r.stage] ?? 0) + 1 }), {});
  console.log("Stages:", stages, "· Gen 9 last:", rows[rows.length - 1].name);
}

main().catch((err) => { console.error(err); process.exit(1); });
