/**
 * A server's team logos on GameShuffle (the Logos page, war tools pick 5A). The server's owner (who added GameShuffle
 * Competitive there) and staff only.
 *   GET    ?guild=<id>                         { serverName, logos, teams }
 *   POST   form: guild, tag, name?, file       checks and saves one logo (replacing the tag's) → { logo, replaced, unsure }
 *   DELETE ?guild=<id>&tag=<tag>               takes one down
 * The page sends many files one POST at a time, so each gets its own answer.
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { compAppLive } from "@/lib/discord/appIds";
import { warsReady } from "@/lib/wars/store";
import { liveWarsWithTag, removeLogo, saveLogoNow } from "@/lib/wars/logos";
import { logoManager, logoPageData } from "@/lib/wars/logoAdmin";
import { editCard } from "@/lib/wars/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const cleanTag = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 12);

async function manager(guild: string | null) {
  if (!compAppLive() || !(await warsReady())) return { error: NextResponse.json({ error: "not_ready" }, { status: 503 }) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "signin" }, { status: 401 }) };
  const m = guild ? await logoManager(user.id, guild) : null;
  if (!m) return { error: NextResponse.json({ error: "not_yours" }, { status: 404 }) };
  return { m, guild: guild! };
}

const redraw = (guild: string, tag: string) => after(async () => {
  for (const id of await liveWarsWithTag(guild, tag)) await editCard(id);
});

export async function GET(req: Request) {
  const guild = new URL(req.url).searchParams.get("guild");
  const r = await manager(guild);
  if ("error" in r) return r.error;
  return NextResponse.json({ serverName: r.m.serverName, ...(await logoPageData(r.guild)) });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await manager(String(form.get("guild") ?? ""));
  if ("error" in r) return r.error;
  if (!(await rateLimit(`war-logo-upload:${r.m.userId}`, { max: 60, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const tag = cleanTag(form.get("tag"));
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || null;
  const file = form.get("file");
  if (!tag) return NextResponse.json({ error: "no_tag" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 415 });
  const res = await saveLogoNow({ guildId: r.guild, tag, name, image: new Uint8Array(await file.arrayBuffer()), by: r.m.by, userId: r.m.userId });
  if (!res.ok) return NextResponse.json({ error: res.error, reason: res.reason ?? null }, { status: res.error === "refused" ? 422 : res.error === "storage_off" ? 503 : 400 });
  redraw(r.guild, tag);
  return NextResponse.json({ logo: { tag: res.logo.tag, name: res.logo.name, url: res.logo.url, verdict: res.logo.verdict, by: res.logo.createdByName }, replaced: res.replaced, unsure: res.unsure });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const r = await manager(url.searchParams.get("guild"));
  if ("error" in r) return r.error;
  const tag = cleanTag(url.searchParams.get("tag"));
  const res = await removeLogo(r.guild, tag, r.m.by, true);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 });
  redraw(r.guild, tag);
  return NextResponse.json({ ok: true });
}
