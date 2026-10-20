import "server-only";

/**
 * Cross-origin rules and replies for the Twitch extension's routes
 * (/api/twitch-ext/*). Twitch serves the extension from
 * https://<client id>.ext-twitch.tv, so these routes answer that origin (any
 * ext-twitch.tv host until TWITCH_EXTENSION_CLIENT_ID is set), plus localhost
 * outside production for the local stand-in. No cookies: the extension sends
 * Twitch's signed token. next.config.ts keeps /api/twitch-ext/ out of the
 * site-wide gameshuffle.co-only API header rule.
 */

import { NextResponse } from "next/server";
import { isProduction } from "@/lib/env";

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function allowedOrigin(origin: string): boolean {
  const id = process.env.TWITCH_EXTENSION_CLIENT_ID;
  const ext = id ? origin === `https://${id.toLowerCase()}.ext-twitch.tv` : /^https:\/\/[a-z0-9]+\.ext-twitch\.tv$/i.test(origin);
  return ext || (!isProduction && DEV_ORIGIN.test(origin));
}

export function extCors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return allowedOrigin(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export const extJson = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...extCors(req), "Cache-Control": "no-store", ...extra } });

export const extPreflight = (req: Request) => new NextResponse(null, { status: 204, headers: extCors(req) });
