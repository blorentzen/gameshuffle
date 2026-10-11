"use client";

/**
 * Reusable per-section surfaces for the session detail tabs.
 *
 * Originally the configure-page client surface (Phase 4B) — refactored
 * for the Phase B+ session-detail tab structure. Each surface
 * (PublicLobbySurface; the channel points reward moved to Streaming ▸ Setup ▸ Twitch) is now an independent named export so tab
 * components can compose them as needed.
 *
 * The Public Lobby toggle and Channel Points reward remain per-streamer
 * global; copy on each section makes that explicit per Phase 4B §2.4.
 */

import { useState } from "react";
import { Alert } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export interface ConnectionState {
  publicLobbyEnabled: boolean;
  channelPointsEnabled: boolean;
  channelPointCost: number;
  channelPointRewardId: string | null;
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
  const toast = useToast();

  if (!initial) {
    return (
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Lobby on your live page</h2>
        <p className="hub-form__platform-disabled">
          Connect Twitch first; the lobby fills from your chat.
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
      } else {
        toast.success("Saved");
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
    { key: "default", label: `Your default (${globalDefault ? "shown" : "hidden"})` },
    { key: "public", label: "Show it" },
    { key: "hidden", label: "Hide it" },
  ];

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Lobby on your live page</h2>
      <p className="hub-form__platform-disabled">
        Whether viewers can see who&rsquo;s in the lobby and what they rolled, for <strong>this stream</strong>.
        Your default is in Streaming ▸ Setup ▸ Twitch.
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
        For this stream it&rsquo;s <strong>{effective ? "shown" : "hidden"}</strong>.
      </p>
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </section>
  );
}
