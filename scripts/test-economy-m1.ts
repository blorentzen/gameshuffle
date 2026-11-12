/**
 * Economy M1 smoke-test orchestrator.
 *
 * Manually-runnable from the repo root:
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-economy-m1.ts
 *
 * Hits four invariants the spec calls out as acceptance criteria.
 * Each assertion prints PASS/FAIL with a short reason so a run is
 * legible without a fancy reporter.
 *
 *   1. Concurrent spend serialization — two parallel spends, one
 *      succeeds, the second one rejects with `insufficient_balance`
 *      and the ledger is internally consistent.
 *   2. Tier 0 → Tier 1 LINK preserves balance — the `id` is stable,
 *      `gs_balance` returns the same number before and after the
 *      upgrade, every token_event row keeps its identity_id pointer.
 *   3. Parimutuel sum — total payouts across winning pools equals
 *      total stakes across all pools (dust accounting).
 *   4. Refund-vs-session-end semantics — session_end refunds open
 *      markets in that session WITHOUT touching another session's
 *      market in the same stream; stream_end refunds everything.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in
 * the environment (load via `.env.local`). Point it at the dev project,
 * never prod (it refuses the production project).
 *
 * Writes: throwaway chat identities, communities and streams it makes
 * itself; game sessions owned by the dev persona `novastreams`
 * (status cancelled, so they never count as a live stream); a link
 * from a throwaway identity to the dev persona `quiet_quinn`; and the
 * DK compliance rule when the database doesn't have it (dev isn't
 * seeded with `gs_compliance_rules`). Every row it makes is deleted at
 * the end, even after a failure, and the cleanup is checked like any
 * other result.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-economy-m1.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}
// Production's project: this script writes, so never there.
if (process.env.NEXT_PUBLIC_SUPABASE_URL.includes("hzmmmuzuioybydejdmhg")) {
  console.error("Refusing to run against the production database.");
  process.exit(1);
}

import { createServiceClient } from "../src/lib/supabase/admin";
import { resolveIdentity, upgradeIdentityToAccount } from "../src/lib/economy/identity";
import { ensureCommunity } from "../src/lib/economy/community";
import {
  ensureActiveStream,
  finalizeStreamEnd,
  markStreamEnding,
} from "../src/lib/economy/streams";
import {
  credit,
  getBalance,
  spend,
} from "../src/lib/economy/tokens";
import {
  openMarket,
  placeBet,
  refundSessionMarkets,
  refundStreamMarkets,
  resolveMarket,
  lockMarket,
} from "../src/lib/economy/markets/lifecycle";
import { awardMint } from "../src/lib/economy/awards";
import {
  cancelBounty,
  openBounty,
  settleBounty,
} from "../src/lib/economy/bounties";
import {
  checkCompliance,
  invalidateComplianceCache,
} from "../src/lib/economy/compliance/gate";
import { gsMonthStart } from "../src/lib/time/gsClock";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  const sep = detail ? " — " : "";
  console.log(`  [${tag}] ${name}${sep}${detail ?? ""}`);
}

function randStr() {
  return Math.random().toString(36).slice(2, 12);
}

// Everything the run creates, so cleanup() can remove exactly that.
const made = {
  identities: new Set<string>(),
  communities: new Set<string>(),
  streams: new Set<string>(),
  sessions: new Set<string>(),
  complianceRules: new Set<number>(),
};

/** A dev persona's account id, looked up by username. */
async function persona(username: string): Promise<string> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (error || !id) {
    throw new Error(`dev persona "${username}" not found (run scripts/seed-dev.ts on dev): ${error?.message ?? "no row"}`);
  }
  return id;
}

/** A brand-new chat identity (random platform id, so always new). */
async function newIdentity(prefix: string, displayName: string) {
  const resolved = await resolveIdentity({
    platform: "twitch",
    platformId: `${prefix}_${randStr()}`,
    displayName,
  });
  if (!resolved.isNew) {
    throw new Error(`identity ${prefix} already existed; refusing to use (or delete) it`);
  }
  made.identities.add(resolved.identityId);
  return resolved;
}

