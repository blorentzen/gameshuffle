"use client";

/**
 * Host-only tactile control surface for the prediction market +
 * bounty system. Used by the session hub at /hub/sessions/[slug] —
 * the streamer drives markets and bounties without going to chat.
 *
 * Polls /api/live/<slug>/market and /api/live/<slug>/bounties for
 * current state. Writes go to the admin endpoints which re-verify
 * ownership server-side.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface MarketState {
  id: string;
  status: "open" | "locked" | "settled" | "cancelled";
  variableType: "binary" | "placement" | "pickone" | "count";
  question: string;
}

interface BountyRow {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface Props {
  streamerSlug: string;
}

const POLL_MS = 5_000;

export function MarketsAdminPanel({ streamerSlug }: Props) {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [bounties, setBounties] = useState<BountyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");
  const [lockMinutes, setLockMinutes] = useState<1 | 3 | 5>(1);
  const [resolveValue, setResolveValue] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [bountyDesc, setBountyDesc] = useState("");
  const [awardLogin, setAwardLogin] = useState<Record<string, string>>({});
  const ctlMarket = useRef<AbortController | null>(null);
  const ctlBounty = useRef<AbortController | null>(null);

  const note = (kind: "ok" | "error", msg: string) => {
    setFeedbackKind(kind);
    setFeedback(msg);
  };

  const refreshMarket = useCallback(async () => {
    ctlMarket.current?.abort();
    const ac = new AbortController();
    ctlMarket.current = ac;
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/market`,
        { signal: ac.signal, cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { market: MarketState | null };
      setMarket(body.market);
    } catch {
      // silent
    }
  }, [streamerSlug]);

  const refreshBounties = useCallback(async () => {
    ctlBounty.current?.abort();
    const ac = new AbortController();
    ctlBounty.current = ac;
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/bounties`,
        { signal: ac.signal, cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { bounties: BountyRow[] };
      setBounties(body.bounties ?? []);
    } catch {
      // silent
    }
  }, [streamerSlug]);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      void refreshMarket();
      void refreshBounties();
    };
    tick();
    t = setInterval(tick, POLL_MS);
    return () => {
      if (t) clearInterval(t);
    };
  }, [refreshMarket, refreshBounties]);

  const callMarket = async (
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/market/admin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        note("error", json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      await refreshMarket();
      await refreshBounties();
      return true;
    } catch {
      note("error", "Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const callBounty = async (
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamerSlug)}/bounty/admin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        note("error", json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      await refreshBounties();
      return true;
    } catch {
      note("error", "Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hub-markets">
      <h2 className="hub-markets__heading">Markets & Bounties</h2>
      <p className="hub-markets__hint">
        Tactile controls for prediction markets and streamer bounties.
        Same actions as chat — both surfaces share state.
      </p>

      {feedback && (
        <p
          className={`hub-markets__feedback hub-markets__feedback--${feedbackKind}`}
          role="status"
        >
          {feedback}
        </p>
      )}

      {/* ---- Market ---- */}
      <div className="hub-markets__group">
        <h3 className="hub-markets__group-heading">Market</h3>
        {!market && (
          <div className="hub-markets__actions">
            <label className="hub-markets__label">
              Lock timer
              <select
                value={lockMinutes}
                onChange={(e) =>
                  setLockMinutes(Number(e.target.value) as 1 | 3 | 5)
                }
                disabled={busy}
              >
                <option value={1}>1 min</option>
                <option value={3}>3 min</option>
                <option value={5}>5 min</option>
              </select>
            </label>
            <button
              type="button"
              className="hub-markets__btn"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "open", lockMinutes })) {
                  note("ok", "Market opened.");
                }
              }}
            >
              Open market
            </button>
          </div>
        )}

        {market && (
          <p className="hub-markets__market-question">
            <strong>Active:</strong> {market.question}{" "}
            <span className={`hub-markets__status hub-markets__status--${market.status}`}>
              {market.status}
            </span>
          </p>
        )}

        {market && market.status === "open" && (
          <div className="hub-markets__actions">
            <button
              type="button"
              className="hub-markets__btn"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "lock" })) {
                  note("ok", "Market locked.");
                }
              }}
            >
              Lock now
            </button>
            <button
              type="button"
              className="hub-markets__btn hub-markets__btn--danger"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "close" })) {
                  note("ok", "Market closed — bets refunded.");
                }
              }}
            >
              Close + refund
            </button>
          </div>
        )}

        {market && market.status === "locked" && (
          <div className="hub-markets__actions">
            <label className="hub-markets__label">
              Resolution value
              <input
                type="text"
                value={resolveValue}
                onChange={(e) => setResolveValue(e.target.value)}
                placeholder={
                  market.variableType === "placement" ? "e.g. 1" : "e.g. red"
                }
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className="hub-markets__btn"
              disabled={busy || !resolveValue.trim()}
              onClick={async () => {
                if (
                  await callMarket({
                    action: "resolve",
                    value: resolveValue.trim(),
                  })
                ) {
                  note("ok", `Resolved with "${resolveValue.trim()}".`);
                  setResolveValue("");
                }
              }}
            >
              Resolve
            </button>
            <button
              type="button"
              className="hub-markets__btn hub-markets__btn--danger"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "close" })) {
                  note("ok", "Market closed — bets refunded.");
                }
              }}
            >
              Close + refund
            </button>
          </div>
        )}
      </div>

      {/* ---- Bounty ---- */}
      <div className="hub-markets__group">
        <h3 className="hub-markets__group-heading">Bounty</h3>
        <div className="hub-markets__actions">
          <label className="hub-markets__label">
            Amount
            <input
              type="number"
              min={1}
              value={bountyAmount}
              onChange={(e) => setBountyAmount(e.target.value)}
              placeholder="200"
              disabled={busy}
            />
          </label>
          <label className="hub-markets__label hub-markets__label--wide">
            Description
            <input
              type="text"
              value={bountyDesc}
              onChange={(e) => setBountyDesc(e.target.value)}
              placeholder="First viewer to finish top 3"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="hub-markets__btn"
            disabled={busy || !bountyAmount || !bountyDesc.trim()}
            onClick={async () => {
              const amt = parseInt(bountyAmount, 10);
              if (!Number.isInteger(amt) || amt <= 0) {
                note("error", "Amount must be a positive integer.");
                return;
              }
              if (
                await callBounty({
                  action: "open",
                  amount: amt,
                  description: bountyDesc.trim(),
                })
              ) {
                note("ok", "Bounty opened.");
                setBountyAmount("");
                setBountyDesc("");
              }
            }}
          >
            Open bounty
          </button>
        </div>

        {bounties.length > 0 && (
          <ul className="hub-markets__bounty-list">
            {bounties.map((b) => (
              <li key={b.id} className="hub-markets__bounty-row">
                <span className="hub-markets__bounty-amount">
                  {b.amount.toLocaleString("en-US")}🪙
                </span>
                <span className="hub-markets__bounty-desc">{b.description}</span>
                <input
                  type="text"
                  className="hub-markets__bounty-target"
                  placeholder="@winner"
                  value={awardLogin[b.id] ?? ""}
                  onChange={(e) =>
                    setAwardLogin((prev) => ({ ...prev, [b.id]: e.target.value }))
                  }
                  disabled={busy}
                />
                <button
                  type="button"
                  className="hub-markets__btn hub-markets__btn--small"
                  disabled={busy || !(awardLogin[b.id] ?? "").trim()}
                  onClick={async () => {
                    if (
                      await callBounty({
                        action: "award",
                        bountyId: b.id,
                        targetTwitchLogin: awardLogin[b.id]?.trim(),
                      })
                    ) {
                      note("ok", "Bounty awarded.");
                      setAwardLogin((prev) => {
                        const next = { ...prev };
                        delete next[b.id];
                        return next;
                      });
                    }
                  }}
                >
                  Award
                </button>
                <button
                  type="button"
                  className="hub-markets__btn hub-markets__btn--small hub-markets__btn--danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await callBounty({ action: "cancel", bountyId: b.id })) {
                      note("ok", "Bounty cancelled.");
                    }
                  }}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
