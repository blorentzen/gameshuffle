/**
 * Speedrun addresses and the relay's webhook signature (phase 1 contract, "Ids, secret and tokens"). The relay
 * (speedrun-relay/) signs and checks the same way, with Web Crypto on both sides:
 *
 *   timer   (pasted into LiveSplit One)  t1.<relayId>.<timerVersion>.<sig>
 *   overlay (the OBS link, view only)    o1.<relayId>.<overlayVersion>.<sig>
 *   room    (watching a race room)       r1.<roomId>.1.<sig>  (rooms share the relay id's shape)
 *   sig = base64url(HMAC-SHA256(secret, "<kind>:<relayId>:<version>")) cut to 22 characters
 *   webhook header x-relay-signature = hex(HMAC-SHA256(secret, raw body))
 *
 * Both test suites check the contract's vectors (scripts/test-speedrun.ts here). Pure; works in Node and browsers.
 */

export type TokenKind = "timer" | "overlay" | "room";

export interface TokenParts {
  kind: TokenKind;
  relayId: string;
  version: number;
}

const PREFIX: Record<TokenKind, string> = { timer: "t1", overlay: "o1", room: "r1" };
const KIND_OF: Record<string, TokenKind> = { t1: "timer", o1: "overlay", r1: "room" };
const RELAY_ID = /^[A-Za-z0-9]{16}$/;
const SIG = /^[A-Za-z0-9_-]{22}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const enc = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto (crypto.subtle) isn't available here.");
  return c.subtle;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await subtle().importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", key, enc.encode(message)));
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Compares two strings in time that doesn't depend on where they differ. */
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const isRelayId = (s: unknown): s is string => typeof s === "string" && RELAY_ID.test(s);

/** A new relay id: 16 random characters from [A-Za-z0-9] (no modulo bias). */
export function newRelayId(): string {
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < 16) {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && out.length < 16) out.push(ALPHABET[b % 62]);
    }
  }
  return out.join("");
}

async function signature(secret: string, kind: TokenKind, relayId: string, version: number): Promise<string> {
  return base64url(await hmac(secret, `${kind}:${relayId}:${version}`)).slice(0, 22);
}

export async function signToken(secret: string, kind: TokenKind, relayId: string, version: number): Promise<string> {
  if (!isRelayId(relayId)) throw new Error("Bad relay id");
  if (!Number.isInteger(version) || version < 1) throw new Error("Bad token version");
  return `${PREFIX[kind]}.${relayId}.${version}.${await signature(secret, kind, relayId, version)}`;
}

/** A token's parts, without checking its signature (null if it isn't shaped like one). */
export function parseToken(token: unknown): (TokenParts & { sig: string }) | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [prefix, relayId, v, sig] = parts;
  const kind = KIND_OF[prefix];
  if (!kind || !isRelayId(relayId) || !/^[1-9][0-9]{0,8}$/.test(v) || !SIG.test(sig)) return null;
  return { kind, relayId, version: Number(v), sig };
}

/** The token's parts when its signature is right (and it's the kind asked for), else null. */
export async function verifyToken(secret: string, token: unknown, kind?: TokenKind): Promise<TokenParts | null> {
  const p = parseToken(token);
  if (!p || (kind && p.kind !== kind)) return null;
  const want = await signature(secret, p.kind, p.relayId, p.version);
  return sameString(want, p.sig) ? { kind: p.kind, relayId: p.relayId, version: p.version } : null;
}

/** The webhook's x-relay-signature for a raw body: hex HMAC-SHA256. */
export async function signBody(secret: string, rawBody: string): Promise<string> {
  return hex(await hmac(secret, rawBody));
}

export async function verifyBody(secret: string, rawBody: string, signatureHex: string | null | undefined): Promise<boolean> {
  if (!signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  return sameString(await signBody(secret, rawBody), signatureHex.toLowerCase());
}
