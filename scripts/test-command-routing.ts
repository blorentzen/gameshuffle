/**
 * Chat command routing: what someone types reaches the right command.
 * Covers the fixes from 2026-10-10.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-command-routing.ts
 *
 *   1. Bare two-word commands (`!party join`, `!chance vote`, `!mission done`,
 *      `!wheel add pizza`) resolve to their own command, with the rest as args.
 *   2. One-word commands with those words as args still go to the base
 *      (`!party`, `!chance help`, `!poll Next? | a | b`).
 *   3. `!a`, `!answer`, `!cb ask 60`, `!chatbrain`, `!whosaid reveal` resolve.
 *   4. `!gs …` paths still resolve (and fall back) as before.
 *   5. Mods can run the overlay tool commands (actor no longer host-only).
 *   5b/5c. Every usage line routes to its command; every built-in has a guide entry.
 *   6. Custom commands are per channel: two channels with `!socials` each
 *      get their own, and one channel never sees another's.
 *   7. The speedrun commands (`!pb`, `!pace`, `!splits`) route, and a channel's
 *      own custom `!pb` answers instead of ours (yieldToCustom).
 *   8. The level queue's `!add`, `!position`, `!remove` and `!level` route, and step aside for a channel's own.
 */

import "@/lib/twitch/commands/registrations";
import { parseCommand } from "@/lib/twitch/commands/parse";
import { listCommands, resolveTypedCommand, tierMeets, authorityMeets } from "@/lib/twitch/commands/registry";
import { resolveCustomCommand, setCustomCommandTable, type CustomCommandRow } from "@/lib/twitch/commands/customCommands";
import { COMMAND_GUIDE } from "@/lib/twitch/commands/guide";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`✓ ${label}`); } else { fail++; console.log(`✗ ${label}${extra ? `  (${extra})` : ""}`); }
}
function route(text: string) {
  const parsed = parseCommand(text);
  if (!parsed) return { name: null as string | null, args: "" };
  const r = resolveTypedCommand(parsed.path, parsed.args);
  return { name: r.def?.name ?? null, args: r.args };
}
function expect(text: string, name: string, args?: string) {
  const r = route(text);
  check(`${text} → ${name}${args !== undefined ? ` [${args}]` : ""}`, r.name === name && (args === undefined || r.args === args), `got ${r.name} [${r.args}]`);
}

// 1
expect("!party join", "party.join", "");
expect("!chance vote help", "chance.vote", "help");
expect("!mission done @kartkev", "mission.done", "@kartkev");
expect("!wheel add pizza night", "wheel.add", "pizza night");
expect("!wheel remove pizza", "wheel.remove", "pizza");
// 2
expect("!party", "party", "");
expect("!chance help @kartkev", "chance", "help @kartkev");
expect("!mission @kartkev", "mission", "@kartkev");
expect("!poll Next game? | Kart | Smash", "poll");
// 3
expect("!a mario kart", "a", "mario kart");
expect("!answer pizza", "a", "pizza");
expect("!cb ask 60", "cb", "ask 60");
expect("!chatbrain", "cb", "");
expect("!whosaid reveal", "whosaid", "reveal");
// 4
expect("!gs join", "gs.join");
expect("!gs-shuffle tank", "gs.shuffle", "tank");
expect("!gs resolve win", "gs.resolve", "win");
expect("!gs", "gs");

// 5 Mods (crew tier / mod authority) can run tool commands.
for (const text of ["!spin", "!gs-dice 2", "!gs-flip", "!draw 1", "!gs-timer 5m", "!gs-tier new", "!wheel clear"]) {
  const parsed = parseCommand(text)!;
  const def = resolveTypedCommand(parsed.path, parsed.args).def;
  check(`a mod can run ${text}`, !!def && (!def.actor || tierMeets("crew", def.actor)) && authorityMeets("mod", def.minAuthority ?? "viewer"), def ? `actor ${def.actor} / ${def.minAuthority}` : "not found");
}

