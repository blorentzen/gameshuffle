"use client";

/**
 * Twitch player embed for the live page hero. Renders a 16:9 iframe
 * with `parent=` set to every host we might serve from so Twitch's
 * iframe accepts the embed.
 *
 * Twitch's player rejects the load with "This content is blocked"
 * when no `parent=` value matches the actual embedding origin. We
 * pre-declare the production hosts (gameshuffle.co + www) plus
 * `localhost` for dev, and append the dynamically-resolved hostname
 * as a backup so Vercel preview URLs / custom dev hostnames also
 * resolve. Parent values are de-duplicated so we don't repeat the
 * same host twice.
 *
 * Falls back to a "no Twitch handle" panel when the streamer profile
 * doesn't carry a Twitch login (rare — most streamers run the
 * streamer-integration OAuth which populates twitch_connections).
 *
 * Twitch's player auto-handles the offline case (renders the gray
 * "channel offline" frame) so we don't gate render on stream.online —
 * the embed IS the source of truth for "is the stream live."
 */

import { useState } from "react";

interface TwitchEmbedProps {
  twitchHandle: string | null;
}

/** Hosts the live page is known to serve from. Listed first in the
 *  `parent=` chain so Twitch accepts the iframe even before the
 *  dynamic host resolves on the client. Order doesn't matter — Twitch
 *  treats them as a set. */
const KNOWN_PARENT_HOSTS = [
  "gameshuffle.co",
  "www.gameshuffle.co",
  "localhost",
];

function deriveCurrentHost(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  return host || null;
}

/** Build the `&parent=...` query string by combining the known hosts
 *  with the dynamically-resolved one, de-duplicated. */
function buildParentQuery(currentHost: string | null): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const host of [...KNOWN_PARENT_HOSTS, currentHost]) {
    if (!host) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    parts.push(`parent=${encodeURIComponent(host)}`);
  }
  return parts.join("&");
}

export function TwitchEmbed({ twitchHandle }: TwitchEmbedProps) {
  // Lazy initializer pattern (same as useAnonViewerId) — reads
  // window.location.hostname during the first client render. SSR
  // returns null (no window).
  const [currentHost] = useState<string | null>(() => deriveCurrentHost());

  if (!twitchHandle) {
    return (
      <div className="twitch-embed twitch-embed--missing">
        <p className="twitch-embed__missing-text">
          This streamer hasn&rsquo;t connected a Twitch account, so the
          live player can&rsquo;t embed here.
        </p>
      </div>
    );
  }

  // Lowercase the handle — Twitch logins are stored lowercase in URLs
  // and the player normalizes anyway, but explicit avoids any case
  // sensitivity weirdness from db rows that captured a display-cased
  // login somehow.
  const channel = twitchHandle.toLowerCase();
  const parentQuery = buildParentQuery(currentHost);
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parentQuery}&autoplay=true&muted=true`;

  return (
    <div className="twitch-embed">
      <iframe
        src={src}
        allowFullScreen
        title={`${channel} on Twitch`}
        className="twitch-embed__iframe"
      />
    </div>
  );
}