/** A game session owned by the dev persona `novastreams`. Markets key
 *  off the session id only; the session is `cancelled` so it can't
 *  clash with the persona's one active session or show as live. */
async function newSession(label: string): Promise<string | null> {
  const ownerId = await persona("novastreams");
  const { data, error } = await createServiceClient()
    .from("gs_sessions")
    .insert({
      owner_user_id: ownerId,
      name: `Economy test ${label} (removed after the run)`,
      slug: `test-economy-${label}-${randStr()}`,
      status: "cancelled",
      configured_games: ["mario-kart-8-deluxe"],
    })
    .select("id")
    .single();
  if (error || !data) {
    console.log(`  (session ${label} not created: ${error?.message ?? "no row"})`);
    return null;
  }
  const id = (data as { id: string }).id;
  made.sessions.add(id);
  return id;
}

async function setupCommunityWithBroadcaster() {
  const id = randStr();
  const broadcaster = await newIdentity("bc", `Broadcaster ${id}`);
  const community = await ensureCommunity({
    ownerIdentityId: broadcaster.identityId,
    slug: `test_${id}`,
    displayName: `Test ${id}`,
  });
  if (community.owner_identity_id !== broadcaster.identityId) {
    throw new Error(`community slug test_${id} belongs to someone else`);
  }
  made.communities.add(community.id);
  const stream = await ensureActiveStream({ communityId: community.id });
  made.streams.add(stream.id);
  return {
    broadcasterIdentityId: broadcaster.identityId,
    communityId: community.id,
    streamId: stream.id,
  };
}

// 1. Concurrent spend serialization -----------------------------------------

async function testConcurrentSpend() {
  console.log("\n1. Concurrent spend serialization");
  const resolved = await newIdentity("viewer", "Concurrent Viewer");
  const identityId = resolved.identityId;

  // Set balance to exactly 100 by topping up via credit() then noting
  // current balance. Starting grant from resolveIdentity may have
  // already credited, so add what's needed to land at 100.
  const current = await getBalance(identityId);
  if (current < 100) {
    await credit({
      identityId,
      amount: 100 - current,
      type: "grant_start",
      ctx: { meta: { source: "test_setup" } },
    });
  } else if (current > 100) {
    await spend({
      identityId,
      amount: current - 100,
      type: "transfer_out",
      ctx: { meta: { source: "test_setup_drain" } },
    });
  }
  const before = await getBalance(identityId);
  record("balance set to 100 baseline", before === 100, `balance=${before}`);

  // Fire two parallel spends of 80. Both can't succeed.
  const [a, b] = await Promise.all([
    spend({ identityId, amount: 80, type: "transfer_out", ctx: { meta: { source: "test" } } }),
    spend({ identityId, amount: 80, type: "transfer_out", ctx: { meta: { source: "test" } } }),
  ]);
  const successes = [a, b].filter((r) => r.ok).length;
  const rejections = [a, b].filter((r) => !r.ok && r.reason === "insufficient_balance").length;
  record(
    "exactly one parallel spend succeeded",
    successes === 1,
    `successes=${successes}`,
  );
  record(
    "the other rejected as insufficient_balance",
    rejections === 1,
    `rejections=${rejections}`,
  );

  const after = await getBalance(identityId);
  record(
    "post-spend balance is 100 - 80 = 20",
    after === 20,
    `balance=${after}`,
  );
}

// 2. Tier 0 → Tier 1 LINK preserves balance ---------------------------------

