/**
 * Phase B live stream view — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-track-item-phase-b.ts
 *
 * The DB-coupled and UI-coupled flows (route resolution, real-time
 * subscriptions, OAuth round-trip, tactile action handler equivalence
 * with chat) live in docs/gs-track-item-randomization-phase-b-runbook.md
 * as manual smoke tests. This script verifies what we can test in-process
 * without a database:
 *
 *   - Open-redirect allowlist on /auth/callback (regression coverage
 *     for the new viewer-flow-related expansion of the redirect surface)
 *   - Pending-action storage helpers (sessionStorage shape + replay-key
 *     guard so a stale action from a different streamer can't fire)
 *   - Activity-feed event filter (verify only viewer-visible event
 *     types map to ActivityItemData; internal events are dropped)
 *   - Public-read RLS policies present in the migration SQL (file
 *     content check — DB-level enforcement is the runbook's job).
 *     `supabase/` is gitignored, so a release worktree may not hold the
 *     file: `findLocal` also looks in the main checkout, and the checks
 *     are reported as SKIP (never as passed) when no copy is found.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-track-item-phase-b.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";

let passed = 0;
let failed = 0;
let skipped = 0;

function skip(name: string, why: string) {
  skipped += 1;
  console.log(`  - SKIP ${name}: ${why}`);
}

/** First existing copy of a gitignored file: this checkout, then the
 *  main checkout when this is a linked worktree. `rels` are tried in order. */
async function findLocal(rels: string[]): Promise<string | null> {
  const { execFileSync } = await import("node:child_process");
  const { dirname, resolve } = await import("node:path");
  const roots = [process.cwd()];
  try {
    const common = execFileSync("/usr/bin/git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
    }).trim();
    const main = dirname(common);
    if (resolve(main) !== resolve(process.cwd())) roots.push(main);
  } catch {
    // Not a git checkout: only this folder.
  }
  for (const root of roots) {
    for (const rel of rels) {
      const path = resolve(root, rel);
      try {
        await fs.access(path);
        return path;
      } catch {
        // try the next one
      }
    }
  }
  return null;
}

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error("    ", err instanceof Error ? err.message : err);
    }
  };
  return run();
}

function section(label: string) {
  console.log(`\n${label}`);
}

