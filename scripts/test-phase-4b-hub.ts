/**
 * Phase 4B advanced hub flows — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-phase-4b-hub.ts
 *
 * Phase 4B's main features (creation form, configure page, recap, draft-
 * during-ending UX) all touch the DB. Those flows are exercised in
 * docs/gs-pro-v1-phase-4b-runbook.md as manual smoke tests.
 *
 * What we cover here without a database:
 *   - The hub-access gate via the existing capability surface (regression
 *     test that the helper still gates on hub.access)
 *   - The createSession service writes 'scheduled' status when scheduledAt
 *     is provided — verified via a contract assertion at the type level
 *     (the runtime behavior is exercised in the runbook)
 *   - The Twitch help-message context selection (in-session / no-session /
 *     unsupported) is structurally correct — the strings exist and differ
 */

import assert from "node:assert/strict";
import { hasCapability, type CapabilityUser } from "../src/lib/subscription";

let passed = 0;
let failed = 0;

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
  // ---------- Hub access — regression on gate behavior --------------------

  section("Hub access — regression");

  const proUser: CapabilityUser = { tier: "pro", role: null };
  const freeUser: CapabilityUser = { tier: "free", role: null };
  const staffFree: CapabilityUser = { tier: "free", role: "staff" };
  const staffImpFree: CapabilityUser = {
    tier: "free",
    role: "staff",
    viewingAsTier: "free",
  };

  await test("Pro user has hub.access", () => {
    assert.equal(hasCapability(proUser, "hub.access"), true);
  });
  await test("Free user does NOT have hub.access", () => {
    assert.equal(hasCapability(freeUser, "hub.access"), false);
  });
  await test("Staff (no impersonation) inherits hub.access", () => {
    assert.equal(hasCapability(staffFree, "hub.access"), true);
  });
  await test("Staff impersonating free is gated", () => {
    assert.equal(hasCapability(staffImpFree, "hub.access"), false);
  });

  // ---------- Help-message context selection ------------------------------
  // The dispatcher chooses one of three strings based on session state:
  //   no session             → HELP_MESSAGE_NO_SESSION
  //   session w/ no slug     → HELP_MESSAGE_GAME_UNSUPPORTED
  //   session w/ slug        → HELP_MESSAGE_IN_SESSION
  // This is too coupled to the dispatcher to import directly without
  // pulling in DB-dependent symbols. Verify the strings live in the file
  // and differ — that's enough to catch regressions.

  section("Twitch chat help — three context-aware messages exist");

  const fs = await import("node:fs/promises");
  const dispatcherSource = await fs.readFile(
    new URL("../src/lib/twitch/commands/dispatch.ts", import.meta.url),
    "utf8"
  );

  await test("HELP_MESSAGE_IN_SESSION is defined", () => {
    assert.match(dispatcherSource, /HELP_MESSAGE_IN_SESSION\s*=/);
  });
  await test("HELP_MESSAGE_NO_SESSION is defined", () => {
    assert.match(dispatcherSource, /HELP_MESSAGE_NO_SESSION\s*=/);
  });
  await test("HELP_MESSAGE_GAME_UNSUPPORTED is defined", () => {
    assert.match(dispatcherSource, /HELP_MESSAGE_GAME_UNSUPPORTED\s*=/);
  });
  await test("In-session help mentions the playable commands", () => {
    const match = dispatcherSource.match(
      /HELP_MESSAGE_IN_SESSION\s*=\s*"([^"]+)"/
    );
    assert.ok(match, "could not extract HELP_MESSAGE_IN_SESSION literal");
    const body = match![1];
    assert.match(body, /!gs-join/);
    assert.match(body, /!gs-shuffle/);
    assert.match(body, /!gs-mycombo/);
    assert.match(body, /!gs-lobby/);
    assert.match(body, /!gs-leave/);
  });
  await test("No-session help explains why bot is silent", () => {
    const match = dispatcherSource.match(
      /HELP_MESSAGE_NO_SESSION\s*=\s*"([^"]+)"/
    );
    assert.ok(match, "could not extract HELP_MESSAGE_NO_SESSION literal");
    assert.match(match![1], /isn't running/);
  });
  await test("Unsupported-category help names the supported games", () => {
    const match = dispatcherSource.match(
      /HELP_MESSAGE_GAME_UNSUPPORTED\s*=\s*"([^"]+)"/
    );
    assert.ok(match, "could not extract HELP_MESSAGE_GAME_UNSUPPORTED literal");
    assert.match(match![1], /Mario Kart/);
  });
  await test("All three help messages stay under Twitch's 500-char cap", () => {
    for (const name of [
      "HELP_MESSAGE_IN_SESSION",
      "HELP_MESSAGE_NO_SESSION",
      "HELP_MESSAGE_GAME_UNSUPPORTED",
    ]) {
      const match = dispatcherSource.match(
        new RegExp(`${name}\\s*=\\s*"([^"]+)"`)
      );
      assert.ok(match, `${name} not found`);
      assert.ok(
        match![1].length <= 500,
        `${name} (${match![1].length} chars) exceeds Twitch's 500-char cap`
      );
    }
  });

  // ---------- Help-discoverability — error messages reference !gs-help ----

  section("Help-discoverability — error messages mention !gs-help");

  const messagesSource = await fs.readFile(
    new URL("../src/lib/twitch/commands/messages.ts", import.meta.url),
    "utf8"
  );

  await test("noComboYetMessage references !gs-help", () => {
    const match = messagesSource.match(
      /export function noComboYetMessage[\s\S]*?return `([^`]+)`/
    );
    assert.ok(match);
    assert.match(match![1], /!gs-help/);
  });
  await test("notInShuffleMessage references !gs-help", () => {
    const match = messagesSource.match(
      /export function notInShuffleMessage[\s\S]*?return `([^`]+)`/
    );
    assert.ok(match);
    assert.match(match![1], /!gs-help/);
  });

  // ---------- createSession contract — scheduledAt drives status ----------

  section("createSession — scheduled status contract");

  const serviceSource = await fs.readFile(
    new URL("../src/lib/sessions/service.ts", import.meta.url),
    "utf8"
  );

  await test("CreateSessionInput type accepts scheduledAt", () => {
    assert.match(serviceSource, /scheduledAt\?: string \| null/);
  });
  await test("createSession writes 'scheduled' when scheduledAt is set", () => {
    // The implementation sets `status: isScheduled ? "scheduled" : "draft"`.
    // We verify both branches exist in the source so a refactor that
    // accidentally drops scheduling writes a draft instead of a scheduled.
    assert.match(
      serviceSource,
      /isScheduled\s*\?\s*"scheduled"\s*:\s*"draft"/
    );
  });
  await test("createSession defaults eligibility window to 4 hours", () => {
    assert.match(
      serviceSource,
      /scheduledEligibilityWindowHours\s*\?\?\s*4/
    );
  });

  // ---------- Summary -----------------------------------------------------

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("test runner crashed:", err);
  process.exit(1);
});
