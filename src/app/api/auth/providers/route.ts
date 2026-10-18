/**
 * GET /api/auth/providers → { facebook } : which optional sign-in providers are on
 * (Platform ▸ Switches). Discord and Twitch are always on. Public; cached briefly.
 */
import { NextResponse } from "next/server";
import { getPlatformFlag } from "@/lib/platform/flags";

export const runtime = "nodejs";

export async function GET() {
  const facebook = await getPlatformFlag("auth_facebook", false);
  return NextResponse.json({ facebook }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
