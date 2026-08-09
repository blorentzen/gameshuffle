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
import { Alert, Button, Input } from "@empac/cascadeds";
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

type LobbyMode = "default" | "public" | "hidden";

export function PublicLobbySurface({
  initial,
  sessionId,
  initialPublicLobby,
}: {
  initial: ConnectionState | null;
  sessionId: string;
  /** Per-session override; null/undefined = inherit the account default. */
  initialPublicLobby: boolean | null;
}) {
  const globalDefault = initial?.publicLobbyEnabled !== false;
  const [mode, setMode] = useState<LobbyMode>(
    initialPublicLobby === null || initialPublicLobby === undefined ? "default" : initialPublicLobby ? "public" : "hidden",
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

  const setVisibility = async (next: LobbyMode) => {
    const prev = mode;
    setMode(next); // optimistic
    setWorking(true);
    setError(null);
    const publicLobby = next === "default" ? null : next === "public";
    try {
      const res = await fetch(`/api/sessions/${sessionId}/lobby-visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicLobby }),
      });
      if (!res.ok) {
        setMode(prev); // revert
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Couldn't update lobby visibility (${res.status}).`);
      }
    } catch (err) {
      setMode(prev);
      console.error(err);
      setError("Network error while updating lobby visibility.");
    }
    setWorking(false);
  };

  const effective = mode === "default" ? globalDefault : mode === "public";
  const options: { key: LobbyMode; label: string }[] = [
    { key: "default", label: `Default (${globalDefault ? "Public" : "Hidden"})` },
    { key: "public", label: "Public" },
    { key: "hidden", label: "Hidden" },
  ];

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Public Lobby</h2>
      <p className="hub-form__platform-disabled">
        Controls whether viewers can open a public page for <strong>this session</strong> (via{" "}
        <code>!gs-lobby</code>) showing your live roster + combos. <em>Default</em> follows your
        account setting; pick <em>Public</em> or <em>Hidden</em> to override it for this session.
      </p>
      <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={working}
            onClick={() => setVisibility(o.key)}
            style={{
              padding: "0.4rem 0.75rem", border: "none", cursor: working ? "default" : "pointer",
              fontSize: "var(--font-size-14)", fontWeight: 600,
              background: mode === o.key ? "var(--bg-primary, var(--primary-500))" : "var(--surface-default)",
              color: mode === o.key ? "var(--text-on-primary, #fff)" : "var(--text-secondary)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-8)" }}>
        This session is currently <strong>{effective ? "public" : "hidden"}</strong>.
      </p>
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
