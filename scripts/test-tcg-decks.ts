/**
 * Pure tests for TCG deck lists (src/lib/tcg/deckList.ts): reading pasted
 * lists, set codes, the Standard checks, the TCG Live export, and every deck
 * guide in content/decks reading as a full 60-card list.
 * Run: npx tsx scripts/test-tcg-decks.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  basicEnergyType, cardIdFor, checkDeck, exportDeckText, nameKey, parseDeckText, parseGuideTables, sectionTotals,
  type DeckCardInfo, type DeckLine,
} from "../src/lib/tcg/deckList";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const TCG_LIVE = `Pokémon: 12
4 Pikachu ex ASC 57
3 Raichu PFL 32
2 Raichu PFL 32
3 Fezandipiti ex SFA 38

Trainer: 36
4 Ultra Ball ASC 213
4 Professor's Research SVI 189
4 Boss’s Orders PAL 172
4 Nest Ball SVI 181
4 Rare Candy SVI 191
4 Iono PAL 185
4 Earthen Vessel PAR 163
4 Super Rod PAL 188
3 Switch SVI 194
1 Prime Catcher TEF 157

Energy: 12
8 Basic {L} Energy SVE 4
4 Lightning Energy

Total Cards: 60`;

test("reads a Pokémon TCG Live export", () => {
  const { lines, skipped } = parseDeckText(TCG_LIVE);
  assert.deepEqual(skipped, []);
  const t = sectionTotals(lines);
  assert.deepEqual(t, { pokemon: 12, trainer: 36, energy: 12, all: 60 });
  // The same card twice adds up; both basic Energy spellings are one card.
  assert.equal(lines.find((l) => l.name === "Raichu")!.count, 5);
  const energy = lines.filter((l) => l.section === "energy");
  assert.equal(energy.length, 1);
  assert.equal(energy[0].name, "Basic Lightning Energy");
  assert.equal(energy[0].count, 12);
  assert.equal(energy[0].cardId, null);
  // Curly apostrophes come out straight.
  assert.ok(lines.some((l) => l.name === "Boss's Orders"));
  assert.equal(lines.find((l) => l.name === "Pikachu ex")!.cardId, "me2pt5-57");
});

test("reads Limitless-style lines, bullets and no headers", () => {
  const { lines, skipped } = parseDeckText("* 4x Ultra Ball MEG 131\n2 Iono\n1 Pikachu ex ASC 057\nnot a card line\n");
  assert.deepEqual(skipped, ["not a card line"]);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].count, 4);
  assert.equal(lines[0].cardId, "me1-131");
  assert.equal(lines[1].set, null);
  assert.equal(lines[1].section, "trainer");
  assert.equal(lines[2].cardId, "me2pt5-57", "leading zeros drop");
});

test("set codes and basic Energy names", () => {
  assert.equal(cardIdFor("dri", "102"), "sv10-102");
  assert.equal(cardIdFor("BLK", "1"), "zsv10pt5-1");
  assert.equal(cardIdFor("XYZ", "1"), null);
  assert.equal(cardIdFor(null, "1"), null);
  assert.equal(basicEnergyType("Basic {P} Energy"), "Psychic");
  assert.equal(basicEnergyType("darkness energy"), "Darkness");
  assert.equal(basicEnergyType("Double Turbo Energy"), null);
  assert.equal(nameKey("Pokémon Catcher"), nameKey("pokemon catcher"));
});

const info = (o: Partial<DeckCardInfo>): DeckCardInfo => ({ supertype: "Trainer", subtypes: null, rarity: null, mark: "I", ...o });
const line = (count: number, name: string, cardId: string | null, section: DeckLine["section"] = "trainer"): DeckLine =>
  ({ count, name, set: null, number: null, section, cardId });

test("a clean 60 passes every check", () => {
  const lines = [
    line(4, "Pikachu ex", "a", "pokemon"),
    line(4, "Ultra Ball", "b"),
    line(1, "Prime Catcher", "c"),
    line(39, "Basic Lightning Energy", null, "energy"),
    line(12, "Basic Fire Energy", null, "energy"),
  ];
  const m = new Map([
    ["a", info({ supertype: "Pokémon", subtypes: ["Basic", "ex"] })],
    ["b", info({})],
    ["c", info({ subtypes: ["Item", "ACE SPEC"] })],
  ]);
  const r = checkDeck(lines, m);
  assert.ok(r.legal, JSON.stringify(r.checks));
  assert.equal(r.unchecked, 0);
  assert.ok(r.checks.every((c) => c.level === "ok"));
});

test("size, copies, ACE SPEC, Basic Pokémon and marks", () => {
  const lines = [
    line(3, "Raichu", "a", "pokemon"),
    line(2, "Raichu", "a2", "pokemon"),
    line(1, "Prime Catcher", "c"),
    line(1, "Maximum Belt", "d"),
    line(2, "Old Card", "e"),
  ];
  const m = new Map([
    ["a", info({ supertype: "Pokémon", subtypes: ["Stage 1"] })],
    ["a2", info({ supertype: "Pokémon", subtypes: ["Stage 1"] })],
    ["c", info({ subtypes: ["ACE SPEC"] })],
    ["d", info({ rarity: "ACE SPEC Rare" })],
    ["e", info({ mark: "G" })],
  ]);
  const r = checkDeck(lines, m);
  const bad = new Set(r.checks.filter((c) => c.level === "bad").map((c) => c.id));
  assert.deepEqual([...bad].sort(), ["ace", "basic", "copies", "marks", "size"]);
  assert.equal(r.legal, false);
  assert.match(r.checks.find((c) => c.id === "copies")!.text, /5 Raichu/);
  assert.match(r.checks.find((c) => c.id === "marks")!.text, /mark G/);
});

test("a legal reprint of an old printing passes; unmatched cards ask for a hand check", () => {
  const lines = [
    line(4, "Basic Pokémon", "a", "pokemon"),
    line(4, "Switch", "s"),
    line(2, "Mystery Card", null),
    line(50, "Basic Water Energy", null, "energy"),
  ];
  const m = new Map([
    ["a", info({ supertype: "Pokémon", subtypes: ["Basic"] })],
    ["s", info({ mark: "F", legalReprint: true })],
  ]);
  const r = checkDeck(lines, m);
  assert.equal(r.checks.find((c) => c.id === "marks")!.level, "ok");
  assert.equal(r.unchecked, 2);
  assert.equal(r.legal, false, "can't call it legal until the unmatched cards are checked");
  assert.equal(r.checks.find((c) => c.id === "unchecked")!.level, "warn");
});

test("the TCG Live export reads back to the same deck", () => {
  const { lines } = parseDeckText(TCG_LIVE);
  const text = exportDeckText(lines);
  assert.match(text, /^Pokémon: 12$/m);
  assert.match(text, /^12 Basic Lightning Energy SVE 4$/m);
  assert.match(text, /^Total Cards: 60$/m);
  const again = parseDeckText(text);
  assert.deepEqual(again.skipped, []);
  assert.deepEqual(sectionTotals(again.lines), sectionTotals(lines));
  assert.deepEqual(again.lines.map((l) => [l.count, l.name, l.cardId]), lines.map((l) => [l.count, l.name, l.cardId]));
});

/** Guides whose own list doesn't add up yet (a content fix, not a parser bug). None right now. */
const KNOWN_OFF: Record<string, number> = {};

