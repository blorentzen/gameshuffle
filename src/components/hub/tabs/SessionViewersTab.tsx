"use client";

/**
 * Viewers tab — surfaces who's actively engaged with the session.
 *
 * Phase 1 (this surface): "In lobby / queue" via session_participants —
 * everyone who's run `!gs-join` or been seated by a redemption. Realtime
 * via `<RealtimeParticipantsList />`.
 *
 * Phase 2 (future, infrastructure-gated): "Watching" — passive viewers
 * who haven't joined the lobby. Twitch's Helix Get Channel Followers /
 * Get Channel Chatters APIs give partial data; full presence requires
 * either subscribing to chat events for typing presence or polling the
 * GetChatters endpoint. Surfaced as a placeholder card here so the
 * shape of the tab matches the eventual deliverable.
 */

import { Alert, Card } from "@empac/cascadeds";
import type { ParticipantRow } from "@/lib/sessions/queries";
import { RealtimeParticipantsList } from "../RealtimeParticipantsList";

interface Props {
  sessionId: string;
  initialParticipants: ParticipantRow[];
  /** Live = active or ending; Pre = draft/scheduled/ready; Post = ended/cancelled. */
  phase: "pre" | "live" | "post";
}

export function SessionViewersTab({
  sessionId,
  initialParticipants,
  phase,
}: Props) {
  const lobbyCount = initialParticipants.filter(
    (p) => !p.is_broadcaster
  ).length;

  return (
    <div className="hub-detail__section-stack">
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">
          In lobby / queue ({lobbyCount})
        </h2>
        {phase === "live" && (
          <RealtimeParticipantsList
            sessionId={sessionId}
            initialParticipants={initialParticipants}
          />
        )}
        {phase === "post" && initialParticipants.length > 0 && (
          <Card variant="outlined" padding="medium">
            <p className="hub-detail__panel-meta">
              Snapshot at session end — these viewers were still seated when
              the session closed.
            </p>
            <ul className="hub-detail__participant-list">
              {initialParticipants.map((p) => (
                <li key={p.id} className="hub-detail__participant-row">
                  <span className="hub-detail__participant-name">
                    {p.display_name ?? p.platform_user_id}
                  </span>
                  {p.is_broadcaster && (
                    <span className="hub-detail__participant-badge">
                      streamer
                    </span>
                  )}
                  <span className="hub-detail__participant-platform">
                    via {p.platform}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {phase === "post" && initialParticipants.length === 0 && (
          <Card variant="outlined" padding="medium">
            <p className="hub-detail__panel-meta">
              No participants were in the lobby at session end.
            </p>
          </Card>
        )}
        {phase === "pre" && (
          <Card variant="outlined" padding="medium">
            <p className="hub-detail__panel-meta">
              Activate the session to start collecting lobby joins. Viewers
              who run <code>!gs-join</code> or queue up via channel-points
              redemption appear here in real time.
            </p>
          </Card>
        )}
      </section>

      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Watching (passive)</h2>
        <Card variant="flat" padding="medium">
          <Alert variant="info">
            Passive viewer presence — viewers watching the stream who
            haven&rsquo;t joined the lobby — isn&rsquo;t tracked yet.
            Surfacing this requires polling Twitch&rsquo;s Get Chatters
            endpoint (or subscribing to chat presence events) on a cadence;
            it&rsquo;s queued for a future release.
          </Alert>
        </Card>
      </section>
    </div>
  );
}
