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
import { Alert, Button, Input, Select } from "@empac/cascadeds";
import { MarketTimer } from "@/components/markets/MarketTimer";

interface MarketState {
  id: string;
  status: "open" | "locked" | "settled" | "cancelled";
  variableType: "binary" | "placement" | "pickone" | "count";
  question: string;
  /** ISO timestamp for the auto-lock backstop. Drives the visible
   *  countdown so the streamer sees what their viewers see. */
  lockAt: string | null;
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

const LOCK_MINUTE_OPTIONS = [
  { value: "1", label: "1 min" },
  { value: "3", label: "3 min" },
  { value: "5", label: "5 min" },
];

export function MarketsAdminPanel({ streamerSlug }: Props) {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [bounties, setBounties] = useState<BountyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");
  const [lockMinutes, setLockMinutes] = useState<"1" | "3" | "5">("1");
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
      <h2 className="hub-markets__heading">Markets &amp; Bounties</h2>
      <p className="hub-markets__hint">
        Tactile controls for prediction markets and streamer bounties.
        Same actions as chat — both surfaces share state.
      </p>

      {feedback && (
        <Alert
          variant={feedbackKind === "ok" ? "success" : "error"}
          onClose={() => setFeedback(null)}
        >
          {feedback}
        </Alert>
      )}

      {/* ---- Market ---- */}
      <div className="hub-markets__group">
        <h3 className="hub-markets__group-heading">Market</h3>
        {!market && (
          <div className="hub-markets__actions">
            <label className="hub-markets__label hub-markets__label--lock-timer">
              Lock timer
              <Select
                options={LOCK_MINUTE_OPTIONS}
                value={lockMinutes}
                onChange={(v) =>
                  setLockMinutes(
                    (Array.isArray(v) ? v[0] : v) as "1" | "3" | "5",
                  )
                }
                disabled={busy}
                size="small"
                fullWidth
              />
            </label>
            <Button
              variant="primary"
              size="small"
              loading={busy}
              disabled={busy}
              onClick={async () => {
                if (
                  await callMarket({
                    action: "open",
                    lockMinutes: parseInt(lockMinutes, 10),
                  })
                ) {
                  note("ok", "Market opened.");
                }
              }}
            >
              Open market
            </Button>
          </div>
        )}

        {market && (
          <p className="hub-markets__market-question">
            <strong>Active:</strong> {market.question}{" "}
            <span className={`hub-markets__status hub-markets__status--${market.status}`}>
              {market.status}
            </span>
            {market.status === "open" && (
              <>
                {" "}
                <MarketTimer to={market.lockAt} label="Locks in" />
              </>
            )}
          </p>
        )}

        {market && market.status === "open" && (
          <div className="hub-markets__actions">
            <Button
              variant="primary"
              size="small"
              loading={busy}
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "lock" })) {
                  note("ok", "Market locked.");
                }
              }}
            >
              Lock now
            </Button>
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "close" })) {
                  note("ok", "Market closed — bets refunded.");
                }
              }}
            >
              Close + refund
            </Button>
          </div>
        )}

        {market && market.status === "locked" && (
          <div className="hub-markets__actions">
            <label className="hub-markets__label hub-markets__label--wide">
              Resolution value
              <Input
                type="text"
                value={resolveValue}
                onChange={(e) => setResolveValue(e.target.value)}
                placeholder={
                  market.variableType === "placement" ? "e.g. 1" : "e.g. red"
                }
                disabled={busy}
                size="small"
                fullWidth
              />
            </label>
            <Button
              variant="primary"
              size="small"
              loading={busy}
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
            </Button>
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={async () => {
                if (await callMarket({ action: "close" })) {
                  note("ok", "Market closed — bets refunded.");
                }
              }}
            >
              Close + refund
            </Button>
          </div>
        )}
      </div>

      {/* ---- Bounty ---- */}
      <div className="hub-markets__group">
        <h3 className="hub-markets__group-heading">Bounty</h3>
        <div className="hub-markets__actions">
          <label className="hub-markets__label">
            Amount
            <Input
              type="number"
              min={1}
              value={bountyAmount}
              onChange={(e) => setBountyAmount(e.target.value)}
              placeholder="200"
              disabled={busy}
              size="small"
            />
          </label>
          <label className="hub-markets__label hub-markets__label--wide">
            Description
            <Input
              type="text"
              value={bountyDesc}
              onChange={(e) => setBountyDesc(e.target.value)}
              placeholder="First viewer to finish top 3"
              disabled={busy}
              size="small"
              fullWidth
            />
          </label>
          <Button
            variant="primary"
            size="small"
            loading={busy}
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
          </Button>
        </div>

        {bounties.length > 0 && (
          <ul className="hub-markets__bounty-list">
            {bounties.map((b) => (
              <li key={b.id} className="hub-markets__bounty-row">
                <span className="hub-markets__bounty-amount">
                  {b.amount.toLocaleString("en-US")}🪙
                </span>
                <span className="hub-markets__bounty-desc">{b.description}</span>
                <Input
                  type="text"
                  value={awardLogin[b.id] ?? ""}
                  onChange={(e) =>
                    setAwardLogin((prev) => ({ ...prev, [b.id]: e.target.value }))
                  }
                  placeholder="@winner"
                  disabled={busy}
                  size="small"
                  fullWidth
                />
                <Button
                  variant="primary"
                  size="small"
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
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  disabled={busy}
                  onClick={async () => {
                    if (await callBounty({ action: "cancel", bountyId: b.id })) {
                      note("ok", "Bounty cancelled.");
                    }
                  }}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
