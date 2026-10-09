import "server-only";

/**
 * Who may see a shop order. A buyer proves it one of three ways:
 *   - the "View your order" link in their order emails (a signed token),
 *   - a one-time code sent to the order's email or phone (shop_lookup_codes),
 *   - being signed in as the account that placed it, or whose confirmed
 *     email matches the order's.
 * The first two leave a signed cookie listing the orders this browser has
 * unlocked (30 days). Staff can see every order.
 *
 * Keys: SHOP_ORDER_SECRET, or one derived from the service role key (like the
 * Activity session), so nothing extra has to be configured.
 */

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const ORDER_COOKIE = "gs_shop_orders";
const COOKIE_DAYS = 30;
const LINK_DAYS = 120;
const MAX_COOKIE_ORDERS = 20;

function key(): string {
  const own = process.env.SHOP_ORDER_SECRET;
  if (own) return own;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("SHOP_ORDER_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set");
  return createHmac("sha256", base).update("gs-shop-order-access").digest("base64url");
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

function seal(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function open<T>(token: string | null | undefined): T | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".", 2);
  const want = sign(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()) as T; } catch { return null; }
}

/** The token behind an email's "View your order" link. */
export function orderLinkToken(orderId: string): string {
  return seal({ o: orderId, e: Date.now() + LINK_DAYS * 86_400_000 });
}

export function readOrderLinkToken(token: string | null | undefined): string | null {
  const p = open<{ o: string; e: number }>(token);
  return p && typeof p.o === "string" && p.e > Date.now() ? p.o : null;
}

/** Orders this browser has unlocked. */
export function ordersInCookie(value: string | null | undefined): string[] {
  const p = open<{ ids: string[]; e: number }>(value);
  return p && Array.isArray(p.ids) && p.e > Date.now() ? p.ids.filter((x) => typeof x === "string") : [];
}

/** The cookie value after unlocking one more order (newest first, capped). */
export function cookieWithOrder(value: string | null | undefined, orderId: string): { value: string; maxAge: number } {
  const ids = [orderId, ...ordersInCookie(value).filter((x) => x !== orderId)].slice(0, MAX_COOKIE_ORDERS);
  return { value: seal({ ids, e: Date.now() + COOKIE_DAYS * 86_400_000 }), maxAge: COOKIE_DAYS * 86_400 };
}

export const cookieOptions = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

/** A 6-digit lookup code and its hash (only the hash is stored). */
export function newLookupCode(lookupId: string): { code: string; hash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, hash: hashLookupCode(lookupId, code) };
}

export function hashLookupCode(lookupId: string, code: string): string {
  return createHmac("sha256", key()).update(`${lookupId}:${code.trim()}`).digest("base64url");
}

export function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** A one-way fingerprint of the caller's IP, for rate limits and the lookup log. */
export const ipHash = (ip: string) => createHash("sha256").update(`${key()}:${ip}`).digest("base64url").slice(0, 22);

/** "GS-1005", "gs 1005", "1005" -> 1005. */
export function parseOrderNumber(raw: string | null | undefined): number | null {
  const m = String(raw ?? "").match(/(\d{3,9})/);
  return m ? Number(m[1]) : null;
}

/** "b***@gmail.com", "(•••) •••-4821" for "we sent a code to …". */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain ?? ""}`;
}
export function maskPhone(e164: string): string {
  return `(•••) •••-${e164.slice(-4)}`;
}