async function testUpgradePreservesBalance() {
  console.log("\n2. Tier 0 → Tier 1 LINK preserves balance");

  const resolved = await newIdentity("upgrade", "Upgrade Viewer");
  const identityIdBefore = resolved.identityId;
  const balanceBefore = await getBalance(identityIdBefore);

  // Link the throwaway identity to the dev persona quiet_quinn's real
  // account (an account can hold any number of identities). The
  // identity, and with it the link, is deleted in cleanup().
  const admin = createServiceClient();
  const accountId = await persona("quiet_quinn");

  const upgradeResult = await upgradeIdentityToAccount({
    identityId: identityIdBefore,
    gsAccountId: accountId,
  });
  record("upgrade returned ok", upgradeResult.ok === true, upgradeResult.reason);

  // Identity id is stable.
  const { data: rowAfter } = await admin
    .from("gs_identities")
    .select("id, gs_account_id, tier")
    .eq("id", identityIdBefore)
    .maybeSingle();
  record(
    "identity row id unchanged",
    rowAfter?.id === identityIdBefore,
    `after.id=${rowAfter?.id}`,
  );
  record(
    "gs_account_id stamped",
    rowAfter?.gs_account_id === accountId,
    `after.gs_account_id=${rowAfter?.gs_account_id}`,
  );
  record(
    "tier stamped to free",
    rowAfter?.tier === "free",
    `after.tier=${rowAfter?.tier}`,
  );

  const balanceAfter = await getBalance(identityIdBefore);
  record(
    "balance preserved across upgrade",
    balanceAfter === balanceBefore,
    `before=${balanceBefore} after=${balanceAfter}`,
  );
}

// 3. Parimutuel sum ----------------------------------------------------------

async function testParimutuelSum() {
  console.log("\n3. Parimutuel payouts sum to pool total");

  const setup = await setupCommunityWithBroadcaster();

  const sessionId = await newSession("pm");
  if (!sessionId) {
    record("test session created", false, "could not insert the session");
    return;
  }

  // Open a market (assumes seed template for mario-kart-8-deluxe is
  // enabled — see supabase/command-suite-economy-m1.sql).
  const opened = await openMarket({
    communityId: setup.communityId,
    streamId: setup.streamId,
    sessionId,
    gameKey: "mario-kart-8-deluxe",
    chapter: 1,
    subject: "Test Subject",
    hostIdentityId: setup.broadcasterIdentityId,
    lockMinutes: 5,
  });
  if (!opened.ok) {
    record("market opened", false, opened.reason);
    return;
  }
  const market = opened.market;
  const outcomes = opened.outcomes;
  record("market opened", true, `marketId=${market.id} outcomes=${outcomes.length}`);

  // Three bettors stake 100/50/30 on the top-line outcome ("win" for
  // placement). One on the runner-up. Total pool = 300.
  const bettors = await Promise.all([
    newIdentity("pm_a", "A"),
    newIdentity("pm_b", "B"),
    newIdentity("pm_c", "C"),
    newIdentity("pm_d", "D"),
  ]);
  // Top up each bettor to a known balance.
  for (const r of bettors) {
    await credit({ identityId: r.identityId, amount: 1000, type: "grant_start" });
  }
  const winningKey = outcomes[0].option_key;
  const losingKey = outcomes[outcomes.length - 1].option_key;
  await placeBet({ marketId: market.id, optionKey: winningKey, identityId: bettors[0].identityId, amount: 100 });
  await placeBet({ marketId: market.id, optionKey: winningKey, identityId: bettors[1].identityId, amount: 50 });
  await placeBet({ marketId: market.id, optionKey: winningKey, identityId: bettors[2].identityId, amount: 30 });
  await placeBet({ marketId: market.id, optionKey: losingKey, identityId: bettors[3].identityId, amount: 70 });

  await lockMarket({ marketId: market.id });
  const resolved = await resolveMarket({
    marketId: market.id,
    value: "1", // placement = 1 → "win" pool wins
    resolverIdentityId: setup.broadcasterIdentityId,
  });
  if (!resolved.ok) {
    record("market resolved", false, resolved.reason);
    return;
  }

  const totalStaked = 100 + 50 + 30 + 70;
  const totalPayout = resolved.pools.reduce((acc, p) => acc + p.payoutTotal, 0);
  record(
    "payouts sum equals total stake",
    totalPayout === totalStaked,
    `staked=${totalStaked} paid=${totalPayout}`,
  );
}