async function main() {
  // ---------- /auth/callback open-redirect allowlist ----------------------

  section("/auth/callback — open-redirect allowlist");

  // The allowlist and safeRedirect moved out of the callback into a shared
  // module (src/lib/auth/redirects.ts) that the callback and /auth/confirm use.
  const callbackSource = await fs.readFile(
    new URL("../src/lib/auth/redirects.ts", import.meta.url),
    "utf8"
  );

  await test("ALLOWED_REDIRECT_PREFIXES is defined", () => {
    assert.match(callbackSource, /ALLOWED_REDIRECT_PREFIXES/);
  });

  await test("safeRedirect helper is defined", () => {
    assert.match(callbackSource, /function safeRedirect\(/);
  });

  await test("/live/ is in the allowlist (Phase B addition)", () => {
    const match = callbackSource.match(
      /ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([\s\S]*?)\]/
    );
    assert.ok(match, "ALLOWED_REDIRECT_PREFIXES literal not found");
    assert.match(match![1], /['"]\/live\/['"]/);
  });

  await test("/account is still in the allowlist (existing flows)", () => {
    const match = callbackSource.match(
      /ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([\s\S]*?)\]/
    );
    assert.match(match![1], /['"]\/account['"]/);
  });

  await test("safeRedirect rejects external URLs", () => {
    // We can't run safeRedirect directly without importing the module
    // (which would pull in next/server). Verify the source explicitly
    // rejects '://' and '//' prefixes.
    assert.match(callbackSource, /raw\.startsWith\(['"]\/\/['"]\)/);
    assert.match(callbackSource, /raw\.includes\(['"]:\/\/['"]\)/);
  });

  // ---------- Pending-action storage helpers ------------------------------

  section("useReplayActionAfterAuth — sessionStorage shape");

  const replaySource = await fs.readFile(
    new URL("../src/components/live/useReplayActionAfterAuth.ts", import.meta.url),
    "utf8"
  );

  await test("rememberPendingAction + clearPendingAction are exported", () => {
    assert.match(replaySource, /export function rememberPendingAction/);
    assert.match(replaySource, /export function clearPendingAction/);
  });

  await test("PendingAction has expectedSlug for cross-streamer guard", () => {
    assert.match(replaySource, /expectedSlug:\s*string;/);
  });

  await test("Replay clears storage before invoking handler (no double-fire)", () => {
    // The hook should clear sessionStorage BEFORE invoking the replay
    // handler so a refresh after the handler fires doesn't re-trigger
    // the action. We measure positions in the full source — the call
    // to clearPendingAction must appear before the call to replay(pending).
    const clearIdx = replaySource.indexOf("clearPendingAction()");
    const replayIdx = replaySource.indexOf("replay(pending)");
    assert.ok(clearIdx !== -1, "clearPendingAction() not called in effect");
    assert.ok(replayIdx !== -1, "replay(pending) not called in effect");
    assert.ok(
      clearIdx < replayIdx,
      "clearPendingAction must be called before replay"
    );
  });

  await test("Replay aborts when expectedSlug doesn't match current slug", () => {
    assert.match(
      replaySource,
      /pending\.expectedSlug\s*!==\s*currentSlug/
    );
  });

  // ---------- Activity-feed event filter ----------------------------------

  section("LiveActivityTab — viewer-visible event filter");

  const activityTabSource = await fs.readFile(
    new URL("../src/components/live/tabs/LiveActivityTab.tsx", import.meta.url),
    "utf8"
  );

  await test("VIEWER_VISIBLE_EVENTS allowlist is defined", () => {
    assert.match(activityTabSource, /VIEWER_VISIBLE_EVENTS/);
  });

  await test("Internal events are NOT in the visible-events set", () => {
    const match = activityTabSource.match(
      /VIEWER_VISIBLE_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    assert.ok(match, "VIEWER_VISIBLE_EVENTS literal not found");
    const body = match![1];
    // Internal events that should NOT be exposed to viewers.
    for (const internal of [
      "adapter_call",
      "adapter_call_failed",
      "state_change",
      "wrap_up_started",
      "wrap_up_complete",
      "recap_ready",
      "auto_timeout_triggered",
      "inactive_notification_sent",
      "grace_period_started",
      "grace_period_cancelled",
    ]) {
      assert.ok(
        !body.includes(`"${internal}"`),
        `internal event ${internal} should not be in VIEWER_VISIBLE_EVENTS`
      );
    }
  });

  await test("Race randomization events ARE in the visible-events set", () => {
    const match = activityTabSource.match(
      /VIEWER_VISIBLE_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    const body = match![1];
    assert.match(body, /"race_randomized"/);
    assert.match(body, /"track_randomized"/);
    assert.match(body, /"items_randomized"/);
  });

  await test("Participant + shuffle events ARE in the visible-events set", () => {
    const match = activityTabSource.match(
      /VIEWER_VISIBLE_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    const body = match![1];
    assert.match(body, /"shuffle"/);
    assert.match(body, /"participant_join"/);
    assert.match(body, /"participant_leave"/);
  });

  // ---------- Migration SQL — public-read policies ------------------------

  section("Phase B migration — public-read RLS policies");

  const migrationPath = await findLocal([
    "supabase/phase-b-public-read-policies.sql",
    "supabase/archive/phase-b-public-read-policies.sql",
  ]);
  const migrationChecks: Array<[string, (migrationSource: string) => void]> = [
    ["Migration creates public-read policy for session_events", (migrationSource) => {
      assert.match(migrationSource, /Public read events of active sessions/);
      assert.match(
        migrationSource,
        /CREATE POLICY[\s\S]*?ON public\.session_events[\s\S]*?FOR SELECT/
      );
    }],
    ["Migration creates public-read policy for session_modules", (migrationSource) => {
      assert.match(migrationSource, /Public read modules of active sessions/);
      assert.match(
        migrationSource,
        /CREATE POLICY[\s\S]*?ON public\.session_modules[\s\S]*?FOR SELECT/
      );
    }],
    ["Both policies scope to active/ending status only", (migrationSource) => {
      // Status filter prevents leaking historical data from ended/cancelled
      // sessions through anonymous read access.
      const eventPolicy = migrationSource.match(
        /CREATE POLICY[\s\S]*?ON public\.session_events[\s\S]*?USING\s*\(([\s\S]*?)\);/
      );
      const modulePolicy = migrationSource.match(
        /CREATE POLICY[\s\S]*?ON public\.session_modules[\s\S]*?USING\s*\(([\s\S]*?)\);/
      );
      assert.ok(eventPolicy, "session_events policy USING clause not found");
      assert.ok(modulePolicy, "session_modules policy USING clause not found");
      assert.match(eventPolicy![1], /'active'\s*,\s*'ending'/);
      assert.match(modulePolicy![1], /'active'\s*,\s*'ending'/);
    }],
    ["Migration is idempotent (DROP POLICY IF EXISTS guards)", (migrationSource) => {
      // Both policies should drop-if-exists before create so re-running
      // the migration is safe.
      const drops = migrationSource.match(/DROP POLICY IF EXISTS/g) ?? [];
      assert.ok(drops.length >= 2, `expected ≥2 DROP POLICY guards, got ${drops.length}`);
    }],
  ];
  if (migrationPath) {
    const migrationSource = await fs.readFile(migrationPath, "utf8");
    for (const [name, check] of migrationChecks) {
      await test(name, () => check(migrationSource));
    }
  } else {
    for (const [name] of migrationChecks) {
      skip(name, "phase-b-public-read-policies.sql not found in supabase/ or supabase/archive/ (gitignored)");
    }
  }

  // ---------- Auth-prompt modal — Twitch-only flow ------------------------

  section("AuthPromptModal — Twitch-only flow + redirect path");

  const modalSource = await fs.readFile(
    new URL("../src/components/live/AuthPromptModal.tsx", import.meta.url),
    "utf8"
  );

  await test("Twitch sign-in starts through startOAuth", () => {
    // Every Twitch/Discord button goes through startOAuth (src/lib/auth/oauth.ts).
    assert.match(modalSource, /startOAuth\(\s*['"]twitch['"]/);
  });

  await test("Redirect path is built from streamerSlug (not hardcoded)", () => {
    assert.match(modalSource, /\/live\/\$\{streamerSlug\}/);
  });

  await test("Callback URL passes redirect query param", () => {
    assert.match(
      modalSource,
      /searchParams\.set\(['"]redirect['"]/
    );
  });

  // ---------- Summary -----------------------------------------------------

  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("test runner crashed:", err);
  process.exit(1);
});
