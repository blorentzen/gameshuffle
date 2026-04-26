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

interface IntegrationsTabProps {
  onLearnMore: () => void;
}

export function IntegrationsTab({ onLearnMore }: IntegrationsTabProps) {
  return (
    <>
      {/* Twitch — full-detail hub content lives inside TwitchHubTab */}
      <TwitchHubTab />

      {/* Discord — bot exists today for standalone randomizer commands;
          session-bound integration is forthcoming. */}
      <IntegrationCard
        title="Discord Bot"
        description="GameShuffle's Discord bot ships slash commands (/gs-randomize, /gs-result). Session binding — where Discord participants share a lobby with Twitch viewers — is on the roadmap."
        status={{ label: "Bot live · session binding coming soon", kind: "beta" }}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={onLearnMore}>
              Learn more
            </Button>
          </div>
        }
        footnote={
          <>
            Server admins can invite the bot directly from Discord today. A guided install +
            per-server configuration flow ships with the Pro session-binding rollout.
          </>
        }
      />

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
