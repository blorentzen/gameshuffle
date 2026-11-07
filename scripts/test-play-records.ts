/**
 * The player card's records (src/lib/profile/playRecords.ts): one record per game, facts in the right record, the
 * dailies last, games with nothing to show as covers. Run: npx tsx scripts/test-play-records.ts
 */

import { playRecords, type PlayInput } from "../src/lib/profile/playRecords";

let pass = 0, fail = 0;
function ok(cond: unknown, msg: string) {
  if (cond) pass++;
  else { fail++; console.log("FAIL", msg); }
}

const base: PlayInput = {
  username: "pv_kai", displayName: "Kai", nowPlaying: null, favorites: [],
  lounge: null, times: [], crews: [], road: null, dailies: [], weekly: null, spaceOpen: () => false,
};

// Mario Kart 8 Deluxe: lounge, times and a crew make one record.
{
  const { records, also } = playRecords({
    ...base,
    favorites: ["Mario Kart 8 Deluxe", "Mario Kart World"],
    lounge: { name: "Daybreak", game: "mk8dx", mmr: 8299, division: "Platinum 1", medal: "/m.png" },
    times: [{ game: "mk8dx", place: 1 }, { game: "mk8dx", place: 1 }, { game: "mk8dx", place: 4 }],
    crews: [{ name: "Tuesday Cup", slug: "tuesday-cup", game: "mario-kart-8-deluxe" }],
  });
  ok(records.length === 1 && records[0].key === "mario-kart-8-deluxe", "one record for MK8DX");
  ok(records[0].name === "Mario Kart 8 Deluxe", "named by the catalog");
  ok(records[0].facts.map((f) => f.text).join(" | ") === "Platinum 1 · 8,299 | 2 track records | Tuesday Cup crew", `facts in order (${records[0].facts.map((f) => f.text).join(" | ")})`);
  ok(records[0].facts[0].href === "/lounge/Daybreak?game=mk8dx", "the lounge fact opens the lounge page");
  ok(records[0].facts[1].href === "/time-trials/players/pv_kai", "times open their times page");
  ok(records[0].space === null, "no space link while it's closed");
  ok(also.length === 1 && also[0] === "Mario Kart World", `World with nothing to show is a cover (${also.join(", ")})`);
}

// World's lounge codes and a crew stored by slug both land on Mario Kart World.
{
  const { records } = playRecords({
    ...base,
    lounge: { name: "Kevo", game: "mkworld12p", mmr: 15618, division: "Grandmaster", medal: null },
    crews: [{ name: "Night Racers", slug: "night", game: "mario-kart-world" }],
    times: [{ game: "mkworld", place: 3 }],
  });
  ok(records.length === 1 && records[0].key === "mario-kart-world", "12-player lounge and a World crew are one World record");
  ok(records[0].facts.some((f) => f.text === "1 track timed"), "a track without a record says timed");
}

// Pokémon: every Pokémon game is one record, and Trainer Road lands there.
{
  const { records, also } = playRecords({
    ...base,
    favorites: ["Pokémon Scarlet & Violet", "Pokémon TCG"],
    road: { badges: 5, regionsCleared: 0, champion: false },
  });
  ok(records.length === 1 && records[0].key === "pokemon" && records[0].name === "Pokémon", "one Pokémon record");
  ok(records[0].facts[0].text === "Trainer Road: 5 badges", `road fact (${records[0].facts[0]?.text})`);
  ok(also.length === 0, `Pokémon games aren't repeated as covers (${also.join(", ")})`);
  const champ = playRecords({ ...base, road: { badges: 40, regionsCleared: 3, champion: true } });
  ok(champ.records[0].facts[0].text === "Trainer Road champion", "a champion says so");
}

// The dailies come last; streaks before days played; three at most.
{
  const { records } = playRecords({
    ...base,
    lounge: { name: "Kai", game: "mk8dx", mmr: 5000, division: "Gold 1", medal: null },
    dailies: [
      { name: "Shuffle", href: "/daily", streak: 12, played: 40 },
      { name: "Dex", href: "/daily-dex", streak: 1, played: 3 },
      { name: "Fire Round", href: "/daily-trivia", streak: 0, played: 0 },
      { name: "Duel", href: "/daily-duel", streak: 4, played: 9 },
    ],
    weekly: { played: 6, topTen: 2 },
  });
  const d = records[records.length - 1];
  ok(d.key === "dailies" && records[0].key === "mario-kart-8-deluxe", "dailies after the games");
  ok(d.facts.map((f) => f.text).join(" | ") === "12-day Shuffle streak | 4-day Duel streak | Dex: 3 days played", `dailies facts (${d.facts.map((f) => f.text).join(" | ")})`);
  const onlyOne = playRecords({ ...base, dailies: [{ name: "Shuffle", href: "/daily", streak: 0, played: 1 }], weekly: { played: 2, topTen: 1 } });
  ok(onlyOne.records[0].facts[1]?.text === "Weekly top 10 once", "the Weekly fills a free place");
}

// Order follows what they're playing now, then their games; space links once open.
{
  const { records } = playRecords({
    ...base,
    nowPlaying: "Mario Kart World",
    favorites: ["Mario Kart 8 Deluxe"],
    times: [{ game: "mk8dx", place: 2 }, { game: "mkworld", place: 5 }],
    spaceOpen: (k) => k === "mario-kart-8-deluxe",
  });
  ok(records.map((r) => r.key).join(",") === "mario-kart-world,mario-kart-8-deluxe", "what they're playing comes first");
  ok(records[1].space?.label === "Kai in Mario Kart 8 Deluxe" && records[1].space?.href === "/games/mario-kart-8-deluxe", "an open space is linked by name");
  ok(records[0].space === null, "a closed one isn't");
}

// Nothing to show: no records, games as covers, no repeats; a nameless game is kept as typed.
{
  const { records, also } = playRecords({ ...base, nowPlaying: "Catan", favorites: ["Catan", "Some Indie Game"] });
  ok(records.length === 0 && also.join(",") === "Catan,Some Indie Game", `covers only (${also.join(",")})`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
