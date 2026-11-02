"use client";

/**
 * Markets & Bounties tab — viewer-facing surface for the prediction
 * market + bounty system.
 *
 * Refreshed while the tab is visible: the market every 10s while one is
 * open or locked (60s otherwise), bounties every 60s, and both straight
 * away when the tab comes back. (The market tables aren't in the
 * realtime publication, so subscriptions never fired.)
 *
 * Authenticated viewers can place bets via the POST endpoint;
 * unauthenticated viewers see a sign-in CTA.
 *
 * Compliance: the POST endpoint resolves the caller's region and
 * routes to either a real bet (full mode) or a spectator pick
 * (restricted region). The UI surfaces the result message either
 * way; the GET response's `viewerState` tells the UI which path was
 * taken on a previous interaction.
 *
 * Host admin controls (open / lock / close / resolve, bounty
 * lifecycle) layer in via a separate component when the viewer is
 * the streamer — see LiveMarketsAdminPanel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { everyVisible } from "@/lib/hooks/everyVisible";
import type { MarketPool } from "@/lib/economy/markets/lifecycle";
import type { SpectatorTally } from "@/lib/economy/markets/spectator";
import { MarketTimer } from "@/components/markets/MarketTimer";
import { useViewerBalance, refreshViewerBalance } from "@/lib/economy/useViewerBalance";
import { TokenIcon } from "@/components/TokenIcon";

interface OutcomeRow {
  id: string;
  optionKey: string;
  label: string;
  isWinner: boolean | null;
}

interface MarketState {
  id: string;
  status: "open" | "locked" | "settled" | "cancelled";
  gameKey: string;
  variableType: "binary" | "placement" | "pickone" | "count";
  question: string;
  subject: string | null;
  openedAt: string;
  lockAt: string | null;
  lockedAt: string | null;
}

interface ViewerState {
  identityId: string | null;
  betOutcomeId: string | null;
  betAmount: number | null;
  spectatorOutcomeId: string | null;
}

interface MarketResponse {
  market: MarketState | null;
  outcomes?: OutcomeRow[];
  pools?: MarketPool[];
  spectatorTally?: SpectatorTally[];
  viewerState?: ViewerState | null;
  reason?: string;
}

interface BountyRow {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface Props {
  streamerSlug: string;
  isAuthenticated: boolean;
  /** True when the signed-in viewer IS the streamer of this slug.
   *  Unlocks the host admin panel (open/lock/close/resolve markets,
   *  bounty controls). Server-side endpoints re-verify ownership;
   *  this prop only gates UI visibility. */
  isHost: boolean;
  /** Streamer's community id (null before any economy interaction). Unused since the tab polls. */
  communityId?: string | null;
  onSignInClick: () => void;
}

const MARKET_LIVE_MS = 10_000;
const MARKET_IDLE_MS = 60_000;
const BOUNTY_POLL_MS = 60_000;

