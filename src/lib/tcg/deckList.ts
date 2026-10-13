/**
 * Pokémon TCG deck lists (pure, client-safe): read the text Pokémon TCG Live
 * and Limitless export ("4 Pikachu ex ASC 57" under "Pokémon: 12" headers),
 * write it back out, turn set codes into catalog ids, and check a list against
 * Standard in plain words. The server (decks.ts) matches lines to catalog
 * cards; these functions only need what it found.
 */

export type DeckSection = "pokemon" | "trainer" | "energy";

/** One line of a list, as the list said it, plus the catalog card it matched. */
export interface DeckLine {
  count: number;
  name: string;
  /** Set code as written ("ASC"), or null when the line had none. */
  set: string | null;
  number: string | null;
  section: DeckSection;
  /** The catalog card (Scrydex id) it matched, or null (basic Energy, or nothing found). */
  cardId: string | null;
}

/** What the checks need to know about a matched card. */
export interface DeckCardInfo {
  supertype: string | null;
  subtypes: string[] | null;
  rarity: string | null;
  mark: string | null;
  /** An older printing with a Standard reprint (same name), so it counts as legal. */
  legalReprint?: boolean;
}

export const DECK_SIZE = 60;
export const MAX_COPIES = 4;
/** Standard regulation marks. Checked 2026-10-11 (the April 2026 rotation left H, I and J). */
export const STANDARD_MARKS = ["H", "I", "J"] as const;
export const STANDARD_CHECKED = "2026-10-11";
/** Free accounts keep this many deck lists; GS Pro as many as they like. */
export const FREE_DECK_LIMIT = 3;

/**
 * Pokémon TCG Live set codes → catalog (Scrydex) expansion ids, for every
 * Scarlet & Violet and Mega Evolution set plus the Sword & Shield sets
 * Expanded lists still use. A code we don't know falls back to a name match.
 */
export const SET_CODES: Record<string, string> = {
  // Mega Evolution
  MEG: "me1", PFL: "me2", ASC: "me2pt5", POR: "me3", CRI: "me4", PBL: "me5", MEP: "mep",
  // Scarlet & Violet
  SVI: "sv1", PAL: "sv2", OBF: "sv3", MEW: "sv3pt5", PAR: "sv4", PAF: "sv4pt5", TEF: "sv5", TWM: "sv6",
  SFA: "sv6pt5", SCR: "sv7", SSP: "sv8", PRE: "sv8pt5", JTG: "sv9", DRI: "sv10", BLK: "zsv10pt5", WHT: "rsv10pt5",
  SVP: "svp", SVE: "sve",
  // Sword & Shield (Expanded)
  SSH: "swsh1", RCL: "swsh2", DAA: "swsh3", VIV: "swsh4", BST: "swsh5", CRE: "swsh6", EVS: "swsh7", FST: "swsh8",
  BRS: "swsh9", ASR: "swsh10", PGO: "pgo", LOR: "swsh11", SIT: "swsh12", CRZ: "swsh12pt5", SWSHP: "swshp",
};

/** The catalog id a set code and number point to ("ASC", "57" → "me2pt5-57"), or null. */
export function cardIdFor(set: string | null, number: string | null): string | null {
  if (!set || !number) return null;
  const exp = SET_CODES[set.toUpperCase()];
  if (!exp) return null;
  const n = number.replace(/^0+(?=\d)/, "");
  return `${exp}-${n}`;
}

const ENERGY_LETTERS: Record<string, string> = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal" };
const ENERGY_TYPES = Object.values(ENERGY_LETTERS);
const BASIC_ENERGY = /^(?:basic\s+)?(?:\{([GRWLPFDM])\}|(grass|fire|water|lightning|psychic|fighting|darkness|metal))\s+energy$/i;

/** "Basic {L} Energy" / "Lightning Energy" → "Lightning"; anything else → null. */
export function basicEnergyType(name: string): string | null {
  const m = BASIC_ENERGY.exec(name.trim());
  if (!m) return null;
  if (m[1]) return ENERGY_LETTERS[m[1].toUpperCase()] ?? null;
  const t = m[2].toLowerCase();
  return ENERGY_TYPES.find((x) => x.toLowerCase() === t) ?? null;
}