// 5b Every command's own usage line routes back to it (catches help that
// tells streamers to type something that doesn't work, like `!draw` did).
for (const def of listCommands()) {
  const first = def.help.usage.split(/\s+·\s+/)[0].replace(/^mods:\s*/, "");
  const typed = first.replace(/\s*[<[].*$/, "").trim(); // drop <args> / [args]
  const r = route(typed);
  check(`usage "${typed}" reaches ${def.name}`, r.name === def.name, `got ${r.name}`);
}

// 5c Every built-in has a guide entry (group, needs, example) for the Commands pages.
const missingGuide = listCommands().map((d) => d.name).filter((n) => !COMMAND_GUIDE[n]);
check("every built-in has a Commands-page guide entry", missingGuide.length === 0, missingGuide.join(", "));

// 6 Custom commands per channel.
const row = (community: string, trigger: string, text: string): CustomCommandRow => ({
  id: `${community}-${trigger}`, community_id: community, trigger, response_tmpl: text, actor: "everyone", cooldown_s: 5, enabled: true, use_count: 0,
});
let threw = false;
try {
  setCustomCommandTable("chan-a", [row("chan-a", "!socials", "A's links")]);
  setCustomCommandTable("chan-b", [row("chan-b", "!socials", "B's links"), row("chan-b", "!rules", "B's rules")]);
} catch { threw = true; }
check("two channels can both have !socials", !threw);
check("channel A gets its own !socials", resolveCustomCommand("chan-a", ["socials"])?.name === "cc:chan-a:!socials" || resolveCustomCommand("chan-a", ["socials"])?.name?.startsWith("cc:chan-a:") === true);
check("channel B gets its own !socials", resolveCustomCommand("chan-b", ["socials"])?.name?.startsWith("cc:chan-b:") === true);
check("channel A doesn't see B's !rules", resolveCustomCommand("chan-a", ["rules"]) === null);
check("custom commands stay out of the built-in lookup", route("!socials").name === null);
setCustomCommandTable("chan-b", [row("chan-b", "!rules", "B's rules")]);
check("a removed command drops out of its channel", resolveCustomCommand("chan-b", ["socials"]) === null);

// 7 Speedrun commands, and stepping aside for a channel's own !pb.
expect("!pb", "pb", "");
expect("!pace", "pace", "");
expect("!splits", "splits", "");
const speedrunDefs = ["pb", "pace", "splits"].map((n) => listCommands().find((d) => d.name === n));
check("the speedrun commands step aside for a channel's own", speedrunDefs.every((d) => d?.yieldToCustom === true));
check("other built-ins still win a clash", listCommands().filter((d) => d.yieldToCustom).map((d) => d.name).sort().join(",") === "add,level,pace,pb,position,remove,splits");
setCustomCommandTable("chan-c", [row("chan-c", "!pb", "My PB is on speedrun.com")]);
// The dispatcher's order: a yielding built-in gives way to the channel's own command of the same name.
const pick = (community: string, text: string) => {
  const parsed = parseCommand(text)!;
  let def = resolveTypedCommand(parsed.path, parsed.args).def;
  if (def?.yieldToCustom) def = resolveCustomCommand(community, parsed.path) ?? def;
  return def?.name ?? null;
};
check("a channel's own !pb answers instead of ours", pick("chan-c", "!pb")?.startsWith("cc:chan-c:") === true, String(pick("chan-c", "!pb")));
check("a channel without its own !pb gets ours", pick("chan-a", "!pb") === "pb");
check("!pace still ours where only !pb is custom", pick("chan-c", "!pace") === "pace");

// 8 The level queue (levels picks 2026-11-11): viewers' !add, !position, !remove; mods' !level; each steps aside for a
// channel's own command of the same name, and !wheel add / remove keep their own.
expect("!add 2J5-3K2-Y9G", "add", "2J5-3K2-Y9G");
expect("!add 2J5 3K2 Y9G", "add", "2J5 3K2 Y9G");
expect("!position", "position", "");
expect("!remove", "remove", "");
expect("!remove @kartkev", "remove", "@kartkev");
expect("!level next", "level", "next");
expect("!level next cleared", "level", "next cleared");
expect("!level random", "level", "random");
expect("!level skip", "level", "skip");
expect("!level open", "level", "open");
expect("!level close", "level", "close");
expect("!level clear", "level", "clear");
expect("!wheel add pizza", "wheel.add", "pizza");
expect("!wheel remove pizza", "wheel.remove", "pizza");
const levelDefs = ["add", "position", "remove", "level"].map((n) => listCommands().find((d) => d.name === n));
check("viewers can !add, !position and !remove", levelDefs.slice(0, 3).every((d) => d && authorityMeets("viewer", d.minAuthority ?? "viewer")));
check("only mods and the streamer run !level", !!levelDefs[3] && !authorityMeets("viewer", levelDefs[3].minAuthority ?? "viewer") && authorityMeets("mod", levelDefs[3].minAuthority ?? "viewer"));
setCustomCommandTable("chan-d", [row("chan-d", "!add", "Use the other bot's queue")]);
check("a channel's own !add answers instead of ours", pick("chan-d", "!add 2J5-3K2-Y9G")?.startsWith("cc:chan-d:") === true, String(pick("chan-d", "!add 2J5-3K2-Y9G")));
check("a channel without its own !add gets ours", pick("chan-a", "!add 2J5-3K2-Y9G") === "add");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