export function LiveMarketsTab({
  streamerSlug,
  isAuthenticated,
  isHost,
  onSignInClick,
}: Props) {
  const [marketResp, setMarketResp] = useState<MarketResponse | null>(null);
  const [bounties, setBounties] = useState<BountyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{
    kind: "ok" | "info" | "error";
    message: string;
  } | null>(null);
  const [expandedOutcome, setExpandedOutcome] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<string>("100");
  const [submitting, setSubmitting] = useState(false);
  const { activated: balanceActivated, balance: viewerBalance } = useViewerBalance();
  const marketCtl = useRef<AbortController | null>(null);
  const bountyCtl = useRef<AbortController | null>(null);

  const refreshMarket = useCallback(async () => {
    marketCtl.current?.abort();
    const ac = new AbortController();
    marketCtl.current = ac;
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/market`,
        { signal: ac.signal, cache: "no-store" },
      );
      if (!res.ok) {
        setError(`Market refresh failed (${res.status}).`);
        return;
      }
      const body = (await res.json()) as MarketResponse;
      setMarketResp(body);
      setError(null);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError("Couldn't reach the markets API.");
    }
  }, [streamerSlug]);

  const refreshBounties = useCallback(async () => {
    bountyCtl.current?.abort();
    const ac = new AbortController();
    bountyCtl.current = ac;
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/bounties`,
        { signal: ac.signal, cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { bounties: BountyRow[] };
      setBounties(body.bounties ?? []);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
    }
  }, [streamerSlug]);

  // Refresh while the tab is visible: every 10s while a prediction is open or locked (the odds move
  // with each bet), else once a minute. These tables were never added to the realtime publication,
  // so the subscriptions that used to sit here never fired and the 60s safety poll was the only
  // refresh viewers got.
  const marketLive = !!marketResp?.market;
  useEffect(() => {
    void refreshMarket();
    return everyVisible(() => void refreshMarket(), marketLive ? MARKET_LIVE_MS : MARKET_IDLE_MS);
  }, [refreshMarket, marketLive]);

  useEffect(() => {
    void refreshBounties();
    return everyVisible(() => void refreshBounties(), BOUNTY_POLL_MS);
  }, [refreshBounties]);

  const handleBet = async (outcome: OutcomeRow) => {
    if (!isAuthenticated) {
      onSignInClick();
      return;
    }
    const market = marketResp?.market;
    if (!market) return;
    const amount = parseInt(betAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setActionStatus({
        kind: "error",
        message: "Enter a positive integer amount.",
      });
      return;
    }
    setSubmitting(true);
    setActionStatus(null);
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/bet`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: market.id,
            optionKey: outcome.optionKey,
            amount,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mode?: "full" | "spectator";
        error?: string;
        message?: string;
        balance?: number;
      };
      if (!res.ok || !body.ok) {
        const copy = body.message ?? body.error ?? `Request failed (${res.status}).`;
        setActionStatus({ kind: "error", message: copy });
        return;
      }
      if (body.mode === "spectator") {
        setActionStatus({
          kind: "info",
          message: `Picked ${outcome.label}: spectator mode (no stake).`,
        });
      } else {
        setActionStatus({
          kind: "ok",
          message: `Bet ${amount}🪙 on ${outcome.label}. Balance: ${body.balance ?? "-"}🪙.`,
        });
      }
      setExpandedOutcome(null);
      void refreshMarket();
      refreshViewerBalance();
    } catch {
      setActionStatus({ kind: "error", message: "Network error placing bet." });
    } finally {
      setSubmitting(false);
    }
  };

  const market = marketResp?.market ?? null;
  const outcomes = marketResp?.outcomes ?? [];
  const pools = marketResp?.pools ?? [];
  const spectatorTally = marketResp?.spectatorTally ?? [];
  const viewerState = marketResp?.viewerState ?? null;
  const callerLockedIn = !!(
    viewerState?.betOutcomeId || viewerState?.spectatorOutcomeId
  );

  return (
    <div className="live-markets">
      <div className="live-markets__intro">
        <p>
          Prediction markets + streamer bounties. Restricted regions
          participate in markets as spectators (pick + badge, no stake).
          The streamer&rsquo;s balance is never affected by viewer bets.
        </p>
        <TokensExplainerCallout />
        <RestrictedRegionsCallout />
      </div>

      {error && (
        <p className="live-markets__error" role="alert">
          {error}
        </p>
      )}

      {isHost && (
        <p className="live-markets__host-redirect">
          You&rsquo;re viewing your own /live page. Host controls (open /
          lock / resolve markets, open / award / cancel bounties) live in
          your{" "}
          <a href="/hub" className="live-markets__host-redirect-link">
            session hub
          </a>
          .
        </p>
      )}

      {/* -------------------- Markets section -------------------- */}
      <section className="live-markets__section">
        <h3 className="live-markets__heading">Active Market</h3>
        {!market ? (
          <div className="live-markets__empty">
            <p className="live-markets__empty-headline">
              No market open right now.
            </p>
            <p className="live-markets__empty-sub">
              The streamer can open one with <code>!gs market open</code> or
              the hub controls.
            </p>
          </div>
        ) : (
          <article className="live-markets__market">
            <header className="live-markets__market-header">
              <h4 className="live-markets__question">{market.question}</h4>
              <div className="live-markets__market-status">
                {market.status === "open" && (
                  <MarketTimer to={market.lockAt} label="Locks in" />
                )}
                <span
                  className={`live-markets__status live-markets__status--${market.status}`}
                >
                  {market.status === "open" ? "Open for bets" : market.status}
                </span>
              </div>
            </header>

            <ul className="live-markets__outcomes">
              {outcomes.map((o) => {
                const pool = pools.find((p) => p.outcomeId === o.id);
                const spec = spectatorTally.find((s) => s.outcomeId === o.id);
                const isMyBet = viewerState?.betOutcomeId === o.id;
                const isMyPick = viewerState?.spectatorOutcomeId === o.id;
                const expanded = expandedOutcome === o.id;
                return (
                  <li key={o.id} className="live-markets__outcome">
                    <div className="live-markets__outcome-row">
                      <div className="live-markets__outcome-meta">
                        <p className="live-markets__outcome-label">
                          {o.label}
                          {o.isWinner === true && (
                            <span className="live-markets__badge live-markets__badge--win">
                              {" "}Winner
                            </span>
                          )}
                          {isMyBet && (
                            <span className="live-markets__badge live-markets__badge--mine">
                              {" "}You bet {viewerState?.betAmount ?? 0}<TokenIcon size={14} />
                            </span>
                          )}
                          {isMyPick && (
                            <span className="live-markets__badge live-markets__badge--mine">
                              {" "}You picked (spectator)
                            </span>
                          )}
                        </p>
                        <p className="live-markets__outcome-stats">
                          Pool: {pool ? pool.total.toLocaleString("en-US") : 0}<TokenIcon size={14} />{" "}
                          ({pool ? pool.bettorCount : 0} bettor
                          {pool && pool.bettorCount === 1 ? "" : "s"}) ·{" "}
                          {spec ? spec.pickerCount : 0} spectator pick
                          {spec && spec.pickerCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {market.status === "open" && !callerLockedIn && (
                        <button
                          type="button"
                          className="live-markets__bet-btn"
                          onClick={() =>
                            setExpandedOutcome(expanded ? null : o.id)
                          }
                          disabled={submitting}
                        >
                          {expanded ? "Cancel" : "Bet"}
                        </button>
                      )}
                    </div>
                    {expanded && market.status === "open" && (
                      <div className="live-markets__bet-form">
                        <label className="live-markets__bet-label">
                          Amount
                          <input
                            type="number"
                            min={1}
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                            className="live-markets__bet-input"
                            disabled={submitting}
                          />
                        </label>
                        {balanceActivated && viewerBalance !== null && (
                          <p className="live-markets__bet-balance">
                            You have {viewerBalance.toLocaleString()}<TokenIcon size={14} /> available
                            {parseInt(betAmount, 10) > viewerBalance && (
                              <span className="live-markets__bet-over">
                                {" "}(more than your balance)
                              </span>
                            )}
                          </p>
                        )}
                        <button
                          type="button"
                          className="live-markets__bet-confirm"
                          onClick={() => void handleBet(o)}
                          disabled={submitting}
                        >
                          {submitting ? "Submitting…" : `Confirm ${o.label}`}
                        </button>
                        <p className="live-markets__bet-hint">
                          Restricted regions: amount is ignored, pick is
                          recorded as spectator only.
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {actionStatus && (
              <p
                className={`live-markets__action-status live-markets__action-status--${actionStatus.kind}`}
                role="status"
              >
                {actionStatus.message}
              </p>
            )}

            {!isAuthenticated && market.status === "open" && (
              <p className="live-markets__signin-cta">
                <button
                  type="button"
                  className="live-markets__signin-btn"
                  onClick={onSignInClick}
                >
                  Sign in with Twitch to bet
                </button>
              </p>
            )}
          </article>
        )}
      </section>

      {/* -------------------- Bounties section ------------------- */}
      <section className="live-markets__section">
        <h3 className="live-markets__heading">Open Bounties</h3>
        {bounties.length === 0 ? (
          <p className="live-markets__empty-sub">
            No bounties active. The streamer can open one with{" "}
            <code>!gs bounty &lt;amount&gt; &lt;description&gt;</code>.
          </p>
        ) : (
          <ul className="live-markets__bounties">
            {bounties.map((b) => (
              <li key={b.id} className="live-markets__bounty">
                <span className="live-markets__bounty-amount">
                  {b.amount.toLocaleString("en-US")}<TokenIcon size={14} />
                </span>
                <span className="live-markets__bounty-desc">{b.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokensExplainerCallout
// ---------------------------------------------------------------------------

/**
 * "What are GS tokens?" disclosure. First-time viewers (and anyone
 * unfamiliar with the economy) tap this to see how tokens work, what
 * they're for, and how to earn more — same content beat as the
 * chat-side welcome message, expanded.
 */
function TokensExplainerCallout() {
  return (
    <details className="live-markets__explainer">
      <summary>How GS tokens work</summary>
      <div className="live-markets__explainer-body">
        <p>
          GameShuffle tokens (<TokenIcon size={14} />) are the community currency for this
          stream. Use them to back predictions, win bounties, and
          stack up on the leaderboard.
        </p>
        <ul>
          <li>
            <strong>Starting grant.</strong> Brand-new viewers get a
            one-time starting balance the first time they interact
            with this stream (via chat command OR a web bet).
          </li>
          <li>
            <strong>Bet on markets.</strong> When the streamer opens a
            market, pick an outcome here or type{" "}
            <code>!bet &lt;option&gt; &lt;amount&gt;</code> in chat.
            Winners split the losing-side pool pro-rata.
          </li>
          <li>
            <strong>Earn from awards + bounties.</strong>{" "}The streamer
            can hand out tokens for great plays or post a bounty with
            a condition (&ldquo;first to finish top 3&rdquo;).
          </li>
          <li>
            <strong>Check your balance.</strong> Type{" "}
            <code>!tokens</code> in chat any time. Your balance is
            per-community.
          </li>
        </ul>
        <p>
          The streamer never receives your tokens. Pools move between
          viewers only.
        </p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// RestrictedRegionsCallout
// ---------------------------------------------------------------------------

interface RestrictedRegion {
  regionCode: string;
  behavior: "spectator" | "unavailable" | "full";
  displayName: string | null;
}

/**
 * Surfaces the live restricted-regions list so viewers can see
 * whether their region falls under spectator-only participation
 * before they try to place a bet. Pulled from the same
 * `gs_compliance_rules` table the bet endpoint consults — single
 * source of truth.
 */
function RestrictedRegionsCallout() {
  const [regions, setRegions] = useState<RestrictedRegion[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/economy/compliance-regions", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; regions?: RestrictedRegion[] }) => {
        if (cancelled) return;
        if (body.ok && Array.isArray(body.regions)) {
          setRegions(body.regions);
        }
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!regions || regions.length === 0) return null;

  return (
    <details
      className="live-markets__regions"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        Which regions are restricted? ({regions.length} listed)
      </summary>
      <p className="live-markets__regions-body">
        Viewers from these regions participate in spectator mode (pick
        an outcome, no tokens at stake). The list is enforced
        platform-wide. Streamers can&rsquo;t override it for their
        stream:
      </p>
      <ul className="live-markets__regions-list">
        {regions.map((r) => (
          <li key={r.regionCode}>
            {r.displayName ?? r.regionCode}
            {r.behavior === "unavailable" && (
              <span> (fully unavailable)</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

