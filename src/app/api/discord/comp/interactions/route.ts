/**
 * GameShuffle Competitive's interactions endpoint (the second Discord app, picks 2026-10-30): set as the
 * app's Interactions Endpoint URL in Discord's Developer Portal (https://www.gameshuffle.co/api/discord/comp/interactions,
 * and the dev copy's on dev.gameshuffle.co). Checked with that app's own public key, then handled as that app
 * (its commands, and its bot token for anything the handler posts).
 */

import { verifyDiscordSignature } from "@/lib/discord/verify";
import { handleInteraction } from "@/lib/discord/handler";
import { withDiscordApp } from "@/lib/discord/apps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const ok = await verifyDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), "comp");
  if (!ok) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(body);
  // PING: Discord checking the endpoint when it's saved in the Developer Portal.
  if (interaction.type === 1) return Response.json({ type: 1 });
  return withDiscordApp("comp", () => handleInteraction(interaction, "comp"));
}
