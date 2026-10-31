"use client";

/**
 * Which of our Discord apps the Discord screens are about (picks 2026-10-30): GameShuffle, or GameShuffle
 * Competitive once it exists in this environment. The choice is `?app=comp` in the address (kept with
 * replaceState), so an install's return lands on the right one. Without the competitive app the screens show
 * GameShuffle's settings as before, with no switch.
 */

import { useSyncExternalStore, type ReactNode } from "react";
import { Chip } from "@empac/cascadeds";
import { DISCORD_APP_NAMES, compAppLive, type DiscordAppId } from "@/lib/discord/appIds";
import { DiscordCompServers } from "./DiscordCompServers";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  window.addEventListener("gs-discord-app", cb);
  return () => { window.removeEventListener("popstate", cb); window.removeEventListener("gs-discord-app", cb); };
};
const readApp = (): DiscordAppId => (new URLSearchParams(window.location.search).get("app") === "comp" ? "comp" : "main");

function pickApp(app: DiscordAppId) {
  const url = new URL(window.location.href);
  if (app === "comp") url.searchParams.set("app", "comp"); else url.searchParams.delete("app");
  for (const k of ["discord_installed", "discord_install_error", "guild"]) url.searchParams.delete(k);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event("gs-discord-app"));
}

/** The switch, then GameShuffle's settings (`children`) or the competitive app's servers. */
export function DiscordAppSwitch({ children }: { children: ReactNode }) {
  const app = useSyncExternalStore(subscribe, readApp, () => "main" as DiscordAppId);
  if (!compAppLive()) return <>{children}</>;
  return (
    <div className="discord-apps">
      <div className="discord-apps__switch" role="group" aria-label="Which Discord app">
        {(["main", "comp"] as DiscordAppId[]).map((a) => (
          <Chip key={a} label={DISCORD_APP_NAMES[a]} clickable selected={app === a} onClick={() => pickApp(a)} />
        ))}
      </div>
      {app === "comp" ? <DiscordCompServers /> : children}
    </div>
  );
}
