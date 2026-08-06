/**
 * Server-side Plausible events — for actions that happen off the client (chat
 * commands, Hub server actions, channel-point redemptions). Fire-and-forget:
 * analytics must never break or slow a real flow, so failures are swallowed.
 *
 * Plausible's events API: POST name/domain/url (+ optional props). Server events
 * all share the server's IP/UA, so they don't attribute to a real visitor —
 * fine for counting tool triggers.
 */

import "server-only";

const PLAUSIBLE_DOMAIN = "gameshuffle.co";
const PLAUSIBLE_ENDPOINT = "https://plausible.io/api/event";

export async function trackServerEvent(
  name: string,
  opts?: { url?: string; props?: Record<string, string | number | boolean> },
): Promise<void> {
  try {
    await fetch(PLAUSIBLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GameShuffle-Server/1.0",
      },
      body: JSON.stringify({
        name,
        domain: PLAUSIBLE_DOMAIN,
        url: opts?.url ?? "https://gameshuffle.co/twitch",
        props: opts?.props,
      }),
    });
  } catch {
    // never surface analytics failures
  }
}
