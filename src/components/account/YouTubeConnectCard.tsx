"use client";

/**
 * YouTube Live integration card on /account → Integrations. Shows a Connect
 * button (→ Google OAuth) when disconnected, or the connected channel + a
 * Disconnect button when linked. Falls back to a "coming soon" state when the
 * platform isn't configured (no OAuth creds on this deployment).
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IntegrationCard } from "./IntegrationCard";
import { useToast } from "@/components/toast/ToastProvider";

interface YouTubeStatus {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  channelHandle: string | null;
  isLive: boolean;
}

export function YouTubeConnectCard({ onLearnMore }: { onLearnMore?: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/youtube/status")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setStatus(j as YouTubeStatus);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Until we know, or when the platform isn't configured, show the planned card.
  if (!status || !status.configured) {
    return (
      <IntegrationCard
        title="YouTube Live"
        description="Bring GameShuffle lobbies to your YouTube Live chat. Same commands, same overlay, same randomizer."
        status={{ label: "Coming soon", kind: "coming_soon" }}
        actions={
          onLearnMore ? (
            <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={onLearnMore}>
                Learn more
              </Button>
            </div>
          ) : undefined
        }
        muted
      />
    );
  }

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/youtube/disconnect", { method: "POST" });
      if (res.ok) {
        toast.success("YouTube disconnected.");
        setStatus({ ...status, connected: false, channelTitle: null, channelHandle: null, isLive: false });
      } else {
        toast.error("Couldn't disconnect. Try again.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(false);
  };

  if (status.connected) {
    return (
      <IntegrationCard
        title="YouTube Live"
        description={`Connected as ${status.channelTitle ?? "your channel"}. GameShuffle talks in your live chat while you're streaming.`}
        status={{ label: status.isLive ? "Live now" : "Connected", kind: status.isLive ? "live" : "beta" }}
        actions={
          <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={disconnect} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
            {onLearnMore && (
              <Button variant="ghost" onClick={onLearnMore}>
                Learn more
              </Button>
            )}
          </div>
        }
        footnote="YouTube chat commands post as your own channel. Full command parity is rolling out."
      />
    );
  }

  return (
    <IntegrationCard
      title="YouTube Live"
      description="Bring GameShuffle lobbies to your YouTube Live chat. Same commands, same overlay, same randomizer."
      status={{ label: "Available", kind: "beta" }}
      actions={
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => { window.location.href = "/api/youtube/auth/start"; }}>
            Connect YouTube
          </Button>
          {onLearnMore && (
            <Button variant="ghost" onClick={onLearnMore}>
              Learn more
            </Button>
          )}
        </div>
      }
    />
  );
}
