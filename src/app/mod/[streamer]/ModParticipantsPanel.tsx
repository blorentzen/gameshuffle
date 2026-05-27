"use client";

/**
 * Realtime active-participants list with per-row Kick — the
 * operational equivalent of `!gs-kick` for mods who aren't in the
 * Twitch chat right now.
 *
 * Mirrors the realtime+polling-fallback pattern of
 * `<RealtimeParticipantsList />` so the panel stays fresh as viewers
 * join/leave. Kick action is server-side authorized (see
 * `./actions.ts`) — the UI just dispatches; permission failures
 * surface inline.
 */

import { useEffect, useState, useTransition } from "react";
import { Alert, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow } from "@/lib/sessions/queries";
import { kickParticipantAction } from "./actions";

interface Props {
  streamerSlug: string;
  sessionId: string;
  initialParticipants: ParticipantRow[];
}

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;

export function ModParticipantsPanel({
  streamerSlug,
  sessionId,
  initialParticipants,
}: Props) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openKickFor, setOpenKickFor] = useState<string | null>(null);
  const [kickMinutes, setKickMinutes] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    let pollingHandle: number | null = null;
    let usingRealtime = false;

    const refreshFromDb = async () => {
      const { data } = await supabase
        .from("session_participants")
        .select(
          "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo",
        )
        .eq("session_id", sessionId)
        .is("left_at", null)
        .order("joined_at", { ascending: true });
      if (data) setParticipants(data as unknown as ParticipantRow[]);
    };

    const startPolling = () => {
      if (pollingHandle !== null) return;
      pollingHandle = window.setInterval(refreshFromDb, POLLING_INTERVAL_MS);
    };

    const channel = supabase
      .channel(`mod-participants-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshFromDb();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") usingRealtime = true;
      });

    const fallbackTimer = window.setTimeout(() => {
      if (!usingRealtime) startPolling();
    }, REALTIME_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (pollingHandle !== null) window.clearInterval(pollingHandle);
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const kick = (participantId: string, displayName: string) => {
    const raw = kickMinutes.trim();
    const minutes = raw === "" ? null : Number(raw);
    if (
      minutes !== null &&
      (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)
    ) {
      setError("Kick duration must be 1–1440 minutes (or blank for session).");
      return;
    }
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await kickParticipantAction(
        streamerSlug,
        participantId,
        minutes,
      );
      if (!result.ok) {
        const reasons: Record<string, string> = {
          unauthenticated: "You need to be signed in.",
          not_a_mod: "You're not an active mod for this streamer.",
          streamer_not_found: "Streamer not found.",
          participant_not_found: "That viewer is no longer in the session.",
          participant_not_in_streamer_session:
            "That viewer isn't in this streamer's session.",
          session_not_active: "The session isn't active anymore.",
          cant_kick_broadcaster: "Can't kick the streamer.",
          participant_already_left: "That viewer already left.",
          update_failed: "Couldn't apply the kick — try again.",
        };
        setError(reasons[result.error ?? ""] ?? result.error ?? "Kick failed.");
        return;
      }
      setSuccess(
        minutes === null
          ? `${displayName} kicked for the rest of the session.`
          : `${displayName} kicked for ${minutes} min.`,
      );
      setOpenKickFor(null);
      setKickMinutes("");
      // Realtime should reflect the leave within a few ms; no manual
      // refresh needed.
    });
  };

  if (participants.length === 0) {
    return (
      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--font-size-14)",
          margin: 0,
          fontStyle: "italic",
        }}
      >
        No active participants right now. Viewers who run{" "}
        <code>!gs-join</code> in chat will appear here.
      </p>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-12)",
      }}
    >
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-6)",
        }}
      >
        {participants.map((p) => {
          const isBroadcaster = p.is_broadcaster;
          const expanded = openKickFor === p.id;
          return (
            <li
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--spacing-12)",
                padding: "var(--spacing-8) var(--spacing-12)",
                background: "var(--background-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-6)",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-8)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: "var(--font-weight-semibold)",
                    fontSize: "var(--font-size-14)",
                  }}
                >
                  {p.display_name ?? p.platform_user_id}
                </span>
                {isBroadcaster && (
                  <span
                    style={{
                      fontSize: "var(--font-size-10)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--primary-600)",
                      fontWeight: "var(--font-weight-bold)",
                    }}
                  >
                    Streamer
                  </span>
                )}
                <span
                  style={{
                    fontSize: "var(--font-size-12)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  via {p.platform}
                </span>
              </div>
              {isBroadcaster ? null : expanded ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-6)",
                  }}
                >
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="minutes"
                    value={kickMinutes}
                    onChange={(e) => setKickMinutes(e.target.value)}
                    style={{ width: "8rem" }}
                  />
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() =>
                      kick(p.id, p.display_name ?? p.platform_user_id)
                    }
                    disabled={pending}
                  >
                    {pending ? "Kicking…" : "Confirm"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      setOpenKickFor(null);
                      setKickMinutes("");
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => setOpenKickFor(p.id)}
                  disabled={pending}
                >
                  Kick
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p
        style={{
          fontSize: "var(--font-size-12)",
          color: "var(--text-tertiary)",
          margin: 0,
          lineHeight: "var(--line-height-snug)",
        }}
      >
        Leave the minutes field blank to kick for the rest of the
        session, or set 1–1440 minutes for a timed ban.
      </p>
    </div>
  );
}