// 4. Refund-vs-session-end semantics ----------------------------------------

async function testRefundScopes() {
  console.log("\n4. Refund: session_end vs stream_end scopes");

  const setup = await setupCommunityWithBroadcaster();
  const admin = createServiceClient();

  // Two sessions, both bound to the same stream.
  const sessionA = await newSession("refund-a");
  const sessionB = await newSession("refund-b");
  if (!sessionA || !sessionB) {
    record("two test sessions created", false, "could not insert sessions");
    return;
  }

  const openedA = await openMarket({
    communityId: setup.communityId,
    streamId: setup.streamId,
    sessionId: sessionA,
    gameKey: "mario-kart-8-deluxe",
    chapter: 1,
    subject: "A",
    hostIdentityId: setup.broadcasterIdentityId,
    lockMinutes: 5,
  });
  const openedB = await openMarket({
    communityId: setup.communityId,
    streamId: setup.streamId,
    sessionId: sessionB,
    gameKey: "mario-kart-8-deluxe",
    chapter: 1,
    subject: "B",
    hostIdentityId: setup.broadcasterIdentityId,
    lockMinutes: 5,
  });
  if (!openedA.ok || !openedB.ok) {
    record("opened both markets", false, `A=${openedA.ok} B=${openedB.ok}`);
    return;
  }

  // refundSessionMarkets on A should cancel A only, leaving B open.
  const sessionRefund = await refundSessionMarkets({
    sessionId: sessionA,
    reason: "session_end",
  });
  record(
    "session_end refund cancelled A only",
    sessionRefund.refundedMarkets === 1,
    `refundedMarkets=${sessionRefund.refundedMarkets}`,
  );

  const { data: marketAAfter } = await admin
    .from("gs_markets")
    .select("status")
    .eq("id", openedA.market.id)
    .single();
  const { data: marketBAfter } = await admin
    .from("gs_markets")
    .select("status")
    .eq("id", openedB.market.id)
    .single();
  record(
    "A is cancelled",
    marketAAfter?.status === "cancelled",
    `A.status=${marketAAfter?.status}`,
  );
  record(
    "B is still open",
    marketBAfter?.status === "open",
    `B.status=${marketBAfter?.status}`,
  );

  // refundStreamMarkets should now cancel B too. The stream goes
  // open → ending (stream.offline) → ended (grace expired), as live.
  await markStreamEnding({ streamId: setup.streamId });
  const ended = await finalizeStreamEnd({ streamId: setup.streamId });
  record("stream reached ended", ended?.status === "ended", `status=${ended?.status}`);
  const streamRefund = await refundStreamMarkets({ streamId: setup.streamId });
  // After finalize the stream is `ended` so getActiveStream returns
  // nothing; refundStreamMarkets queries by stream_id, so it still
  // hits any remaining open markets. B should be picked up.
  const { data: marketBFinal } = await admin
    .from("gs_markets")
    .select("status")
    .eq("id", openedB.market.id)
    .single();
  record(
    "stream_end refund cancelled B",
    marketBFinal?.status === "cancelled",
    `B.status=${marketBFinal?.status} streamRefund=${JSON.stringify(streamRefund)}`,
  );
}

// 5. Allowance ceiling ------------------------------------------------------

