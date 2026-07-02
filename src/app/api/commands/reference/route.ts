/**
 * GET /api/commands/reference → { commands }
 * The built-in command catalog, serialized from the live registry. Reference
 * data (the same commands viewers see in chat), so no auth required.
 */

import { NextResponse } from "next/server";
import { listCommandReference } from "@/lib/twitch/commands/reference";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, commands: listCommandReference() });
}
