// Signed addresses and webhook signatures. Must match the site's src/lib/speedrun/tokens.ts byte for byte
// (shared test vectors in test/tokens.test.ts). Web Crypto only, so it runs in Workers and Node alike.

export type TokenKind = "timer" | "overlay";

export interface TokenInfo {
  kind: TokenKind;
  relayId: string;
  version: number;
}

const PREFIX: Record<TokenKind, string> = { timer: "t1", overlay: "o1" };
const KIND_OF: Record<string, TokenKind> = { t1: "timer", o1: "overlay" };
const SIG_LENGTH = 22;

export const RELAY_ID_RE = /^[A-Za-z0-9]{16}$/;
const TOKEN_RE = /^(t1|o1)\.([A-Za-z0-9]{16})\.([1-9][0-9]{0,8})\.([A-Za-z0-9_-]{22})$/;

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(secret, key);
  }
  return key;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data)));
}

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Compares two strings without returning early on the first difference. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0;
}

async function signature(secret: string, kind: TokenKind, relayId: string, version: number): Promise<string> {
  return base64url(await hmac(secret, `${kind}:${relayId}:${version}`)).slice(0, SIG_LENGTH);
}

export async function signToken(secret: string, kind: TokenKind, relayId: string, version: number): Promise<string> {
  if (!RELAY_ID_RE.test(relayId)) throw new Error("bad relayId");
  if (!Number.isInteger(version) || version < 1) throw new Error("bad version");
  return `${PREFIX[kind]}.${relayId}.${version}.${await signature(secret, kind, relayId, version)}`;
}

/** Returns the token's parts when it is well formed and signed with this secret, else null. */
export async function verifyToken(secret: string, token: string, expect?: TokenKind): Promise<TokenInfo | null> {
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const kind = KIND_OF[m[1]];
  if (expect && kind !== expect) return null;
  const relayId = m[2];
  const version = Number(m[3]);
  const sig = await signature(secret, kind, relayId, version);
  return timingSafeEqual(sig, m[4]) ? { kind, relayId, version } : null;
}

/** The webhook's x-relay-signature: hex HMAC-SHA256 of the raw body. */
export async function signBody(secret: string, body: string): Promise<string> {
  return hex(await hmac(secret, body));
}

export async function verifyBody(secret: string, body: string, sig: string): Promise<boolean> {
  return timingSafeEqual(await signBody(secret, body), sig.toLowerCase());
}

/** Checks an `Authorization: Bearer <secret>` header; both sides are hashed first so length can't leak. */
export async function bearerOk(secret: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("Bearer ")) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(header.slice(7).trim())),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  return timingSafeEqual(hex(new Uint8Array(a)), hex(new Uint8Array(b)));
}