async function testAllowanceCeiling() {
  console.log("\n5. Streamer allowance ceiling enforced");
  const setup = await setupCommunityWithBroadcaster();
  const admin = createServiceClient();

  // Seed a tight ceiling so the test can exercise the rejection path.
  await admin
    .from("gs_streamer_allowance")
    .upsert(
      {
        community_id: setup.communityId,
        // Pacific month, as gs_award_mint keys it.
        period_month: gsMonthStart(),
        ceiling: 200,
        consumed: 0,
      },
      { onConflict: "community_id,period_month" },
    );

  const recipient = await newIdentity("award", "Award Recipient");

  const first = await awardMint({
    communityId: setup.communityId,
    toIdentityId: recipient.identityId,
    amount: 150,
  });
  record("first award within ceiling succeeded", first.ok === true, JSON.stringify(first));

  const second = await awardMint({
    communityId: setup.communityId,
    toIdentityId: recipient.identityId,
    amount: 100,
  });
  record(
    "second award exceeding ceiling rejected",
    second.ok === false && (second as { reason?: string }).reason === "allowance_exceeded",
    `result=${JSON.stringify(second)}`,
  );

  // Self-award rejection.
  const selfAward = await awardMint({
    communityId: setup.communityId,
    toIdentityId: setup.broadcasterIdentityId,
    amount: 10,
  });
  record(
    "self-award rejected",
    selfAward.ok === false && (selfAward as { reason?: string }).reason === "self_award_rejected",
    `result=${JSON.stringify(selfAward)}`,
  );
}

// 6. Bounty open → award round-trip ----------------------------------------

async function testBountyRoundTrip() {
  console.log("\n6. Bounty open → award round-trip");
  const setup = await setupCommunityWithBroadcaster();
  const admin = createServiceClient();

  // Tight ceiling so we can verify consumed math.
  await admin
    .from("gs_streamer_allowance")
    .upsert(
      {
        community_id: setup.communityId,
        // Pacific month, as gs_award_mint keys it.
        period_month: gsMonthStart(),
        ceiling: 1000,
        consumed: 0,
      },
      { onConflict: "community_id,period_month" },
    );

  const opened = await openBounty({
    communityId: setup.communityId,
    streamId: setup.streamId,
    sessionId: null,
    chapter: null,
    gameKey: null,
    amount: 300,
    description: "smoke test bounty",
    createdByIdentityId: setup.broadcasterIdentityId,
  });
  record("bounty opened", opened.ok === true, JSON.stringify(opened));
  if (!opened.ok) return;

  // Consumed should now be 300.
  const { data: postOpen } = await admin
    .from("gs_streamer_allowance")
    .select("consumed")
    .eq("community_id", setup.communityId)
    .maybeSingle();
  record(
    "consumed bumped by reservation",
    Number((postOpen as { consumed: number } | null)?.consumed ?? 0) === 300,
    `consumed=${(postOpen as { consumed?: number } | null)?.consumed}`,
  );

  // Award to a viewer.
  const winner = await newIdentity("winner", "Bounty Winner");
  const winnerBalanceBefore = await getBalance(winner.identityId);

  const settled = await settleBounty({
    bountyId: opened.bountyId,
    toIdentityId: winner.identityId,
  });
  record("bounty settled", settled.ok === true, JSON.stringify(settled));

  const winnerBalanceAfter = await getBalance(winner.identityId);
  record(
    "winner credited bounty amount",
    winnerBalanceAfter - winnerBalanceBefore === 300,
    `delta=${winnerBalanceAfter - winnerBalanceBefore}`,
  );

  // Consumed should STILL be 300 (settle doesn't double-consume).
  const { data: postSettle } = await admin
    .from("gs_streamer_allowance")
    .select("consumed")
    .eq("community_id", setup.communityId)
    .maybeSingle();
  record(
    "consumed not double-bumped at settle",
    Number((postSettle as { consumed: number } | null)?.consumed ?? 0) === 300,
    `consumed=${(postSettle as { consumed?: number } | null)?.consumed}`,
  );

  // Open + cancel — release reservation.
  const opened2 = await openBounty({
    communityId: setup.communityId,
    streamId: setup.streamId,
    sessionId: null,
    chapter: null,
    gameKey: null,
    amount: 200,
    description: "to cancel",
    createdByIdentityId: setup.broadcasterIdentityId,
  });
  if (!opened2.ok) {
    record("second bounty opened", false, JSON.stringify(opened2));
    return;
  }
  const cancelled = await cancelBounty(opened2.bountyId);
  record("bounty cancelled", cancelled.ok === true, JSON.stringify(cancelled));

  const { data: postCancel } = await admin
    .from("gs_streamer_allowance")
    .select("consumed")
    .eq("community_id", setup.communityId)
    .maybeSingle();
  record(
    "consumed decremented on cancel (back to 300)",
    Number((postCancel as { consumed: number } | null)?.consumed ?? 0) === 300,
    `consumed=${(postCancel as { consumed?: number } | null)?.consumed}`,
  );
}

