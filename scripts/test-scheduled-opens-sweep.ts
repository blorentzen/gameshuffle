/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Spec 02 Fix 3 — sweepScheduledOpens behavioral tests.
 *
 * Pure-logic harness for the new scheduled → open sweep. Mocks
 * Supabase + the publisher rather than running against a real DB,
 * so we can assert on:
 *
 *   1. auto_open path — sweep flips status to active AND publishes
 *      `session_opened` exactly once per due row.
 *   2. announce_only path — sweep publishes `session_announced`
 *      AND marks `feature_flags.scheduled_open_announced_at` so
 *      subsequent ticks skip the same row (idempotency).
 *   3. Already-announced session — sweep no-ops on a second tick.
 *   4. Future-scheduled session — sweep no-ops; only past
 *      scheduled_at fires.
 *   5. open_mode === null (legacy) — sweep no-ops; the existing
 *      sweepScheduledToReady path handles those rows untouched.
 *
 * The continuity guarantee from Spec 02 §6 ("go-live ATTACHES —
 * never recreates") is asserted by inspection: the sweep only
 * UPDATEs the existing row, never inserts or deletes. The recent
 * `promoteSessionToLive` (commit f30021c) carries the live-attach
 * path in webhook.ts, which is unchanged here.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-scheduled-opens-sweep.ts
 */

import { Module } from "node:module";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => Promise<void>) {
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

// ---------------------------------------------------------------------------
// Test fixture row shape
// ---------------------------------------------------------------------------

interface FakeRow {
  id: string;
  owner_user_id: string;
  scheduled_at: string;
  open_mode: "announce_only" | "auto_open" | null;
  status: "scheduled" | "active";
  feature_flags: Record<string, unknown> | null;
  platforms: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
}

// Captured publisher calls + transition calls per run.
interface RunRecord {
  published: Array<{ type: string; sessionId: string }>;
  transitioned: Array<{ id: string; to: string; via: string }>;
  rowUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

function installMocks(rows: FakeRow[]): RunRecord {
  const record: RunRecord = {
    published: [],
    transitioned: [],
    rowUpdates: [],
  };

  // Patch require cache so the sweep's imports return our stubs.
  // (`Module._resolveFilename` reference kept as a hook for future
  // path rewriting if we need to mock deeper.)
  const originalResolve = (Module as unknown as { _resolveFilename: unknown })
    ._resolveFilename;
  void originalResolve;

  // Stub the admin client. The query builder is BOTH chainable and
  // thenable — `update().eq()` then `await` yields {error:null}, and
  // `select().eq()...not()` then `await` yields {data, error:null}.
  // The mode is determined by whether `update()` was called in the
  // chain.
  const mockClient = {
    from(_table: string) {
      const state: {
        filters: Record<string, unknown>;
        isNotNullChecks: string[];
        mode: "select" | "update";
        pendingPatch: Record<string, unknown> | null;
      } = {
        filters: {},
        isNotNullChecks: [],
        mode: "select",
        pendingPatch: null,
      };
      const builder = {
        select(_cols?: string) {
          state.mode = "select";
          return builder;
        },
        eq(col: string, val: unknown) {
          state.filters[col] = val;
          return builder;
        },
        not(col: string, _op: string, val: unknown) {
          if (val === null) state.isNotNullChecks.push(col);
          return builder;
        },
        update(patch: Record<string, unknown>) {
          state.mode = "update";
          state.pendingPatch = patch;
          return builder;
        },
        then(
          resolve: (v: {
            data: FakeRow[] | null;
            error: null;
          }) => void,
        ) {
          if (state.mode === "update" && state.pendingPatch) {
            const id = String(state.filters.id);
            record.rowUpdates.push({ id, patch: state.pendingPatch });
            const row = rows.find((r) => r.id === id);
            if (row) {
              for (const [k, v] of Object.entries(state.pendingPatch)) {
                (row as unknown as Record<string, unknown>)[k] = v;
              }
            }
            resolve({ data: null, error: null });
            return;
          }
          const filtered = rows.filter((r) => {
            for (const [col, val] of Object.entries(state.filters)) {
              if ((r as unknown as Record<string, unknown>)[col] !== val) {
                return false;
              }
            }
            for (const col of state.isNotNullChecks) {
              if ((r as unknown as Record<string, unknown>)[col] == null) {
                return false;
              }
            }
            return true;
          });
          resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },
  };

  // Stub the `createServiceClient` import.
  const supabaseAdminPath = require.resolve("@/lib/supabase/admin");
  require.cache[supabaseAdminPath] = {
    id: supabaseAdminPath,
    filename: supabaseAdminPath,
    loaded: true,
    children: [],
    paths: [],
    exports: {
      createServiceClient: () => mockClient,
    },
  } as unknown as NodeJS.Module;

  // Stub the publisher.
  const publisherPath = require.resolve("@/lib/events/publisher");
  require.cache[publisherPath] = {
    id: publisherPath,
    filename: publisherPath,
    loaded: true,
    children: [],
    paths: [],
    exports: {
      publishDomainEvent: async (event: { type: string; actor: { sessionId: string | null } }) => {
        record.published.push({
          type: event.type,
          sessionId: event.actor.sessionId ?? "",
        });
        return { policy: { targets: [], mode: "silent" }, legs: [] };
      },
    },
  } as unknown as NodeJS.Module;

  // Stub the session service's `transitionSessionStatus` so we
  // capture the auto_open transition without going through the
  // state machine + audit writer.
  const servicePath = require.resolve("@/lib/sessions/service");
  const realService = require(servicePath);
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    children: [],
    paths: [],
    exports: {
      ...realService,
      transitionSessionStatus: async (args: {
        id: string;
        newStatus: string;
        via: string;
      }) => {
        record.transitioned.push({
          id: args.id,
          to: args.newStatus,
          via: args.via ?? "system",
        });
        // Reflect into the in-memory row.
        const row = rows.find((r) => r.id === args.id);
        if (row) row.status = args.newStatus as FakeRow["status"];
        return {} as unknown;
      },
      recordEvent: async () => {
        /* noop */
      },
    },
  } as unknown as NodeJS.Module;

  return record;
}

function clearMocks() {
  // Drop the require-cache entries we patched so the next test gets
  // a fresh stub set.
  for (const path of [
    "@/lib/supabase/admin",
    "@/lib/events/publisher",
    "@/lib/sessions/service",
  ]) {
    try {
      delete require.cache[require.resolve(path)];
    } catch {
      /* not loaded yet — ignore */
    }
  }
  // Also drop the sweep itself so the next `require` re-binds it
  // against the new mocks.
  try {
    delete require.cache[require.resolve("@/lib/sessions/lifecycle-sweep")];
  } catch {
    /* not loaded yet */
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  await test("auto_open path — past scheduled_at → status transitions + session_opened published", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "session-auto-1",
        owner_user_id: "owner-1",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        open_mode: "auto_open",
        status: "scheduled",
        feature_flags: null,
        platforms: { streaming: { type: "twitch" } },
        config: { game: "mario-kart-world" },
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.autoOpened === 1, `expected 1 auto-open, got ${result.autoOpened}`);
    assert(
      record.transitioned.length === 1,
      `expected 1 status transition, got ${record.transitioned.length}`,
    );
    assert(
      record.transitioned[0].to === "active",
      `expected transition to "active", got "${record.transitioned[0].to}"`,
    );
    assert(
      record.transitioned[0].via === "scheduled_auto",
      `expected via "scheduled_auto", got "${record.transitioned[0].via}"`,
    );
    assert(
      record.published.length === 1,
      `expected 1 published event, got ${record.published.length}`,
    );
    assert(
      record.published[0].type === "session_opened",
      `expected session_opened, got ${record.published[0].type}`,
    );
  });

  await test("announce_only path — past scheduled_at → session_announced + idempotency mark", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "session-announce-1",
        owner_user_id: "owner-1",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        open_mode: "announce_only",
        status: "scheduled",
        feature_flags: null,
        platforms: { streaming: { type: "twitch" } },
        config: { game: "mario-kart-world" },
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.announced === 1, `expected 1 announced, got ${result.announced}`);
    assert(result.autoOpened === 0, "announce_only must NOT transition status");
    assert(
      record.transitioned.length === 0,
      "announce_only must NOT call transitionSessionStatus",
    );
    assert(
      record.published.length === 1 && record.published[0].type === "session_announced",
      `expected single session_announced, got ${JSON.stringify(record.published)}`,
    );
    // Idempotency marker should have been written to feature_flags.
    const markUpdate = record.rowUpdates.find(
      (u) => u.id === "session-announce-1" && "feature_flags" in u.patch,
    );
    assert(markUpdate != null, "expected feature_flags update writing the marker");
    const flags = markUpdate!.patch.feature_flags as Record<string, unknown>;
    assert(
      typeof flags.scheduled_open_announced_at === "string",
      `expected scheduled_open_announced_at on flags, got ${JSON.stringify(flags)}`,
    );
  });

  await test("announce_only path — second tick is a no-op (idempotency)", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "session-announce-2",
        owner_user_id: "owner-2",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        open_mode: "announce_only",
        status: "scheduled",
        // Already-announced session: feature_flags carries the
        // marker from a previous sweep tick.
        feature_flags: {
          scheduled_open_announced_at: new Date(Date.now() - 30_000).toISOString(),
        },
        platforms: null,
        config: null,
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.announced === 0, `expected 0 announced on re-tick, got ${result.announced}`);
    assert(result.autoOpened === 0, "still no auto-open");
    assert(
      record.published.length === 0,
      `expected no re-publish, got ${JSON.stringify(record.published)}`,
    );
  });

  await test("Future scheduled_at — sweep no-ops regardless of open_mode", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "future-auto",
        owner_user_id: "owner-3",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
        open_mode: "auto_open",
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
      {
        id: "future-announce",
        owner_user_id: "owner-3",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
        open_mode: "announce_only",
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.autoOpened === 0, "future scheduled_at must not auto-open");
    assert(result.announced === 0, "future scheduled_at must not announce");
    assert(
      record.published.length === 0,
      "future sessions must not publish",
    );
    assert(
      record.transitioned.length === 0,
      "future sessions must not transition",
    );
  });

  await test("Legacy null open_mode — sweep ignores via SQL filter", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "legacy",
        owner_user_id: "owner-4",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        // null open_mode → filtered out by `.not("open_mode", "is", null)`
        // before the in-process loop runs.
        open_mode: null,
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.autoOpened === 0, "legacy null open_mode must not auto-open");
    assert(result.announced === 0, "legacy null open_mode must not announce");
    assert(
      record.transitioned.length === 0,
      "legacy null open_mode must not transition",
    );
    assert(
      record.published.length === 0,
      "legacy null open_mode must not publish",
    );
  });

  await test("Mixed batch — auto + announce + future + legacy in one tick", async () => {
    clearMocks();
    const rows: FakeRow[] = [
      {
        id: "mix-auto",
        owner_user_id: "owner-5",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        open_mode: "auto_open",
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: { game: "mario-kart-8-deluxe" },
      },
      {
        id: "mix-announce",
        owner_user_id: "owner-5",
        scheduled_at: new Date(Date.now() - 90_000).toISOString(),
        open_mode: "announce_only",
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
      {
        id: "mix-future",
        owner_user_id: "owner-5",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
        open_mode: "auto_open",
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
      {
        id: "mix-legacy",
        owner_user_id: "owner-5",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        open_mode: null,
        status: "scheduled",
        feature_flags: null,
        platforms: null,
        config: null,
      },
    ];
    const record = installMocks(rows);
    const { sweepScheduledOpens } = require("@/lib/sessions/lifecycle-sweep");
    const result = await sweepScheduledOpens();
    assert(result.autoOpened === 1, `expected 1 auto-opened, got ${result.autoOpened}`);
    assert(result.announced === 1, `expected 1 announced, got ${result.announced}`);
    const publishedTypes = record.published.map((p) => p.type).sort();
    assert(
      publishedTypes.length === 2 &&
        publishedTypes[0] === "session_announced" &&
        publishedTypes[1] === "session_opened",
      `expected [session_announced, session_opened], got ${JSON.stringify(publishedTypes)}`,
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
