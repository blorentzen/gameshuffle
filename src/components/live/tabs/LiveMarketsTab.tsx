"use client";

/**
 * Markets & Bounties tab — viewer-facing surface for the prediction
 * market + bounty system.
 *
 * Polls `/api/live/<slug>/market` every 5s for the active market +
 * pools + spectator tally, and `/api/live/<slug>/bounties` every
 * 10s for the open bounty list. Authenticated viewers can place
 * bets via the existing POST endpoint; unauthenticated viewers see
 * a sign-in CTA.
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
import type { MarketPool } from "@/lib/economy/markets/lifecycle";
import type { SpectatorTally } from "@/lib/economy/markets/spectator";

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
  onSignInClick: () => void;
}

const MARKET_POLL_MS = 5_000;
const BOUNTY_POLL_MS = 10_000;

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

  // Initial + interval refresh for markets. Pauses while hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void refreshMarket(), MARKET_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshMarket();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") {
      void refreshMarket();
      start();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshMarket]);

  // Bounty refresh — same lifecycle, slower cadence.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void refreshBounties(), BOUNTY_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshBounties();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") {
      void refreshBounties();
      start();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
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
          message: `Picked ${outcome.label} — spectator mode (no stake).`,
        });
      } else {
        setActionStatus({
          kind: "ok",
          message: `Bet ${amount}🪙 on ${outcome.label}. Balance: ${body.balance ?? "—"}🪙.`,
        });
      }
      setExpandedOutcome(null);
      void refreshMarket();
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
              <span
                className={`live-markets__status live-markets__status--${market.status}`}
              >
                {market.status === "open" ? "Open for bets" : market.status}
              </span>
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
                              {" "}You bet {viewerState?.betAmount ?? 0}🪙
                            </span>
                          )}
                          {isMyPick && (
                            <span className="live-markets__badge live-markets__badge--mine">
                              {" "}You picked (spectator)
                            </span>
                          )}
                        </p>
                        <p className="live-markets__outcome-stats">
                          Pool: {pool ? pool.total.toLocaleString("en-US") : 0}🪙{" "}
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
                  {b.amount.toLocaleString("en-US")}🪙
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

