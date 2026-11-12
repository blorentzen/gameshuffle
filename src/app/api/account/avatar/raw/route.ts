/**
 * GET /api/account/avatar/raw?size=256 — the signed-in account's own profile
 * picture as a small PNG, same-origin, so a canvas or WebGL texture that draws
 * it is never tainted (Shuffle Kart seats it in a kart). Same choice as the
 * rest of the site (src/lib/avatar/choice.ts): a Twitch or Discord picture,
 * fetched only from their CDNs and our own storage (facePng checks the host),
 * or the DiceBear avatar drawn here on a clear background.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { avatarChoice, type AvatarFields } from "@/lib/avatar/choice";
import { generateDicebearAvatarDataUri } from "@/lib/avatar/dicebear";
import { facePng } from "@/lib/discord/faces";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const asked = Number(req.nextUrl.searchParams.get("size") ?? 256);
  const size = Number.isFinite(asked) ? Math.max(64, Math.min(512, Math.round(asked))) : 256;

  const { data } = await createServiceClient()
    .from("users")
    .select("id, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar")
    .eq("id", user.id)
    .maybeSingle();
  const row: AvatarFields = (data as AvatarFields | null) ?? { id: user.id };
  const choice = avatarChoice(row);
  const src =
    choice.kind === "photo"
      ? choice.url
      : generateDicebearAvatarDataUri(choice.seed, { ...(choice.options ?? {}), backgroundColor: "transparent" });

  let png = await facePng(src, size);
  // A picture that can't be read falls back to the generated avatar.
  if (!png && choice.kind === "photo") png = await facePng(generateDicebearAvatarDataUri(row.avatar_seed?.trim() || row.id, { backgroundColor: "transparent" }), size);
  if (!png) return new NextResponse("not_found", { status: 404 });

  const body = Buffer.from(png.slice(png.indexOf(",") + 1), "base64");
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
