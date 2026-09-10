/**
 * Verifies the Flights engine (src/lib/tournaments/flights.ts).
 * Run: npx tsx scripts/test-flights.ts
 */
import {
  generateFlights,
  reportFlightRace,
  clearFlightRace,
  flightStandings,
  flightRoundComplete,
  isFlightsComplete,
  computeFlightPlacements,
  setFlightPoints,
  fillFlightRaces,
  flightTies,
  describeFlights,
  type FlightsState,
  type FlightRules,
  type RacePlacements,
} from "../src/lib/tournaments/flights";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function field(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

/** A flight's race where players finish in their seated order (1st = players[0]). */
function raceInOrder(players: string[]): RacePlacements {
  const out: RacePlacements = {};
  players.forEach((id, i) => { out[id] = i + 1; });
  return out;
}

/** Report every unreported race in every flight of every materialized round,
 *  flight seat order = finishing order, until the event completes. */
function playOut(s: FlightsState): FlightsState {
  let guard = 0;
  while (!isFlightsComplete(s) && guard++ < 500) {
    const flight = s.rounds.flatMap((r) => r).find((f) => f.races.length < s.rules.racesPerRound);
    if (!flight) break;
    s = reportFlightRace(s, flight.id, raceInOrder(flight.players));
  }
  return s;
}

function run(name: string, seeds: string[], rules: Partial<FlightRules>) {
  console.log(`\n${name} (${seeds.length} players)`);
  console.log(`  ${describeFlights(rules, seeds.length)}`);
  let s = generateFlights(seeds, rules);
  const norm = s.rules;
  // Round 0 flights never exceed flightSize.
  const bad0 = s.rounds[0].find((f) => f.players.length > norm.flightSize);
  check("round 0 flights within flightSize", !bad0, bad0 ? `${bad0.id}=${bad0.players.length}` : "");
  check("round 0 seats everyone", s.rounds[0].reduce((n, f) => n + f.players.length, 0) === seeds.length);
  check("not complete before play", !isFlightsComplete(s));
  s = playOut(s);
  check("completes after full play", isFlightsComplete(s), `rounds=${s.rounds.length}/${norm.rounds}`);
  check("all rounds materialized", s.rounds.length === norm.rounds);
  const pl = computeFlightPlacements(s);
  const ids = new Set(pl.map((x) => x.participantId));
  check("everyone placed exactly once", pl.length === seeds.length && ids.size === seeds.length, `count=${pl.length} unique=${ids.size} field=${seeds.length}`);
  // Top seed wins every race it's in -> should be champion.
  check("consistent winner tops standings", flightStandings(s)[0].participantId === "p1", `got ${flightStandings(s)[0].participantId}`);
  return s;
}

console.log("=== Flights engine ===");

run("Small field, one flight", field(8), { flightSize: 12, rounds: 3, racesPerRound: 4, reseed: "standings" });
run("Two flights, grouped reseed", field(20), { flightSize: 12, rounds: 3, racesPerRound: 4, reseed: "standings" });
run("Two flights, snake reseed", field(20), { flightSize: 12, rounds: 3, racesPerRound: 4, reseed: "snake" });
run("Big field", field(48), { flightSize: 12, rounds: 4, racesPerRound: 2, reseed: "snake" });
run("Score by round (1 race/round)", field(30), { flightSize: 12, rounds: 5, racesPerRound: 1, reseed: "standings" });

// Round gating: the next round must not materialize until the current one is
// fully reported.
console.log("\nRound gating + recompute");
{
  let s = generateFlights(field(20), { flightSize: 12, rounds: 3, racesPerRound: 2, reseed: "standings" });
  check("only round 0 materialized at start", s.rounds.length === 1);
  // Report just one race of one flight — still not enough to open round 1.
  const f0 = s.rounds[0][0];
  s = reportFlightRace(s, f0.id, raceInOrder(f0.players));
  check("round 0 incomplete keeps round 1 hidden", s.rounds.length === 1 && !flightRoundComplete(s, 0));
  // Finish round 0.
  let guard = 0;
  while (!flightRoundComplete(s, 0) && guard++ < 50) {
    const nf = s.rounds[0].find((f) => f.races.length < s.rules.racesPerRound)!;
    s = reportFlightRace(s, nf.id, raceInOrder(nf.players));
  }
  check("round 1 opens once round 0 complete", s.rounds.length === 2);

  // Editing a round-0 race re-seeds round 1 (recompute).
  const before = s.rounds[1].map((f) => f.players.join(","));
  const editFlight = s.rounds[0][0];
  s = reportFlightRace(s, editFlight.id, raceInOrder([...editFlight.players].reverse()), 0);
  const after = s.rounds[1].map((f) => f.players.join(","));
  check("editing an early race re-seeds later rounds", JSON.stringify(before) !== JSON.stringify(after) || s.rounds.length === 1);
}

// Clearing a race drops it and recomputes.
console.log("\nClear race");
{
  let s = generateFlights(field(10), { flightSize: 12, rounds: 2, racesPerRound: 3, reseed: "standings" });
  const f = s.rounds[0][0];
  s = reportFlightRace(s, f.id, raceInOrder(f.players));
  check("race recorded", (s.results[f.id]?.length ?? 0) === 1);
  s = clearFlightRace(s, f.id, 0);
  check("race cleared", (s.results[f.id]?.length ?? 0) === 0);
}

// Ties, overrides, and the "record all races" fill.
console.log("\nTies + overrides + fill");
{
  let s = generateFlights(field(4), { flightSize: 12, rounds: 1, racesPerRound: 1, reseed: "standings", scoreTable: [10, 10, 5, 1] });
  const f = s.rounds[0][0];
  s = reportFlightRace(s, f.id, { p1: 1, p2: 2, p3: 3, p4: 4 }); // p1=10, p2=10, p3=5, p4=1
  const pl = computeFlightPlacements(s);
  const place = (id: string) => pl.find((x) => x.participantId === id)!.placement;
  check("tie shares placement (p1 & p2 both 1st)", place("p1") === 1 && place("p2") === 1, `p1=${place("p1")} p2=${place("p2")}`);
  check("next distinct skips the tie (p3 = 3rd)", place("p3") === 3, `got ${place("p3")}`);
  check("flightTies reports the tied pair", flightTies(s).some((g) => g.includes("p1") && g.includes("p2")));

  s = setFlightPoints(s, "p2", 4); // override p2 below p3
  const pl2 = computeFlightPlacements(s);
  const place2 = (id: string) => pl2.find((x) => x.participantId === id)!.placement;
  check("override breaks the tie (p1 = 1st, p2 lower)", place2("p1") === 1 && place2("p2") > 1, `p1=${place2("p1")} p2=${place2("p2")}`);
  s = setFlightPoints(s, "p2", null);
  check("clearing override restores the tie", computeFlightPlacements(s).filter((x) => x.placement === 1).length === 2);
}
{
  let s = generateFlights(field(6), { flightSize: 12, rounds: 1, racesPerRound: 4, reseed: "standings" });
  const f = s.rounds[0][0];
  s = fillFlightRaces(s, f.id, raceInOrder(f.players));
  check("record-all fills every race at once", (s.results[f.id]?.length ?? 0) === 4);
  check("record-all completes the round", isFlightsComplete(s));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
