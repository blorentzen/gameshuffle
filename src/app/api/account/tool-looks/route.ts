/**
 * Tool looks for the signed-in account (src/lib/tools/looks.ts).
 *
 * GET  /api/account/tool-looks
 *      → { looks, saved, pro, looksOk, brand, avatarUrl, color, eightBall }  (looksOk = GS Pro or Supporter looks)
 *        `looks` as the account's surfaces draw them (GS Pro choices only
 *        while GS Pro), `saved` = which tools have a saved look (the free
 *        pages move a visitor's browser look into an empty one).
 *      ?for=stream → the stream this request acts on: the streamer's own
 *        looks for a Full-access mod on /mod/<streamer> (control room).
 *
 * PUT  /api/account/tool-looks  body: { tool, look }
 *      → saves one look for the signed-in account. Free accounts can save;
 *        GS Pro choices are kept as stored and only GS Pro can change them.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { hasLooks } from "@/lib/support/looks";
import { streamOwnerFor } from "@/lib/mods/acting";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import { accountColor, accountPicture, drawnLook, lookBrand, readSavedLooks, saveLook } from "@/lib/tools/looksServer";
import { TOOL_LOOK_IDS, isToolLookId, type ToolLooks } from "@/lib/tools/looks";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

async function signedIn(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await signedIn();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const owner = req.nextUrl.searchParams.get("for") === "stream" ? (await streamOwnerFor(userId)).ownerUserId : userId;

  // `looksOk` (GS Pro or Supporter looks) unlocks the paid looks; the 8-ball's own answers stay GS Pro.
  const [{ looks, saved }, pro, looksOk] = await Promise.all([readSavedLooks(owner), isProUser(owner), hasLooks(owner)]);
  const [brand, avatarUrl, color, oracle] = await Promise.all([
    lookBrand(owner),
    accountPicture(owner),
    accountColor(owner),
    pro ? getStreamerModuleDefault({ ownerUserId: owner, moduleId: "oracle", gameSlug: "*" }) : Promise.resolve(null),
  ]);
  const drawn = {} as ToolLooks;
  for (const id of TOOL_LOOK_IDS) (drawn as unknown as Record<string, unknown>)[id] = drawnLook(id, looks[id], looksOk);

  return NextResponse.json(
    {
      ok: true,
      looks: drawn,
      saved,
      pro,
      looksOk,
      brand,
      avatarUrl,
      color,
      eightBall: oracle ? { disabled: oracle.disabledEightBall ?? [], custom: oracle.customEightBall ?? [] } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: NextRequest) {
  const userId = await signedIn();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const limited = await rateLimit(`tool-looks:${userId}`, { max: 60, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { tool?: unknown; look?: unknown } | null;
  if (!body || !isToolLookId(body.tool)) return NextResponse.json({ error: "unsupported_tool" }, { status: 400 });
  if (!body.look || typeof body.look !== "object") return NextResponse.json({ error: "missing_look" }, { status: 400 });

  try {
    const looksOk = await hasLooks(userId);
    const stored = await saveLook(userId, body.tool, body.look, looksOk);
    return NextResponse.json({ ok: true, look: drawnLook(body.tool, stored, looksOk) });
  } catch (err) {
    console.error("[tool-looks] save failed:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
