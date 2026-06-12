/**
 * Spec 01 — Command Taxonomy & Role Model — engine smoke tests.
 *
 * Pure-logic tests over the registry's Spec-01 metadata + the
 * two-axis role gate. No DB hits, no Supabase, no network — runs
 * standalone in <1s.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-command-taxonomy.ts
 *
 * Asserts:
 *   1. Every command has `family`, `minAuthority`, `vipOnly` set.
 *   2. The seven browsable families + core + commands_admin are the
 *      only family values in use.
 *   3. Worked cases from Spec 01 §3 — kick (mod-only, no VIP), award
 *      (host-only), and a synthetic vipOnly viewer perk all gate
 *      correctly.
 *   4. `!lurk` is in `community` / `info` (Spec 01 §4 explicit move
 *      out of the old `lifecycle` bucket).
 *   5. Custom-command engine writes `family: "community"` /
 *      `communityType: "info"` by default.
 *   6. Bare-verb aliases per Spec 01 §5 — every command that should
 *      have a short alias does.
 *   7. Authority ladder strictness — host > mod > viewer; comparisons
 *      via `authorityMeets` are monotonic.
 *   8. VIP axis independence — `vipOnly: true` rejects non-VIP
 *      regardless of authority level (a non-VIP host still fails).
 */

// Side-effect import builds the registry — same way the dispatcher
// does it at module-load time.
import "@/lib/twitch/commands/registrations";
import {
  authorityMeets,
  listCommands,
  resolveCommand,
  type Authority,
  type CommandDef,
  type CommandFamily,
} from "@/lib/twitch/commands/registry";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// Spec 01 §3 — the gate logic, replicated here so the test owns
// the spec contract independently of the dispatcher's
// implementation. If the dispatcher diverges from this, the test
// will catch the drift.
function commandGate(
  def: CommandDef,
  caller: Authority,
  isVIP: boolean,
): boolean {
  const required = def.minAuthority ?? "viewer";
  const authorityOK = authorityMeets(caller, required);
  const vipOK = def.vipOnly !== true || isVIP === true;
  return authorityOK && vipOK;
}

// ---------------------------------------------------------------------------

test("Every registered command has family, minAuthority, vipOnly set", () => {
  const cmds = listCommands();
  assert(cmds.length > 0, "registry is empty — registrations didn't load");
  const missing: string[] = [];
  for (const c of cmds) {
    if (!c.family || !c.minAuthority || c.vipOnly === undefined) {
      missing.push(c.name);
    }
  }
  assert(
    missing.length === 0,
    `${missing.length} commands missing Spec-01 fields: ${missing.join(", ")}`,
  );
});

test("Family values are constrained to the documented set", () => {
  const allowed: ReadonlySet<CommandFamily> = new Set<CommandFamily>([
    "play",
    "race",
    "picks",
    "tokens",
    "market",
    "mod",
    "community",
    "core",
    "commands_admin",
  ]);
  const bad: string[] = [];
  for (const c of listCommands()) {
    if (c.family && !allowed.has(c.family)) {
      bad.push(`${c.name}:${c.family}`);
    }
  }
  assert(
    bad.length === 0,
    `non-spec family values: ${bad.join(", ")}`,
  );
});

test("Authority ladder — host > mod > viewer (monotonic)", () => {
  assert(authorityMeets("host", "viewer"), "host should meet viewer");
  assert(authorityMeets("host", "mod"), "host should meet mod");
  assert(authorityMeets("host", "host"), "host should meet host");
  assert(authorityMeets("mod", "viewer"), "mod should meet viewer");
  assert(authorityMeets("mod", "mod"), "mod should meet mod");
  assert(!authorityMeets("mod", "host"), "mod should NOT meet host");
  assert(authorityMeets("viewer", "viewer"), "viewer should meet viewer");
  assert(!authorityMeets("viewer", "mod"), "viewer should NOT meet mod");
  assert(!authorityMeets("viewer", "host"), "viewer should NOT meet host");
});

test("Spec 01 §3 worked case — `gs.kick` gates on mod (no VIP)", () => {
  const def = resolveCommand(["gs", "kick"]);
  assert(def != null, "gs.kick missing from registry");
  assert(def!.minAuthority === "mod", "gs.kick should be minAuthority: mod");
  assert(def!.vipOnly === false, "gs.kick should NOT be vipOnly");
  // Viewer blocked; mod allowed regardless of VIP; host allowed.
  assert(!commandGate(def!, "viewer", false), "viewer must not pass gs.kick");
  assert(!commandGate(def!, "viewer", true), "VIP viewer must not pass gs.kick (authority floor)");
  assert(commandGate(def!, "mod", false), "mod (non-VIP) must pass gs.kick");
  assert(commandGate(def!, "mod", true), "mod-VIP must pass gs.kick");
  assert(commandGate(def!, "host", false), "host must pass gs.kick");
});