test("every deck guide reads as its full list", () => {
  const dir = path.join(process.cwd(), "content/decks");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  assert.ok(files.length > 0, "no guides found");
  for (const f of files) {
    const { content } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
    const lines = parseGuideTables(content);
    const t = sectionTotals(lines);
    // Battle Box intro decks are 40 cards on purpose; everything else is a 60.
    const expected = KNOWN_OFF[f] ?? (/\b40 cards\b/.test(content) ? 40 : 60);
    assert.equal(t.all, expected, `${f}: ${JSON.stringify(t)}`);
    assert.ok(t.pokemon > 0 && t.trainer > 0, `${f}: ${JSON.stringify(t)}`);
    assert.ok(lines.some((l) => l.set), `${f}: no set codes read`);
    if (KNOWN_OFF[f]) continue;
    // A heading's own count, "### Pokémon (17)", matches its table.
    for (const m of content.matchAll(/^#{2,4}\s*(pok[eé]mon|trainers?|energ(?:y|ies))\s*\((\d+)\)/gim)) {
      const section = m[1].toLowerCase().startsWith("pok") ? "pokemon" : m[1].toLowerCase().startsWith("energ") ? "energy" : "trainer";
      assert.equal(t[section], Number(m[2]), `${f}: ${m[0]}`);
    }
  }
});

console.log(`\n${passed} passed`);
