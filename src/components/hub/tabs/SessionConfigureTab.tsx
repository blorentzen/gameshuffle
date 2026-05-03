"use client";

/**
 * Settings tab — session-level controls. Name, description, games (with
 * optional play-order), schedule, test-mode, public-lobby visibility.
 * Modules + redemptions + viewers each live in their own tabs.
 */

import { Alert } from "@empac/cascadeds";
import { SessionDetailsForm } from "../SessionDetailsForm";
import {
  PublicLobbySurface,
  type ConnectionState,
} from "../ConfigureSections";

interface Props {
  slug: string;
  status:
    | "draft"
    | "scheduled"
    | "ready"
    | "active"
    | "ending"
    | "ended"
    | "cancelled";
  initial: {
    name: string;
    description: string | null;
    configuredGames: string[];
    scheduledAt: string | null;
    scheduledEligibilityWindowHours: number;
    isTestSession: boolean;
    maxParticipants: number | null;
  };
  showTwitchNotConnectedWarning: boolean;
  /** Twitch connection snapshot for the public-lobby toggle. Null when
   *  Twitch isn't connected — surface stays hidden. */
  connection: ConnectionState | null;
}

export function SessionConfigureTab({
  slug,
  status,
  initial,
  showTwitchNotConnectedWarning,
  connection,
}: Props) {
  return (
    <div className="hub-detail__section-stack">
      {showTwitchNotConnectedWarning && (
        <Alert variant="warning">
          Twitch isn&rsquo;t connected on this account. Some configuration
          options below are disabled — set up the streamer integration in{" "}
          <a href="/account?tab=integrations">Account → Integrations</a>{" "}
          first.
        </Alert>
      )}
      <SessionDetailsForm slug={slug} status={status} initial={initial} />
      {connection && <PublicLobbySurface initial={connection} />}
    </div>
  );
}