// 7. Compliance gate --------------------------------------------------------

async function testComplianceGate() {
  console.log("\n7. Compliance gate decisions");

  const fullUS = await checkCompliance({
    region: "US",
    complianceClass: "prediction_pool",
  });
  record(
    "US prediction_pool → full",
    fullUS.behavior === "full",
    `decision=${JSON.stringify(fullUS)}`,
  );

  // Production seeds ten restricted regions (command-suite-compliance-
  // m1-5.sql); dev isn't seeded, so add DK for this run when it's
  // missing (cleanup removes only a row this run added).
  const admin = createServiceClient();
  const { data: dkRow, error: dkErr } = await admin
    .from("gs_compliance_rules")
    .select("id, behavior")
    .eq("region_code", "DK")
    .eq("compliance_class", "prediction_pool")
    .is("genre", null)
    .maybeSingle();
  if (dkErr) {
    record("read the DK compliance rule", false, dkErr.message);
  } else if (!dkRow) {
    const { data: added, error: addErr } = await admin
      .from("gs_compliance_rules")
      .insert({
        region_code: "DK",
        compliance_class: "prediction_pool",
        genre: null,
        behavior: "spectator",
        note: "Denmark (added by test-economy-m1, removed after the run)",
      })
      .select("id")
      .single();
    if (addErr || !added) {
      record("seed the DK compliance rule for this run", false, addErr?.message ?? "no row");
    } else {
      made.complianceRules.add((added as { id: number }).id);
      console.log("  (dev has no DK rule: added one for this run)");
    }
  }
  invalidateComplianceCache();

  const spectatorDK = await checkCompliance({
    region: "DK",
    complianceClass: "prediction_pool",
  });
  record(
    "DK prediction_pool → spectator (seeded restricted)",
    spectatorDK.behavior === "spectator",
    `decision=${JSON.stringify(spectatorDK)}`,
  );

  // A sub-region with no rule of its own falls back to its country's.
  if (made.complianceRules.size > 0 || dkRow) {
    const subRegion = await checkCompliance({
      region: "DK-84",
      complianceClass: "prediction_pool",
    });
    record(
      "DK-84 prediction_pool → spectator (falls back to DK)",
      subRegion.behavior === "spectator",
      `decision=${JSON.stringify(subRegion)}`,
    );
  }

  const unknownPool = await checkCompliance({
    region: null,
    complianceClass: "prediction_pool",
  });
  record(
    "unknown region prediction_pool → spectator (default-deny)",
    unknownPool.behavior === "spectator",
    `decision=${JSON.stringify(unknownPool)}`,
  );

  const unknownCasino = await checkCompliance({
    region: null,
    complianceClass: "casino_style",
  });
  record(
    "unknown region casino_style → unavailable (default-deny)",
    unknownCasino.behavior === "unavailable",
    `decision=${JSON.stringify(unknownCasino)}`,
  );

  const noneClass = await checkCompliance({
    region: null,
    complianceClass: "none",
  });
  record(
    "none class always full (bypass)",
    noneClass.behavior === "full",
    `decision=${JSON.stringify(noneClass)}`,
  );
}

// Cleanup -------------------------------------------------------------------

/** Delete every row this run made, children first (the ledger and
 *  communities don't cascade from identities), then check none is left. */
