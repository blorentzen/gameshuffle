/**
 * Ed25519 signature verification for Discord Interactions API.
 * Uses Node.js crypto (tweetnacl-compatible approach).
 */

import { verifyKey } from "discord-interactions";
import { appKeys } from "./apps";
import type { DiscordAppId } from "./appIds";

/** Checks a request really came from Discord for this app (each app signs with its own key). */
export async function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  app: DiscordAppId = "main",
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  const publicKey = appKeys(app)?.publicKey;
  if (!publicKey) return false;

  return verifyKey(body, signature, timestamp, publicKey);
}
