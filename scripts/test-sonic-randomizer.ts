// Sonic Racing: CrossWorlds randomizer data and rolls (src/data/sonic/crossworlds.ts, src/lib/sonic/roll.ts).
//   npx tsx scripts/test-sonic-randomizer.ts
import { CROSSWORLDS_GAME as G } from "../src/data/sonic/crossworlds";
import { describeSonicSetup } from "../src/data/sonic";
import { cupPool, drawLoadouts, gadgetPool, machinePool, racerPool, rollGrandPrix, rollPlate, rollRaces, trackPool } from "../src/lib/sonic/roll";
import { getChatGame } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { TIER_TEMPLATES } from "../src/data/tier-templates";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; console.error("✗", what); } };
const unique = (xs: string[]) => new Set(xs).size === xs.length;

// Data
ok(G.racers.length === 58, `58 racers (${G.racers.length})`);
ok(G.racers.filter((r) => r.access === "start").length === 23, "23 racers from the start");
ok(G.racers.filter((r) => r.access === "paid").length === 20, "20 paid racers");
ok(G.racers.filter((r) => r.access === "paid").every((r) => !!r.pack), "every paid racer names its pack");
ok(G.machines.length === 73, `73 machines (${G.machines.length})`);
ok(G.machines.filter((m) => m.access === "start").length === 10, "10 machines from the start");
ok(G.machines.filter((m) => m.access === "paid").every((m) => !!m.pack), "every paid machine names its pack");
ok(G.gadgets.length === 134, `134 gadgets (${G.gadgets.length})`);
ok(G.tracks.length === 31, `31 tracks (${G.tracks.length})`);
ok(G.crossWorlds.length === 15, "15 CrossWorlds");
ok(G.cups.length === 10, "8 Grands Prix and 2 CrossOver");
ok(unique(G.racers.map((r) => r.name)), "racer names unique");
ok(unique(G.machines.map((m) => m.name)), "machine names unique");
ok(unique(G.gadgets.map((g) => g.name)), "gadget names unique");
ok(unique([...G.tracks.map((t) => t.name), ...G.crossWorlds]), "track and CrossWorld names unique");
ok(G.cups.every((c) => c.tracks.every((t) => G.tracks.some((x) => x.name === t))), "every cup track exists");
ok(G.tracks.filter((t) => !t.pack).length === 24 && G.cups.filter((c) => !c.packs).flatMap((c) => c.tracks).length === 24, "24 base tracks, all in a base Grand Prix");
const packIds = new Set(G.packs.map((p) => p.id));
ok([...G.racers, ...G.machines, ...G.tracks].every((x) => !x.pack || packIds.has(x.pack)), "every pack is listed");
ok(G.packs.every((p) => [...G.racers, ...G.machines, ...G.tracks].some((x) => x.pack === p.id)), "every pack has something in it");
ok(G.gadgets.every((g) => !g.kit || g.slots === 3), "kits take 3 slots");
ok(G.gadgets.every((g) => !/[–—]/.test(g.name)), "no dashes in gadget names");

// Pools
const def = racerPool(G);
ok(def.length === 37, `default pool: free, no supers (${def.length})`);
ok(def.every((r) => r.access !== "paid" && !r.super), "default pool has no paid racers or supers");
ok(racerPool(G, { guests: false }).every((r) => !r.guest), "guests off");
ok(racerPool(G, { supers: true }).some((r) => r.name === "Super Sonic") && !racerPool(G, { supers: true }).some((r) => r.name === "Super Shadow"), "Super Shadow needs its pack");
ok(racerPool(G, { supers: true, packs: ["super-shadow"] }).some((r) => r.name === "Super Shadow"), "Super Shadow with the pack");
ok(racerPool(G, { packs: ["tmnt"] }).filter((r) => r.pack === "tmnt").length === 4, "TMNT pack adds four");
ok(racerPool(G, { racerTypes: ["boost"] }).every((r) => r.type === "boost"), "racer type filter");
ok(racerPool(G, { racerTypes: ["boost"], guests: false }).length > 0, "a type filter never empties the pool");
ok(!racerPool(G, { newSave: true }).some((r) => r.name === "Bayonetta"), "new save leaves out Bayonetta");
ok(machinePool(G).every((m) => m.access !== "paid"), "default machines are free");
ok(machinePool(G, { newSave: true }).length === 10, "new save: ten machines");
ok(machinePool(G, { machineTypes: ["boost"] }).every((m) => m.type === "boost"), "machine type filter");
ok(gadgetPool(G, { kits: false }).every((g) => !g.kit), "kits off");
ok(trackPool(G).length === 24 && trackPool(G, ["godzilla"]).length === 25, "tracks follow packs");
ok(cupPool(G).length === 8, "8 Grands Prix without packs");
ok(cupPool(G, ["minecraft", "spongebob", "pacman"]).length === 9, "CrossOver Grand Prix 1 with all three packs");
ok(cupPool(G, ["minecraft", "spongebob"]).length === 8, "not with two of three");

