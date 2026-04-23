/**
 * AES-256-GCM token encryption for Twitch credentials at rest.
 *
 * Used to encrypt OAuth access/refresh tokens before storing in
 * `twitch_connections`. Same pattern intended for the future Sidecar
 * credential vault (per Twitch integration v1 spec §4).
 *
 * Storage format: base64( iv || authTag || ciphertext )
 * - iv:        12 bytes (96-bit, GCM standard)
 * - authTag:   16 bytes (128-bit)
 * - ciphertext: variable
 *
 * Run only on the Node.js runtime (not Edge — uses node:crypto).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class TwitchCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwitchCryptoError";
  }
}

function getKey(): Buffer {
  const hex = process.env.TWITCH_ENCRYPTION_KEY;
  if (!hex) {
    throw new TwitchCryptoError(
      "TWITCH_ENCRYPTION_KEY env var is not set. Generate a 32-byte key (64 hex chars)."
    );
  }
  // Allow 64-char hex (32 bytes) — strict check
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new TwitchCryptoError(
      "TWITCH_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32"
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
    throw new TwitchCryptoError("Invalid base64 input");
  }
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new TwitchCryptoError("Encrypted payload is too short");
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new TwitchCryptoError(
      "Token decryption failed — auth tag mismatch. The encryption key may have changed; the user must reconnect their Twitch account."
    );
  }
}
