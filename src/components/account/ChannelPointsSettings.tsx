"use client";

/**
 * Streaming ▸ Setup ▸ Twitch: the channel points reward and whether the
 * lobby shows on the live page. Both are channel-wide (one reward for every
 * stream), so they live here, not inside a session (moved from the hub's
 * Redemptions tab, 2026-10-10). A single stream can still hide or show its
 * lobby from its own Settings.
 */

import { useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function ChannelPointsSettings({ enabled, cost: initialCost, onChanged }: {
  enabled: boolean;
  cost: number;
  /** Called after a change so the parent can reload the connection. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [cost, setCost] = useState(initialCost || 500);
  const [working, setWorking] = useState(false);

  const call = async (action: "enable" | "disable" | "update_cost") => {
    setWorking(true);
    const res = await fetch("/api/twitch/channel-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, cost }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setWorking(false);
    if (!res?.ok) {
      toast.error(body.message || "Couldn't update the reward. Try again.");
      return;
    }
    toast.success(action === "enable" ? "Reward added to your channel" : action === "disable" ? "Reward removed" : "Cost updated");
    onChanged();
  };

  return (
    <div className="account-card">
      <h2>Channel points</h2>
      <p className="account-card__hint">
        A &ldquo;Reroll the Streamer&rsquo;s Pick&rdquo; reward on your channel. When a viewer redeems it, the bot rolls you a new pick,
        posts it in chat and your overlay shows it. One reward for all your streams; points are refunded if nothing is running.
      </p>
      <div className="channel-points">
        <div className="channel-points__cost">
          <Input
            floatingLabel="Cost in points"
            type="number"
            min={1}
            max={1000000}
            value={String(cost)}
            onChange={(e) => setCost(Math.max(1, parseInt(e.target.value || "1", 10)))}
          />
        </div>
        {enabled ? (
          <>
            <Button variant="secondary" onClick={() => void call("update_cost")} disabled={working || cost === initialCost}>Update cost</Button>
            <Button variant="ghost" onClick={() => void call("disable")} disabled={working}>Remove the reward</Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => void call("enable")} disabled={working}>Add the reward</Button>
        )}
      </div>
      {enabled && <p className="account-card__hint">On your channel now at {initialCost} points.</p>}
    </div>
  );
}

export function LiveLobbySetting({ enabled: initial }: { enabled: boolean }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial);
  const [working, setWorking] = useState(false);

  const save = async (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    setWorking(true);
    const res = await fetch("/api/twitch/lobby/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setWorking(false);
    if (!res?.ok) {
      setEnabled(prev);
      toast.error("Couldn't save that. Try again.");
      return;
    }
    toast.success("Saved");
  };

  return (
    <div className="account-card">
      <div className="account-card__head">
        <h2 className="account-card__title">Show the lobby on your live page</h2>
        <Switch aria-label="Show the lobby on your live page" checked={enabled} disabled={working} onChange={(e) => void save(e.target.checked)} />
      </div>
      <p className="account-card__hint">
        Who&rsquo;s in the lobby and what they rolled, on your live page&rsquo;s Lobby tab. When the list is too long for chat,
        <code>!gs-lobby</code>{" "}links there. You can hide or show it for one stream from that stream&rsquo;s Settings.
      </p>
    </div>
  );
}