/** How a name is written back out: basic Energy as "Basic Lightning Energy", curly quotes made straight. */
export function canonicalName(name: string): string {
  const energy = basicEnergyType(name);
  if (energy) return `Basic ${energy} Energy`;
  return name.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

/** Compare names the way players do: case, accents and apostrophes don't matter. */
export function nameKey(name: string): string {
  return canonicalName(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const HEADER = /^[#*\s]*(pok[eé]mon|trainers?|energ(?:y|ies))\b[\s:()-]*(\d+)?\)?\s*$/i;
const TOTAL = /^\s*total(?:\s+cards)?\s*[:=]?\s*\d+\s*$/i;
const WITH_SET = /^[*\s]*(\d{1,2})\s*x?\s+(.+?)\s+([A-Za-z][A-Za-z0-9-]{1,5})\s+([A-Za-z]{0,4}\d{1,4}[a-z]?)\s*$/;
const NAME_ONLY = /^[*\s]*(\d{1,2})\s*x?\s+(.+?)\s*$/;

function sectionOf(word: string): DeckSection {
  const w = word.toLowerCase();
  if (w.startsWith("pok")) return "pokemon";
  if (w.startsWith("energ")) return "energy";
  return "trainer";
}

export interface ParsedDeck {
  lines: DeckLine[];
  /** Lines that didn't read as a card (shown back so nothing vanishes quietly). */
  skipped: string[];
}

/**
 * Read a pasted list. Section headers set the section until the next one; a
 * line with no header before it is a trainer until the catalog says otherwise
 * (basic Energy is always energy). The same card twice adds up.
 */
export function parseDeckText(text: string): ParsedDeck {
  const lines: DeckLine[] = [];
  const skipped: string[] = [];
  let section: DeckSection | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || TOTAL.test(line)) continue;
    const header = HEADER.exec(line);
    if (header) { section = sectionOf(header[1]); continue; }
    let count = 0, name = "", set: string | null = null, number: string | null = null;
    const full = WITH_SET.exec(line);
    if (full) {
      count = Number(full[1]); name = full[2]; set = full[3].toUpperCase(); number = full[4];
    } else {
      const bare = NAME_ONLY.exec(line);
      if (!bare) { skipped.push(line); continue; }
      count = Number(bare[1]); name = bare[2];
    }
    if (!count || count > 60 || !name) { skipped.push(line); continue; }
    const energy = basicEnergyType(name);
    const entry: DeckLine = {
      count,
      name: canonicalName(name),
      set: energy ? null : set,
      number: energy ? null : number,
      section: energy ? "energy" : section ?? "trainer",
      cardId: energy ? null : cardIdFor(set, number),
    };
    const same = lines.find((l) => nameKey(l.name) === nameKey(entry.name) && l.set === entry.set && l.number === entry.number);
    if (same) same.count += entry.count;
    else lines.push(entry);
  }
  return { lines, skipped };
}

const SECTION_ORDER: DeckSection[] = ["pokemon", "trainer", "energy"];
export const SECTION_LABEL: Record<DeckSection, string> = { pokemon: "Pokémon", trainer: "Trainer", energy: "Energy" };

export function sectionTotals(lines: DeckLine[]): Record<DeckSection, number> & { all: number } {
  const t = { pokemon: 0, trainer: 0, energy: 0, all: 0 };
  for (const l of lines) { t[l.section] += l.count; t.all += l.count; }
  return t;
}

/** The list in Pokémon TCG Live's format, ready to paste into the game. */
export function exportDeckText(lines: DeckLine[]): string {
  const totals = sectionTotals(lines);
  const out: string[] = [];
  for (const section of SECTION_ORDER) {
    const rows = lines.filter((l) => l.section === section);
    if (!rows.length) continue;
    out.push(`${SECTION_LABEL[section]}: ${totals[section]}`);
    for (const l of rows) {
      const energy = basicEnergyType(l.name);
      const where = l.set && l.number ? ` ${l.set} ${l.number}` : energy ? ` SVE ${ENERGY_TYPES.indexOf(energy) + 1}` : "";
      out.push(`${l.count} ${l.name}${where}`);
    }
    out.push("");
  }
  out.push(`Total Cards: ${totals.all}`);
  return out.join("\n");
}

export type CheckLevel = "ok" | "warn" | "bad";
export interface DeckCheck { id: string; level: CheckLevel; text: string }

const isAceSpec = (c: DeckCardInfo | undefined) =>
  !!c && ((c.subtypes ?? []).some((s) => s.toLowerCase().replace(/[\s-]/g, "") === "acespec") || (c.rarity ?? "").toLowerCase().includes("ace spec"));
const isBasicPokemon = (c: DeckCardInfo | undefined) => !!c && (c.supertype ?? "").toLowerCase().startsWith("pok") && (c.subtypes ?? []).includes("Basic");

const where = (l: DeckLine) => (l.set && l.number ? ` (${l.set} ${l.number})` : "");

/**
 * Standard checks in plain words. `info` holds what the catalog knows about
 * each matched card. Lines nothing matched can't be checked, so they make the
 * result "check by hand" rather than illegal.
 */
/** What a list is checked against: Standard (regulation marks), Expanded (we don't check its card pool yet) or anything goes (counts only). */
export type DeckFormat = "standard" | "expanded" | "any";
export const DECK_FORMATS: { value: DeckFormat; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "expanded", label: "Expanded" },
  { value: "any", label: "Anything goes" },
];
export const asDeckFormat = (x: unknown): DeckFormat => (x === "expanded" || x === "any" ? x : "standard");

export function checkDeck(lines: DeckLine[], info: Map<string, DeckCardInfo>, format: DeckFormat = "standard"): { checks: DeckCheck[]; legal: boolean; unchecked: number } {
  const checks: DeckCheck[] = [];
  const total = lines.reduce((n, l) => n + l.count, 0);
  checks.push(total === DECK_SIZE
    ? { id: "size", level: "ok", text: `${DECK_SIZE} cards` }
    : { id: "size", level: "bad", text: total === 40
      ? `40 cards: fine for learning (an intro deck), but a Standard deck needs exactly ${DECK_SIZE}`
      : `${total} cards: a deck needs exactly ${DECK_SIZE}` });

  const byName = new Map<string, { name: string; count: number }>();
  for (const l of lines) {
    if (basicEnergyType(l.name)) continue;
    const k = nameKey(l.name);
    const row = byName.get(k) ?? { name: l.name, count: 0 };
    row.count += l.count;
    byName.set(k, row);
  }
  const over = [...byName.values()].filter((r) => r.count > MAX_COPIES);
  checks.push(over.length === 0
    ? { id: "copies", level: "ok", text: `No more than ${MAX_COPIES} of a name` }
    : { id: "copies", level: "bad", text: `${over.map((r) => `${r.count} ${r.name}`).join(", ")}: no more than ${MAX_COPIES} of a name (basic Energy can be any number)` });

  const ace = lines.filter((l) => l.cardId && isAceSpec(info.get(l.cardId))).reduce((n, l) => n + l.count, 0);
  checks.push(ace <= 1
    ? { id: "ace", level: "ok", text: ace === 1 ? "1 ACE SPEC" : "No ACE SPEC (up to 1 allowed)" }
    : { id: "ace", level: "bad", text: `${ace} ACE SPEC cards: only 1 allowed in a deck` });

  const matchedPokemon = lines.filter((l) => l.section === "pokemon" && l.cardId && info.has(l.cardId));
  if (matchedPokemon.length) {
    const basic = matchedPokemon.some((l) => isBasicPokemon(info.get(l.cardId!)));
    checks.push(basic
      ? { id: "basic", level: "ok", text: "At least one Basic Pokémon" }
      : { id: "basic", level: "bad", text: "No Basic Pokémon: you need at least one to start a game" });
  }

  const rotated = lines.filter((l) => {
    if (!l.cardId || basicEnergyType(l.name)) return false;
    const c = info.get(l.cardId);
    if (!c?.mark) return false;
    return !(STANDARD_MARKS as readonly string[]).includes(c.mark.toUpperCase()) && !c.legalReprint;
  });
  const marks = STANDARD_MARKS.join(", ").replace(/, (?=[^,]*$)/, " or ");
  if (format === "expanded") checks.push({ id: "pool", level: "warn", text: "Expanded: we check the counts, not the Expanded card pool, so look the list over by hand" });
  else if (format === "standard") checks.push(rotated.length === 0
    ? { id: "marks", level: "ok", text: `Every card is Standard (marks ${marks})` }
    : { id: "marks", level: "bad", text: `Not Standard any more: ${rotated.map((l) => `${l.name}${where(l)}, mark ${info.get(l.cardId!)!.mark}`).join("; ")}. Swap ${rotated.length === 1 ? "it" : "them"}, or keep the deck for Expanded.` });

  const unchecked = lines.filter((l) => !basicEnergyType(l.name) && (!l.cardId || !info.has(l.cardId))).reduce((n, l) => n + l.count, 0);
  if (unchecked) {
    const names = lines.filter((l) => !basicEnergyType(l.name) && (!l.cardId || !info.has(l.cardId))).map((l) => `${l.name}${where(l)}`);
    checks.push({ id: "unchecked", level: "warn", text: `We couldn't match ${unchecked === 1 ? "1 card" : `${unchecked} cards`} to our catalog, so check ${unchecked === 1 ? "it" : "them"} by hand: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}` });
  }

  return { checks, legal: checks.every((c) => c.level !== "bad") && unchecked === 0, unchecked };
}

/**
 * A deck guide's card tables (content/decks/*.mdx: "### Pokémon (17)" then
 * "| 4 | Cynthia's Gible | DRI 102 |" rows) as deck lines. A set cell that's a
 * note ("_reprint_", "_any set_") leaves the card to a name match.
 */
export function parseGuideTables(markdown: string): DeckLine[] {
  const text: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{2,4}\s*(pok[eé]mon|trainers?|energ(?:y|ies))\b/i.exec(line);
    if (heading) { text.push(`${sectionOf(heading[1]) === "pokemon" ? "Pokémon" : sectionOf(heading[1]) === "energy" ? "Energy" : "Trainer"}:`); continue; }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2 || !/^\d{1,2}$/.test(cells[0])) continue; // header and divider rows
    const name = cells[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
    const setCell = (cells[2] ?? "").replace(/[*`]/g, "").trim();
    const where = /^([A-Za-z][A-Za-z0-9-]{1,5})\s+([A-Za-z]{0,4}\d{1,4}[a-z]?)$/.exec(setCell);
    text.push(`${cells[0]} ${name}${where ? ` ${where[1]} ${where[2]}` : ""}`);
  }
  return parseDeckText(text.join("\n")).lines;
}