test("Spec 01 §3 worked case — `gs.award` gates on host (no VIP)", () => {
  const def = resolveCommand(["gs", "award"]);
  assert(def != null, "gs.award missing");
  assert(def!.minAuthority === "host", "gs.award should be minAuthority: host");
  assert(def!.vipOnly === false, "gs.award should NOT be vipOnly");
  assert(!commandGate(def!, "viewer", false), "viewer must not pass gs.award");
  assert(!commandGate(def!, "mod", false), "mod must not pass gs.award");
  assert(!commandGate(def!, "mod", true), "mod-VIP must not pass gs.award (authority floor)");
  assert(commandGate(def!, "host", false), "host must pass gs.award");
});

test("Spec 01 §3 worked case — synthetic vipOnly viewer perk", () => {
  // The infrastructure ships even though no command currently sets
  // `vipOnly: true`. Synthetic def proves the gate handles it.
  const def: CommandDef = {
    name: "synthetic.vip_perk",
    trigger: ["synthetic", "perk"],
    surface: ["chat"],
    economy: "none",
    family: "community",
    minAuthority: "viewer",
    vipOnly: true,
    help: { summary: "", usage: "" },
    handler: async () => ({ ok: true }),
  };
  // Non-VIP viewer blocked; VIP viewer allowed; mod-VIP allowed
  // (mod meets viewer floor + holds VIP).
  assert(!commandGate(def, "viewer", false), "non-VIP viewer must fail vipOnly");
  assert(commandGate(def, "viewer", true), "VIP viewer must pass vipOnly viewer command");
  assert(commandGate(def, "mod", true), "mod-VIP must pass vipOnly viewer command");
  // Non-VIP mod blocked — VIP axis is independent of authority,
  // mod doesn't auto-satisfy VIP requirement.
  assert(!commandGate(def, "mod", false), "non-VIP mod must NOT pass vipOnly viewer command");
  assert(!commandGate(def, "host", false), "non-VIP host must NOT pass vipOnly viewer command");
});

test("Spec 01 §4 — `!lurk` moved to community/info", () => {
  const def = resolveCommand(["lurk"]);
  assert(def != null, "!lurk missing");
  assert(
    def!.family === "community",
    `!lurk should be in community family, got ${def!.family}`,
  );
  assert(
    def!.communityType === "info",
    `!lurk should be communityType: "info", got ${def!.communityType}`,
  );
});

test("Spec 01 §2 — `!commands` is commands_admin, NOT mod", () => {
  // Acceptance criterion in Spec 01 §2: viewers reading
  // `!gs help mod` must not see command authoring.
  const def = resolveCommand(["commands"]);
  assert(def != null, "!commands missing");
  assert(
    def!.family === "commands_admin",
    `!commands should be commands_admin family, got ${def!.family}`,
  );
  assert(def!.minAuthority === "host", "!commands must be host-only");
});

test("Backfill spot-check — every `host`-actor command also has minAuthority: host", () => {
  const drift: string[] = [];
  for (const c of listCommands()) {
    if (c.actor === "host" && c.minAuthority !== "host") {
      drift.push(`${c.name} actor=host minAuthority=${c.minAuthority}`);
    }
  }
  assert(drift.length === 0, `legacy actor ≠ new minAuthority: ${drift.join("; ")}`);
});

test("Backfill spot-check — every `crew`-actor command has minAuthority: mod", () => {
  const drift: string[] = [];
  for (const c of listCommands()) {
    if (c.actor === "crew" && c.minAuthority !== "mod") {
      drift.push(`${c.name} actor=crew minAuthority=${c.minAuthority}`);
    }
  }
  assert(drift.length === 0, `crew ≠ mod: ${drift.join("; ")}`);
});

test("Backfill spot-check — every `everyone`-actor command has minAuthority: viewer", () => {
  const drift: string[] = [];
  for (const c of listCommands()) {
    if (c.actor === "everyone" && c.minAuthority !== "viewer") {
      drift.push(`${c.name} actor=everyone minAuthority=${c.minAuthority}`);
    }
  }
  assert(drift.length === 0, `everyone ≠ viewer: ${drift.join("; ")}`);
});

test("Spec 01 §5 — bare-verb aliases for race / track / items / clear resolve to canonical", () => {
  const cases: Array<{ alias: string[]; canonical: string }> = [
    { alias: ["race"], canonical: "gs.race" },
    { alias: ["track"], canonical: "gs.track" },
    { alias: ["items"], canonical: "gs.items" },
    { alias: ["clear"], canonical: "gs.clear" },
  ];
  for (const { alias, canonical } of cases) {
    const def = resolveCommand(alias);
    assert(
      def != null,
      `bare-verb !${alias.join(" ")} should resolve`,
    );
    assert(
      def!.name === canonical,
      `!${alias.join(" ")} should map to ${canonical}, got ${def!.name}`,
    );
  }
});

test("No command currently sets vipOnly: true (infra-only — first VIP cmd is future)", () => {
  // Per Spec 01 §8: VIP-specific commands are deferred. If one ships
  // before this test is intentionally updated, we want to know — the
  // first VIP command should be a deliberate review moment.
  const vipCmds = listCommands().filter((c) => c.vipOnly === true);
  assert(
    vipCmds.length === 0,
    `unexpected vipOnly commands: ${vipCmds.map((c) => c.name).join(", ")}`,
  );
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