// Rolls
for (const plate of G.plates) {
  for (const kits of [true, false]) {
    for (let t = 0; t < 200; t++) {
      const r = rollPlate(gadgetPool(G, { kits }), plate);
      const used = r.gadgets.reduce((n, name) => n + G.gadgets.find((g) => g.name === name)!.slots, 0);
      ok(used === plate.slots, `${plate.id} fills ${plate.slots} slots (got ${used})`);
      ok(unique([...r.gadgets, ...(r.superSlot ? [r.superSlot] : [])]), "no gadget twice");
      ok(plate.superSlot ? !!r.superSlot && G.gadgets.find((g) => g.name === r.superSlot)!.slots === 1 : r.superSlot === null, "Super Slot only on a Grand Master Plate, a 1-slot gadget");
    }
  }
}
const grand = G.plates[G.plates.length - 1];
for (let t = 0; t < 300; t++) {
  const l = drawLoadouts(def, machinePool(G), G.gadgets, grand, 12);
  ok(l.length === 12 && unique(l.map((x) => x.racer)), "12 different racers");
  ok(l.every((x) => def.some((r) => r.name === x.racer) && machinePool(G).some((m) => m.name === x.machine)), "loadouts come from the pools");
}
const small = racerPool(G, { racerTypes: ["boost"], guests: false });
const spread = drawLoadouts(small, machinePool(G), G.gadgets, grand, 4);
ok(spread.length === 4, "more players than racers still deals everyone one");
for (let t = 0; t < 100; t++) {
  const rs = rollRaces(G, { count: 12 });
  ok(rs.length === 12 && unique(rs.map((r) => r.track)), "12 races, no repeated track");
  ok(rs.every((r) => r.crossWorld && G.crossWorlds.includes(r.crossWorld)), "a CrossWorld each");
  ok(rs.every((r) => trackPool(G).includes(r.track)), "base tracks only");
  ok(rollRaces(G, { count: 3, crossWorlds: false }).every((r) => r.crossWorld === null), "CrossWorlds off");
  for (let n = 0; n < 200; n++) {
    const twelve = rollRaces(G, { count: 12 });
    ok(new Set(twelve.map((r) => r.crossWorld)).size === 12, "no CrossWorld twice in 12 races");
  }
  ok(rollRaces(G, { count: 30 }).length === 30, "more races than tracks reshuffles");
  ok(cupPool(G).includes(rollGrandPrix(G)), "Grand Prix from the base eight");
}

// Saved setups, chat, tier list
const rows = describeSonicSetup({ type: "sonic-setup", gameSlug: G.slug, plate: "grand-master", players: [{ name: "Sam", racer: "Shadow", machine: "Dark Reaper", gadgets: ["Drift Charge Kit"], superSlot: "Speed Mod" }], races: [{ track: "Apotos", crossWorld: "Sky Road" }], grandPrix: null });
ok(rows.some((r) => r.value.includes("Shadow on the Dark Reaper")), "setup describes racers");
ok(rows.some((r) => r.value.includes("Speed Mod (Super Slot)")), "setup describes the plate");
const chat = getChatGame(G.slug);
ok(!!chat, "chat game registered");
for (let t = 0; t < 100; t++) {
  const roll = chat!.roll({ owned: null, arg: "", taken: [] });
  ok(roll.slots.length === 2 && roll.text.includes(" on the "), "chat roll: racer and machine");
  ok(chat!.roll({ owned: null, arg: "power", taken: [] }).slots[1].detail !== undefined, "chat roll details");
  const typed = chat!.roll({ owned: null, arg: "boost", taken: [] });
  ok(G.racers.find((r) => r.name === typed.slots[0].name)?.type === "boost", "!gs-shuffle boost rolls a Boost racer");
}
const setup = CHAT_SETUPS[G.slug];
ok(!!setup, "chat setup registered");
ok(setup.roll({ arg: "", players: 4 }).slots.length === 4, "setup: 4 races");
ok(setup.roll({ arg: "gp", players: 4 }).slots.length === 4, "setup: a Grand Prix and its final");
ok(!setup.roll({ arg: "8", players: 4 }).title!.includes(": "), "setup title has no colon");
const tier = TIER_TEMPLATES.find((t) => t.slug === "sonic-racing-crossworlds-racers");
ok(!!tier && tier.items.length === 58 && unique(tier.items.map((i) => i.label)), "tier list: 58 unique racers");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
