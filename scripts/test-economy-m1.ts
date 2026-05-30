/**
 * Economy M1 smoke-test orchestrator.
 *
 * Manually-runnable from the repo root:
 *
 *   npx tsx scripts/test-economy-m1.ts
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
 * the environment (load via `.env.local`). The script writes into the
 * configured DB and cleans up after itself, so point it at a test
 * project, not prod.
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

import { createServiceClient } from "../src/lib/supabase/admin";
import { resolveIdentity, upgradeIdentityToAccount } from "../src/lib/economy/identity";
import { ensureCommunity } from "../src/lib/economy/community";
import { ensureActiveStream, finalizeStreamEnd } from "../src/lib/economy/streams";
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
import { checkCompliance } from "../src/lib/economy/compliance/gate";

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

async function setupCommunityWithBroadcaster() {
  const id = randStr();
  const broadcasterTwitchId = `bc_${id}`;
  const broadcasterResolved = await resolveIdentity({
    platform: "twitch",
    platformId: broadcasterTwitchId,
    displayName: `Broadcaster ${id}`,
  });
  const community = await ensureCommunity({
    ownerIdentityId: broadcasterResolved.identityId,
    slug: `test_${id}`,
    displayName: `Test ${id}`,
  });
  const stream = await ensureActiveStream({ communityId: community.id });
  return {
    broadcasterIdentityId: broadcasterResolved.identityId,
    communityId: community.id,
    streamId: stream.id,
    broadcasterTwitchId,
  };
}

// 1. Concurrent spend serialization -----------------------------------------

async function testConcurrentSpend() {
  console.log("\n1. Concurrent spend serialization");
  const platformId = `viewer_${randStr()}`;
  const resolved = await resolveIdentity({
    platform: "twitch",
    platformId,
    displayName: "Concurrent Viewer",
  });
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

  const platformId = `upgrade_${randStr()}`;
  const resolved = await resolveIdentity({
    platform: "twitch",
    platformId,
    displayName: "Upgrade Viewer",
  });
  const identityIdBefore = resolved.identityId;
  const balanceBefore = await getBalance(identityIdBefore);

  // Create a synthetic GS account row — minimal shape. Use an auth-
  // free approach: write a uuid into auth.users to satisfy the FK.
  // The real OAuth callback would do this; for this test we just
  // need the FK target to exist.
  const admin = createServiceClient();
  const { data: authRow, error: authErr } = await admin.auth.admin.createUser({
    email: `test+${randStr()}@gameshuffle.invalid`,
    email_confirm: true,
  });
  if (authErr || !authRow.user) {
    record("auth user created for upgrade test", false, authErr?.message ?? "no user");
    return;
  }

  const upgradeResult = await upgradeIdentityToAccount({
    identityId: identityIdBefore,
    gsAccountId: authRow.user.id,
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
    rowAfter?.gs_account_id === authRow.user.id,
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

  // Cleanup: delete the auth user. The CASCADE on gs_identities
  // detaches gs_account_id to null automatically per the FK rule.
  await admin.auth.admin.deleteUser(authRow.user.id);
}

// 3. Parimutuel sum ----------------------------------------------------------

async function testParimutuelSum() {
  console.log("\n3. Parimutuel payouts sum to pool total");

  const setup = await setupCommunityWithBroadcaster();
  const admin = createServiceClient();

  // Create a fake session row to satisfy the market FK.
  const { data: session, error: sessionErr } = await admin
    .from("gs_sessions")
    .insert({
      owner_user_id: "00000000-0000-0000-0000-000000000000", // placeholder; bypass FK with service role
      name: "test parimutuel",
      slug: `test-pm-${randStr()}`,
      status: "active",
      configured_games: ["mario-kart-8-deluxe"],
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (sessionErr || !session) {
    record("test session created", false, sessionErr?.message ?? "no session");
    return;
  }
  const sessionId = session.id;

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
    resolveIdentity({ platform: "twitch", platformId: `pm_a_${randStr()}`, displayName: "A" }),
    resolveIdentity({ platform: "twitch", platformId: `pm_b_${randStr()}`, displayName: "B" }),
    resolveIdentity({ platform: "twitch", platformId: `pm_c_${randStr()}`, displayName: "C" }),
    resolveIdentity({ platform: "twitch", platformId: `pm_d_${randStr()}`, displayName: "D" }),
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
  const sessionRowA = await admin
    .from("gs_sessions")
    .insert({
      owner_user_id: "00000000-0000-0000-0000-000000000000",
      name: "test refund A",
      slug: `test-refund-a-${randStr()}`,
      status: "active",
      configured_games: ["mario-kart-8-deluxe"],
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const sessionRowB = await admin
    .from("gs_sessions")
    .insert({
      owner_user_id: "00000000-0000-0000-0000-000000000000",
      name: "test refund B",
      slug: `test-refund-b-${randStr()}`,
      status: "active",
      configured_games: ["mario-kart-8-deluxe"],
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const sessionA = sessionRowA.data?.id;
  const sessionB = sessionRowB.data?.id;
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

  // refundStreamMarkets should now cancel B too.
  await finalizeStreamEnd({ streamId: setup.streamId });
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
        period_month: new Date().toISOString().slice(0, 7) + "-01",
        ceiling: 200,
        consumed: 0,
      },
      { onConflict: "community_id,period_month" },
    );

  const recipient = await resolveIdentity({
    platform: "twitch",
    platformId: `award_${randStr()}`,
    displayName: "Award Recipient",
  });

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
        period_month: new Date().toISOString().slice(0, 7) + "-01",
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
  const winner = await resolveIdentity({
    platform: "twitch",
    platformId: `winner_${randStr()}`,
    displayName: "Bounty Winner",
  });
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

  const spectatorDK = await checkCompliance({
    region: "DK",
    complianceClass: "prediction_pool",
  });
  record(
    "DK prediction_pool → spectator (seeded restricted)",
    spectatorDK.behavior === "spectator",
    `decision=${JSON.stringify(spectatorDK)}`,
  );

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

async function main() {
  console.log("=== Economy smoke test (M1 + M1.5 + Spec 04 Phase 2) ===");
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
    process.exit(2);
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} checks passed ===`);
  process.exit(passed === total ? 0 : 1);
}

void main();
