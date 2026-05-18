"use client";

/**
 * Integrations tab on /account. One surface for every platform
 * GameShuffle connects to, current or planned.
 *
 *   Twitch          — fully functional (TwitchHubTab handles rendering)
 *   Discord Bot     — informational today; per-server integration is a
 *                     forward-looking item once session binding ships
 *   YouTube Live    — Coming Soon
 *   Kick            — Coming Soon
 *
 * Replaces the previous "Twitch Hub" tab and its dedicated route so the
 * hub isn't hidden behind a single-platform label.
 */

import { Button } from "@empac/cascadeds";
import { TwitchHubTab } from "./TwitchHubTab";
import { IntegrationCard } from "./IntegrationCard";
import { DiscordBotRoutingCard } from "./DiscordBotRoutingCard";

interface IntegrationsTabProps {
  onLearnMore: () => void;
}

export function IntegrationsTab({ onLearnMore }: IntegrationsTabProps) {
  return (
    <>
      {/* Twitch — full-detail hub content lives inside TwitchHubTab */}
      <TwitchHubTab />

      {/* Discord — bot install + per-server routing for stream
          announcements, picks/bans posts, and recaps. Replaces the
          previous informational placeholder card. */}
      <DiscordBotRoutingCard />

      {/* YouTube Live — planned */}
      <IntegrationCard
        title="YouTube Live"
        description="Bring GameShuffle lobbies to your YouTube Live chat. Same commands, same overlay, same randomizer."
        status={{ label: "Coming soon", kind: "coming_soon" }}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={onLearnMore}>
              Learn more
            </Button>
          </div>
        }
        muted
      />

      {/* Kick — planned */}
      <IntegrationCard
        title="Kick"
        description="Bring GameShuffle lobbies to your Kick chat. Same commands, same overlay, same randomizer."
        status={{ label: "Coming soon", kind: "coming_soon" }}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={onLearnMore}>
              Learn more
            </Button>
          </div>
        }
        muted
      />
    </>
  );
}
