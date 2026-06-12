/**
 * Spec 02 Fix 1 — Domain-event publisher engine smoke tests.
 *
 * Pure-logic tests over the policy table + resolver. No DB hits, no
 * Supabase, no adapters constructed — runs standalone in <1s.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-fanout-publisher.ts
 *
 * Asserts:
 *   1. DEFAULT_POLICY_TABLE has an entry for every DomainEventType
 *      (catalog/policy parity — adding a new event variant without a
 *      default would silently 500 the publisher at runtime).
 *   2. Spec 02 §4 worked cases — market_opened defaults to
 *      announce/both-platforms; lobby_joined defaults to silent;
 *      session_scheduled defaults to discord-only.
 *   3. resolvePolicy returns the default when no override exists
 *      (current state — the override stub returns null until the
 *      gs_fanout_policies migration lands).
 *   4. resolvePolicy returns a frozen object — callers can't mutate
 *      cached policy state by accident.
 *   5. Every DomainEventType has Twitch + Discord formatters, and
 *      each formatter returns a non-empty string / non-null
 *      AnnouncementContent for representative payloads.
 *   6. Lock-window helper renders sensible relative windows
 *      (in 30s / in 5m / in 2h) and falls back to a literal string
 *      when lockAt is null or malformed.
 */

import {
  DEFAULT_POLICY_TABLE,
  resolvePolicy,
  resolveStoredOverride,
} from "@/lib/events/policy";
import { FORMATTERS, lockWindow } from "@/lib/events/formatters";
import type {
  DomainEvent,
  DomainEventType,
  EventActor,
} from "@/lib/events/types";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✓ ${name}`);
      passed++;
    })
    .catch((err: unknown) => {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : err}`);
      failed++;
    });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ALL_DOMAIN_EVENT_TYPES: ReadonlyArray<DomainEventType> = [
  "lobby_joined",
  "lobby_left",
  "market_opened",
  "market_locked",
  "market_resolved",
  "bounty_opened",
  "session_scheduled",
  "session_opened",
];

const ACTOR: EventActor = {
  ownerUserId: "11111111-1111-1111-1111-111111111111",
  streamerSlug: "test-streamer",
  sessionId: "22222222-2222-2222-2222-222222222222",
};

const ACTOR_NO_SESSION: EventActor = {
  ownerUserId: "11111111-1111-1111-1111-111111111111",
  streamerSlug: "test-streamer",
  sessionId: null,
};

