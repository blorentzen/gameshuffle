"use client";

/**
 * Reusable per-section surfaces for the session detail tabs.
 *
 * Originally the configure-page client surface (Phase 4B) — refactored
 * for the Phase B+ session-detail tab structure. Each surface
 * (ModulesSurface / RaceRandomizerSection / PublicLobbySurface /
 * ChannelPointsSurface) is now an independent named export so tab
 * components can compose them as needed.
 *
 * The Public Lobby toggle and Channel Points reward remain per-streamer
 * global; copy on each section makes that explicit per Phase 4B §2.4.
 */

import { useState } from "react";
import { Alert, Button, Input, Switch } from "@empac/cascadeds";
import { ModulesSection } from "@/components/account/ModulesSection";

export interface ConnectionState {
  publicLobbyEnabled: boolean;
  channelPointsEnabled: boolean;
  channelPointCost: number;
  channelPointRewardId: string | null;
}

export function ModulesSurface() {
  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Modules</h2>
      <p className="hub-form__platform-disabled">
        Toggle and configure modules for this session. Picks &amp; bans rules,
        kart randomizer settings, and any future module-specific settings live
        here.
      </p>
      <ModulesSection />
    </section>
  );
}

export function PublicLobbySurface({
  initial,
}: {
  initial: ConnectionState | null;
}) {
  const [enabled, setEnabled] = useState<boolean>(
    initial?.publicLobbyEnabled !== false
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initial) {
    return (
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Public Lobby</h2>
        <p className="hub-form__platform-disabled">
          Twitch isn&rsquo;t connected — public lobby visibility requires the
          Twitch streamer integration.
        </p>
      </section>
    );
  }

  const toggle = async () => {
    const next = !enabled;
    setWorking(true);
    setError(null);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/twitch/lobby/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Couldn't update lobby visibility (${res.status}).`);
      }
    } catch (err) {
      setEnabled(!next);
      console.error(err);
      setError("Network error while updating lobby visibility.");
    }
    setWorking(false);
  };

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Public Lobby</h2>
      <p className="hub-form__platform-disabled">
        Lobby visibility is shared across all your sessions. Changes apply
        immediately. When enabled, viewers can click <code>!gs-lobby</code> in
        chat to open a public page showing your live participant roster and
        combos.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)" }}>
        <Switch checked={enabled} onChange={toggle} disabled={working} />
        <span style={{ fontSize: "var(--font-size-14)" }}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </section>
  );
}

export function ChannelPointsSurface({
  initial,
}: {
  initial: ConnectionState | null;
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cost, setCost] = useState<number>(initial?.channelPointCost ?? 500);
  const enabled = !!initial?.channelPointsEnabled;
  const rewardId = initial?.channelPointRewardId ?? null;

  if (!initial) {
    return (
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Channel Points</h2>
        <p className="hub-form__platform-disabled">
          Twitch isn&rsquo;t connected — channel point rewards require the
          Twitch streamer integration.
        </p>
      </section>
    );
  }

  const callApi = async (action: "enable" | "disable" | "update_cost") => {
    setWorking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/twitch/channel-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cost }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || `Failed: ${body.error || res.statusText}`);
      } else {
        // Force a reload so the page-level server fetch picks up the
        // updated reward state — same pattern used on the old surface.
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setMessage("Network error.");
    }
    setWorking(false);
  };

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Channel Points</h2>
      <p className="hub-form__platform-disabled">
        Channel point reward is shared across all your sessions. Changes apply
        immediately. Viewers spend points to <strong>reroll your combo</strong>{" "}
        — bot posts the new combo in chat, overlay animates, and{" "}
        <code>!gs-mycombo</code> returns the fresh roll.
      </p>
      {enabled ? (
        <>
          <p style={{ marginBottom: "var(--spacing-12)" }}>
            <strong>Active.</strong> Current cost:{" "}
            <strong>{initial.channelPointCost}</strong> points
            {rewardId ? <> · reward id <code>{rewardId.slice(0, 8)}…</code></> : null}.
          </p>
          <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: "var(--font-size-12)" }}>Cost:</label>
            <div style={{ width: 120 }}>
              <Input
                type="number"
                min={1}
                max={1000000}
                value={String(cost)}
                onChange={(e) =>
                  setCost(Math.max(1, parseInt(e.target.value || "1", 10)))
                }
                fullWidth
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => callApi("update_cost")}
              disabled={working || cost === initial.channelPointCost}
            >
              {working ? "Working…" : "Update cost"}
            </Button>
            <Button
              variant="danger"
              onClick={() => callApi("disable")}
              disabled={working}
            >
              Disable
            </Button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: "var(--font-size-12)" }}>Cost (points):</label>
          <div style={{ width: 120 }}>
            <Input
              type="number"
              min={1}
              max={1000000}
              value={String(cost)}
              onChange={(e) =>
                setCost(Math.max(1, parseInt(e.target.value || "1", 10)))
              }
              fullWidth
            />
          </div>
          <Button
            variant="primary"
            onClick={() => callApi("enable")}
            disabled={working}
          >
            {working ? "Enabling…" : "Enable channel points"}
          </Button>
        </div>
      )}
      {message && (
        <Alert variant="error" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}
    </section>
  );
}
