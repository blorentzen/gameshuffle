// Name every Pokémon rules (src/lib/pokemon/nameQuiz.ts).
//   npx tsx scripts/test-name-quiz.ts
import { ALL_POKEMON } from "../src/lib/pokemon/generator";
import { clockSeconds, endGame, nameIt, newGame, quizMatcher, readGame, secondsLeft, setPool, standardMinutes, waitsForMore, QUIZ_SETS } from "../src/lib/pokemon/nameQuiz";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; if (fail < 30) console.error("✗", what); } };
const m = quizMatcher();

// Every Pokémon is named by its own name, typed plainly.
for (const p of ALL_POKEMON) {
  const hit = m.exact(p.name);
  ok(!!hit && hit.includes(p.dex), `${p.name} by its name`);
  const plain = p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  ok(!!m.exact(plain)?.includes(p.dex), `${p.name} typed as ${plain}`);
}
ok(m.exact("mr mime")?.[0] === 122 && m.exact("Mr. Mime")?.[0] === 122, "Mr. Mime");
ok(m.exact("farfetchd")?.[0] === 83 && m.exact("sirfetch'd")?.[0] === 865, "Farfetch'd and Sirfetch'd");
ok(m.exact("flabebe")?.[0] === 669 && m.exact("type null")?.[0] === 772 && m.exact("hooh")?.[0] === 250, "accents and punctuation");
ok(m.exact("porygon 2")?.[0] === 233 && m.exact("porygon z")?.[0] === 474, "Porygon2 and Porygon-Z");
ok(JSON.stringify(m.exact("nidoran")) === "[29,32]" && m.exact("nidoran female")?.[0] === 29 && m.exact("nidoran m")?.[0] === 32, "Nidoran");
ok(m.exact("pikach") === null && m.loose("pikach")?.[0] === 25, "a close spelling only counts on Enter");
ok(m.loose("charizrd")?.[0] === 6 && m.loose("bulbasuar")?.[0] === 1, "typos on Enter");
ok(m.loose("great") === null && m.loose("iron") === null, "one word of a two-word name isn't enough");
ok(m.loose("hello") === null && m.loose("") === null, "not a Pokémon");

// The game.
let g = newGame("1", "standard", 1_000_000);
ok(clockSeconds("all", "standard") === 900 && clockSeconds("1", "standard") === 480 && clockSeconds("all", "long") === 1800 && clockSeconds("all", "none") === null, "clocks");
ok(QUIZ_SETS.every((s) => standardMinutes(s) >= 3), "every set has a clock");
let r = nameIt(g, m.exact("pikachu")); g = r.game;
ok(r.result.kind === "named" && g.named.length === 1, "named");
r = nameIt(g, m.exact("pikachu"));
ok(r.result.kind === "already", "already named");
r = nameIt(g, m.exact("chikorita"));
ok(r.result.kind === "other-set", "not in Gen 1");
r = nameIt(g, m.exact("nidoran")); g = r.game;
r = nameIt(g, m.exact("nidoran")); g = r.game;
ok(g.named.includes(29) && g.named.includes(32), "Nidoran twice names both");
ok(waitsForMore("mew", g) && waitsForMore("porygon", newGame("all", "none")) && !waitsForMore("pikachu", g), "waits on Mew, Porygon");
ok(secondsLeft(g, 1_000_000 + 60_000) === 420, "seconds left");
const ended = endGame(g, "time", 1_000_000 + 999_000);
ok(secondsLeft(ended) === 0 && ended.endedAt === 1_000_000 + 480_000, "time's up stops at the clock");
// Name all of Gen 6 and it ends.
let h = newGame("6", "none");
for (const p of setPool("6")) h = nameIt(h, m.exact(p.name)).game;
ok(h.reason === "done" && h.named.length === setPool("6").length, "naming everyone ends it");
ok(readGame(JSON.parse(JSON.stringify(h)))?.named.length === h.named.length, "a saved game reads back");
ok(readGame({ set: "x", clock: "none", startedAt: 1, named: [] }) === null, "a bad save is ignored");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
