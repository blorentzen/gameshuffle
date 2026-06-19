"use client";

/**
 * Clickable chrome pill rendering the streamer's current monthly
 * disbursement budget. Opens an educational modal explaining what
 * tokens are, what you can spend them on, and how the monthly
 * allowance refreshes.
 *
 * Data-fetching is upstream in the server wrapper
 * (`TokenAllowanceBadge`) — this client component only renders props.
 */

import { useState } from "react";
import { Modal } from "@empac/cascadeds";

interface Props {
  ceiling: number;
  consumed: number;
  remaining: number;
  periodMonth: string | null;
  seeded: boolean;
}

function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

export function TokenAllowanceChip({
  ceiling,
  consumed,
  remaining,
  periodMonth,
  seeded,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="hub-allowance hub-allowance--chrome"
        onClick={() => setOpen(true)}
        title={
          seeded
            ? `Monthly allowance: ${formatTokens(consumed)} of ${formatTokens(
                ceiling,
              )} used`
            : `Default monthly allowance: ${formatTokens(ceiling)}🪙. No awards yet this month.`
        }
        aria-label="View token allowance details"
      >
        <span className="hub-allowance__chip">
          <span className="hub-allowance__chip-amount">
            {formatTokens(remaining)}🪙
          </span>
          <span className="hub-allowance__chip-label">left this month</span>
        </span>
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Your token allowance"
        size="medium"
        primaryAction={{ label: "Got it", onClick: () => setOpen(false) }}
      >
        <div className="hub-allowance-modal">
          <section className="hub-allowance-modal__summary">
            <div className="hub-allowance-modal__big">
              <span className="hub-allowance-modal__big-amount">
                {formatTokens(remaining)}🪙
              </span>
              <span className="hub-allowance-modal__big-caption">
                {seeded
                  ? "available to disburse this month"
                  : "default monthly allowance — no awards yet"}
              </span>
            </div>
            <div className="hub-allowance-modal__breakdown">
              <span>
                <strong>{formatTokens(consumed)}</strong> consumed
              </span>
              <span>
                <strong>{formatTokens(ceiling)}</strong> ceiling
              </span>
              {periodMonth && (
                <span>Period {periodMonth.slice(0, 7)}</span>
              )}
            </div>
          </section>

          <section className="hub-allowance-modal__section">
            <h3>What are tokens?</h3>
            <p>
              GameShuffle tokens (🪙) are the community currency you
              hand out to viewers. They power prediction markets,
              bounties, and one-off awards — anything where you want
              to reward engagement during a stream.
            </p>
          </section>

          <section className="hub-allowance-modal__section">
            <h3>What can you do with them?</h3>
            <ul>
              <li>
                <strong>Award viewers directly.</strong> Use{" "}
                <code>!gs award @viewer N</code> in chat or the Markets
                tab to mint tokens straight into a viewer&rsquo;s
                balance — for clutch plays, mod work, or first-timer
                shout-outs.
              </li>
              <li>
                <strong>Open bounties.</strong> Set a token reward for
                a specific feat (&ldquo;first to top-3 a race&rdquo;).
                The first viewer to claim it gets paid out.
              </li>
              <li>
                <strong>Resolve prediction markets.</strong> When you
                close a market, the winning side&rsquo;s payouts come
                from the loser pot — but any house-funded bonuses
                draw from your allowance.
              </li>
            </ul>
          </section>

          <section className="hub-allowance-modal__section">
            <h3>How does the allowance work?</h3>
            <ul>
              <li>
                <strong>Monthly ceiling.</strong> You get{" "}
                {formatTokens(ceiling)}🪙 per UTC month. The pill in
                the top-right shows how much is left.
              </li>
              <li>
                <strong>Resets the 1st.</strong> Unspent tokens don&rsquo;t
                roll over — start of each month is a clean slate.
              </li>
              <li>
                <strong>Tier-scoped.</strong> Higher subscription tiers
                lift the ceiling; the default applies until your tier
                bumps it.
              </li>
              <li>
                <strong>Refunds restore budget.</strong> When you close
                a market with{" "}
                <em>Close + refund</em> or cancel a bounty, the tokens
                aren&rsquo;t consumed — your remaining count stays the
                same.
              </li>
            </ul>
          </section>

          <section className="hub-allowance-modal__section">
            <h3>Where to manage</h3>
            <p>
              Open any session and head to the <strong>Markets</strong>{" "}
              tab — that&rsquo;s where you open markets, post bounties,
              and award tokens manually. Chat commands cover the same
              actions during a live stream.
            </p>
          </section>
        </div>
      </Modal>
    </>
  );
}
