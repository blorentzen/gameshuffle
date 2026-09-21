/**
 * AES-256-GCM token encryption for YouTube (Google OAuth) credentials at rest.
 *
 * Byte-for-byte the same scheme as `src/lib/twitch/crypto.ts` — encrypts OAuth
 * access/refresh tokens before storing in `youtube_connections`. Kept separate
 * (own key env) so a key rotation on one platform doesn't invalidate the other.
 *
 * Storage format: base64( iv || authTag || ciphertext )
 *   - iv:         12 bytes (96-bit, GCM standard)
 *   - authTag:    16 bytes (128-bit)
 *   - ciphertext: variable
 *
 * Node.js runtime only (uses node:crypto) — never Edge.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class YouTubeCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeCryptoError";
  }
}

function getKey(): Buffer {
  // Reuse the Twitch key when a dedicated YouTube key isn't set — both are
  // 32-byte hex secrets and this lets a single-key deployment work out of the
  // box. Set YOUTUBE_ENCRYPTION_KEY to rotate independently.
  const hex = process.env.YOUTUBE_ENCRYPTION_KEY || process.env.TWITCH_ENCRYPTION_KEY;
  if (!hex) {
    throw new YouTubeCryptoError(
      "YOUTUBE_ENCRYPTION_KEY (or TWITCH_ENCRYPTION_KEY) env var is not set. Generate a 32-byte key (64 hex chars) with: openssl rand -hex 32",
    );
  }
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new YouTubeCryptoError(
      "YOUTUBE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  let buf: Buffer;
  try {
    buf = Buffer.from(encoded, "base64");
  } catch {
    throw new YouTubeCryptoError("Invalid base64 input");
  }
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new YouTubeCryptoError("Encrypted payload is too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new YouTubeCryptoError(
      "Token decryption failed — auth tag mismatch. The encryption key may have changed; the user must reconnect their YouTube channel.",
    );
  }
}
