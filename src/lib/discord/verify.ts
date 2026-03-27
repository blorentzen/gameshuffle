/**
 * Ed25519 signature verification for Discord Interactions API.
 * Uses Node.js crypto (tweetnacl-compatible approach).
 */

import { verifyKey } from "discord-interactions";

export async function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;

  return verifyKey(body, signature, timestamp, publicKey);
}