async function cleanup() {
  console.log("\nCleanup");
  const admin = createServiceClient();
  const identities = [...made.identities];
  const communities = [...made.communities];
  const streams = [...made.streams];
  const sessions = [...made.sessions];
  const rules = [...made.complianceRules];
  const problems: string[] = [];
  const del = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run();
    if (error) problems.push(`${label}: ${error.message}`);
  };

  if (communities.length) {
    // Markets cascade to their outcomes, bets and spectator picks.
    await del("gs_markets", () => admin.from("gs_markets").delete().in("community_id", communities));
    await del("gs_bounties", () => admin.from("gs_bounties").delete().in("community_id", communities));
  }
  if (sessions.length) {
    await del("gs_markets (by session)", () => admin.from("gs_markets").delete().in("session_id", sessions));
  }
  if (identities.length) {
    await del("token_events (by identity)", () => admin.from("token_events").delete().in("identity_id", identities));
  }
  if (communities.length) {
    await del("token_events (by community)", () => admin.from("token_events").delete().in("community_id", communities));
    await del("gs_streamer_allowance", () => admin.from("gs_streamer_allowance").delete().in("community_id", communities));
  }
  if (sessions.length) {
    await del("gs_sessions", () => admin.from("gs_sessions").delete().in("id", sessions));
  }
  if (streams.length) {
    await del("gs_streams", () => admin.from("gs_streams").delete().in("id", streams));
  }
  if (communities.length) {
    // Seeded commands and module rows cascade with the community.
    await del("gs_communities", () => admin.from("gs_communities").delete().in("id", communities));
  }
  if (identities.length) {
    await del("gs_identities", () => admin.from("gs_identities").delete().in("id", identities));
  }
  if (rules.length) {
    await del("gs_compliance_rules", () => admin.from("gs_compliance_rules").delete().in("id", rules));
    invalidateComplianceCache();
  }

  // Check nothing is left behind.
  const left = async (table: string, column: string, ids: Array<string | number>) => {
    if (!ids.length) return 0;
    const { count, error } = await admin
      .from(table)
      .select(column, { count: "exact", head: true })
      .in(column, ids);
    if (error) problems.push(`count ${table}: ${error.message}`);
    return count ?? 0;
  };
  const remaining = {
    gs_identities: await left("gs_identities", "id", identities),
    token_events: (await left("token_events", "identity_id", identities)) + (await left("token_events", "community_id", communities)),
    gs_communities: await left("gs_communities", "id", communities),
    gs_streams: await left("gs_streams", "id", streams),
    gs_sessions: await left("gs_sessions", "id", sessions),
    gs_markets: (await left("gs_markets", "community_id", communities)) + (await left("gs_markets", "session_id", sessions)),
    gs_bounties: await left("gs_bounties", "community_id", communities),
    gs_streamer_allowance: await left("gs_streamer_allowance", "community_id", communities),
    gs_compliance_rules: await left("gs_compliance_rules", "id", rules),
  };
  const leftovers = Object.entries(remaining).filter(([, n]) => n > 0);
  record(
    "cleanup removed every row the run made",
    problems.length === 0 && leftovers.length === 0,
    [
      `made ${identities.length} identities, ${communities.length} communities, ${streams.length} streams, ${sessions.length} sessions, ${rules.length} compliance rules`,
      ...leftovers.map(([t, n]) => `${n} left in ${t}`),
      ...problems,
    ].join("; "),
  );
}

async function main() {
  console.log("=== Economy smoke test (M1 + M1.5 + Spec 04 Phase 2) ===");
  let errored = false;
  try {
    await testConcurrentSpend();
    await testUpgradePreservesBalance();
    await testParimutuelSum();
    await testRefundScopes();
    await testAllowanceCeiling();
    await testBountyRoundTrip();
    await testComplianceGate();
  } catch (err) {
    console.error("Suite errored:", err);
    errored = true;
  } finally {
    await cleanup();
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} checks passed ===`);
  process.exit(errored ? 2 : passed === total ? 0 : 1);
}

void main();