async function run() {
  // -------------------------------------------------------------------------
  await test("DEFAULT_POLICY_TABLE has an entry for every DomainEventType", () => {
    const missing: string[] = [];
    for (const type of ALL_DOMAIN_EVENT_TYPES) {
      if (!(type in DEFAULT_POLICY_TABLE)) {
        missing.push(type);
      }
    }
    assert(
      missing.length === 0,
      `missing default policy for: ${missing.join(", ")}`,
    );
  });

  // -------------------------------------------------------------------------
  await test("Spec 02 §4 worked case — market_opened defaults to announce both", () => {
    const policy = DEFAULT_POLICY_TABLE.market_opened;
    assert(policy.mode === "announce", `expected announce, got ${policy.mode}`);
    assert(
      policy.targets.includes("twitch") && policy.targets.includes("discord"),
      `expected twitch+discord, got ${policy.targets.join(",")}`,
    );
  });

  // -------------------------------------------------------------------------
  await test("Spec 02 §4 worked case — lobby_joined defaults to silent", () => {
    const policy = DEFAULT_POLICY_TABLE.lobby_joined;
    assert(policy.mode === "silent", `expected silent, got ${policy.mode}`);
    assert(
      policy.targets.length === 0,
      `expected empty targets, got ${policy.targets.join(",")}`,
    );
  });

  // -------------------------------------------------------------------------
  await test("Spec 02 §5 worked case — session_scheduled defaults to discord-only", () => {
    const policy = DEFAULT_POLICY_TABLE.session_scheduled;
    assert(policy.mode === "announce", `expected announce, got ${policy.mode}`);
    assert(
      policy.targets.length === 1 && policy.targets[0] === "discord",
      `expected ['discord'], got ${policy.targets.join(",")}`,
    );
  });

  // -------------------------------------------------------------------------
  await test("resolveStoredOverride returns null (stub state — migration pending)", async () => {
    const result = await resolveStoredOverride(ACTOR.ownerUserId, "market_opened");
    assert(
      result === null,
      "override stub should return null until gs_fanout_policies ships",
    );
  });

  // -------------------------------------------------------------------------
  await test("resolvePolicy returns the default when no override exists", async () => {
    const event: DomainEvent = {
      type: "market_opened",
      actor: ACTOR,
      payload: {
        marketId: "m-1",
        question: "Test?",
        outcomes: [
          { key: "yes", label: "Yes" },
          { key: "no", label: "No" },
        ],
        lockAt: null,
      },
    };
    const policy = await resolvePolicy(event);
    assert(policy.mode === "announce", "mode should match default");
    assert(
      policy.targets.includes("twitch") && policy.targets.includes("discord"),
      "targets should match default",
    );
  });

  // -------------------------------------------------------------------------
  await test("resolvePolicy returns a frozen object", async () => {
    const event: DomainEvent = {
      type: "lobby_joined",
      actor: ACTOR,
      payload: {
        participant: { platformUserId: "1", displayName: "n", source: "twitch" },
        lobbySize: 1,
      },
    };
    const policy = await resolvePolicy(event);
    assert(Object.isFrozen(policy), "policy object should be frozen");
    assert(
      Object.isFrozen(policy.targets),
      "targets array should be frozen",
    );
    // Mutating a frozen object in strict mode throws. Verify the
    // protection actually catches a write attempt.
    let threw = false;
    try {
      (policy as { mode: string }).mode = "silent";
    } catch {
      threw = true;
    }
    assert(threw, "mutating frozen policy.mode should throw in strict mode");
  });

  // -------------------------------------------------------------------------
  await test("Every event type defaults to a valid (mode, targets) pair", () => {
    const broken: string[] = [];
    for (const type of ALL_DOMAIN_EVENT_TYPES) {
      const p = DEFAULT_POLICY_TABLE[type];
      if (p.mode !== "announce" && p.mode !== "silent") {
        broken.push(`${type}: invalid mode "${p.mode}"`);
      }
      for (const t of p.targets) {
        if (t !== "twitch" && t !== "discord" && t !== "youtube" && t !== "kick") {
          broken.push(`${type}: invalid platform "${t}"`);
        }
      }
      if (p.mode === "silent" && p.targets.length > 0) {
        broken.push(
          `${type}: silent mode with non-empty targets ${p.targets.join(",")} is suspicious — silent should produce no chat output regardless`,
        );
      }
    }
    assert(broken.length === 0, `policy issues: ${broken.join("; ")}`);
  });

  // -------------------------------------------------------------------------
  await test("Account-level events use actor without sessionId", () => {
    // session_scheduled fires before the session row exists. The
    // engine should accept actor.sessionId === null for it.
    const event: DomainEvent = {
      type: "session_scheduled",
      actor: ACTOR_NO_SESSION,
      payload: {
        startAt: new Date(Date.now() + 3600_000).toISOString(),
        openMode: "auto_open",
        description: "Friday night MK8DX",
      },
    };
    // Resolution doesn't require a session id — the policy table key
    // is the event type, nothing else.
    assert(
      event.actor.sessionId === null,
      "test fixture should reflect session-less event",
    );
    const policy = DEFAULT_POLICY_TABLE[event.type];
    assert(
      policy.targets.includes("discord"),
      "session_scheduled should at least try Discord",
    );
  });

  // -------------------------------------------------------------------------
  await test("Formatters produce non-empty Twitch + Discord output for every event type", () => {
    const fixtures: Record<DomainEventType, DomainEvent> = {
      lobby_joined: {
        type: "lobby_joined",
        actor: ACTOR,
        payload: {
          participant: { platformUserId: "1", displayName: "Alice", source: "twitch" },
          lobbySize: 3,
        },
      },
      lobby_left: {
        type: "lobby_left",
        actor: ACTOR,
        payload: {
          participant: { platformUserId: "1", displayName: "Alice", source: "twitch" },
          lobbySize: 2,
          reason: "voluntary",
        },
      },
      market_opened: {
        type: "market_opened",
        actor: ACTOR,
        payload: {
          marketId: "m-1",
          question: "Will Britton finish 1st?",
          outcomes: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
          lockAt: new Date(Date.now() + 180_000).toISOString(),
        },
      },
      market_locked: {
        type: "market_locked",
        actor: ACTOR,
        payload: { marketId: "m-1", question: "Will Britton finish 1st?", totalStaked: 5_000 },
      },
      market_resolved: {
        type: "market_resolved",
        actor: ACTOR,
        payload: {
          marketId: "m-1",
          question: "Will Britton finish 1st?",
          winningOutcomeKey: "yes",
          winningOutcomeLabel: "Yes",
          payoutTotal: 4_800,
          payoutCount: 12,
        },
      },
      bounty_opened: {
        type: "bounty_opened",
        actor: ACTOR,
        payload: { bountyId: "b-1", amount: 1_000, description: "First to lap" },
      },
      session_scheduled: {
        type: "session_scheduled",
        actor: ACTOR_NO_SESSION,
        payload: {
          startAt: new Date(Date.now() + 86_400_000).toISOString(),
          openMode: "auto_open",
          description: "Friday night MK8DX",
        },
      },
      session_opened: {
        type: "session_opened",
        actor: ACTOR,
        payload: { randomizerSlug: "mario-kart-world", via: "manual" },
      },
    };
    const issues: string[] = [];
    for (const type of ALL_DOMAIN_EVENT_TYPES) {
      const fmt = FORMATTERS[type];
      const ev = fixtures[type];
      // Indexing into the discriminated union map requires a per-call
      // narrowing assertion — the TypeScript inference doesn't carry
      // type information from `type` into `fmt`. Cast to `never`
      // matches the publisher's own call site.
      const twitch = (fmt.twitch as (e: never) => string | null)(ev as never);
      const discord = (
        fmt.discord as (e: never) => { title: string } | null
      )(ev as never);
      if (typeof twitch !== "string" || twitch.length === 0) {
        issues.push(`${type}: twitch formatter returned ${JSON.stringify(twitch)}`);
      }
      if (!discord || typeof discord.title !== "string" || discord.title.length === 0) {
        issues.push(`${type}: discord formatter returned ${JSON.stringify(discord)}`);
      }
    }
    assert(issues.length === 0, issues.join("; "));
  });

  // -------------------------------------------------------------------------
  await test("Lock-window helper renders sensible relative spans", () => {
    const near = new Date(Date.now() + 30_000).toISOString();
    const mid = new Date(Date.now() + 5 * 60_000).toISOString();
    const far = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    assert(lockWindow(near).includes("s"), `expected seconds, got "${lockWindow(near)}"`);
    assert(lockWindow(mid).includes("m"), `expected minutes, got "${lockWindow(mid)}"`);
    assert(lockWindow(far).includes("h"), `expected hours, got "${lockWindow(far)}"`);
    assert(lockWindow(null) === "locks on host signal", "null lockAt should fall back");
    assert(lockWindow("not-a-date") === "locks on host signal", "malformed lockAt should fall back");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
