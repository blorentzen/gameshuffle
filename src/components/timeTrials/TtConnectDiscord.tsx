"use client";

/**
 * "Connect Discord" for time trials (picks 2026-10-29, 1A + 2A): for a signed-in account without
 * Discord, one flat line on the time trials page, the import page and the Add a time window. Without
 * Discord, /gs-tt times save to a separate Discord player and the account never shows on a server's
 * board. Connecting goes through the usual identity link and comes back to this page.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconBrandDiscord } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { startOAuth } from "@/lib/auth/oauth";

export const CONNECT_DISCORD_LINE = "Connect Discord so the times you add with /gs-tt land on this account, and you show up on your servers' boards.";

export function TtConnectDiscord({ returnTo, compact = false }: { returnTo: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(returnTo)}`;
    const failed = await startOAuth("discord", redirectTo, { link: true, surface: "time-trials" });
    if (failed) { setError(failed); setBusy(false); }
  };
  return (
    <div className={`tt-connect${compact ? " tt-connect--compact" : ""}`}>
      {!compact && <IconTile icon={IconBrandDiscord} tone="violet" />}
      <p className="tt-connect__text">{CONNECT_DISCORD_LINE}</p>
      <Button variant="secondary" size={compact ? "small" : "medium"} iconBefore={compact ? IconBrandDiscord : undefined} onClick={connect} loading={busy}>Connect Discord</Button>
      {error && <p className="tt-connect__error" role="alert">{error}</p>}
    </div>
  );
}
