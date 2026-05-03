"use client";

/**
 * Redemptions tab — Twitch channel-point rewards. Was the umbrella for
 * "viewer-facing engagement levers" but Public Lobby visibility moved
 * to Settings (it's a session-level visibility setting, not a redemption
 * the viewer triggers).
 */

import {
  ChannelPointsSurface,
  type ConnectionState,
} from "../ConfigureSections";

interface Props {
  connection: ConnectionState | null;
}

export function SessionRedemptionsTab({ connection }: Props) {
  return (
    <div className="hub-detail__section-stack">
      <ChannelPointsSurface initial={connection} />
    </div>
  );
}
