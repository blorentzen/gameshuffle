/**
 * Ed25519 signature verification for Discord Interactions API.
 * Uses Web Crypto API — edge-compatible, no Node crypto.
 */

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

export async function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToArrayBuffer(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      "Ed25519",
      key,
      hexToArrayBuffer(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}
