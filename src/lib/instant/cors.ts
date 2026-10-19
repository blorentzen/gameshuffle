import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isProduction } from "@/lib/env";

/**
 * Cross-origin rules for the Facebook Instant Game's routes (/api/instant/*).
 * The game is served from Facebook's own hosts (apps-<app id>.fbsbx.com), so
 * these routes answer *.fbsbx.com, plus localhost outside production for the
 * test build. No cookies are involved. next.config.ts keeps /api/instant/ out
 * of the site-wide gameshuffle.co-only API header rule.
 */

const FB_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*fbsbx\.com$/i;
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function instantCors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = FB_ORIGIN.test(origin) || (!isProduction && DEV_ORIGIN.test(origin));
  return ok
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export const instantJson = (req: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: instantCors(req) });
export const instantPreflight = (req: NextRequest) => new NextResponse(null, { status: 204, headers: instantCors(req) });
export const instantIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
