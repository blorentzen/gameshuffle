import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { liveWar, latestWar } from "@/lib/wars/store";
import { typedOn } from "@/lib/wars/cardStore";
import { runTyped } from "@/lib/wars/typed";
import { editCard, postCard } from "@/lib/wars/discord";

/**
 * Plain messages typed in a war's channel (overrides picks 5 to 7), passed on by the always-on worker
 * (discord-worker, connected as GameShuffle Competitive with Message Content). The worker only sends messages from
 * channels with a war going; this reads the line the way /race does and says what the worker should do: a check mark,
 * a short reply, or nothing (chat). Off until WARS_TYPED_SECRET is set on both sides.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowed(req: Request): boolean {
  const secret = process.env.WARS_TYPED_SECRET ?? "";
  const got = req.headers.get("x-typed-secret") ?? "";
  if (secret.length < 24 || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

const ID = /^[0-9]{5,25}$/;

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "not_allowed" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { guildId?: string; channelId?: string; authorId?: string; authorName?: string; content?: string } | null;
  const guildId = String(body?.guildId ?? "");
  const channelId = String(body?.channelId ?? "");
  const authorId = String(body?.authorId ?? "");
  const content = String(body?.content ?? "").slice(0, 80);
  if (!ID.test(guildId) || !ID.test(channelId) || !ID.test(authorId) || !content.trim()) return NextResponse.json({ action: "none" });
  if (!(await typedOn(guildId, channelId))) return NextResponse.json({ action: "none" });
  const war = (await liveWar(guildId, channelId)) ?? (await latestWar(guildId, channelId).then((w) => (w && w.status === "done" && Date.now() - Date.parse(w.updatedAt) < 6 * 3600_000 ? w : null)));
  if (!war) return NextResponse.json({ action: "none" });
  const res = await runTyped(war, content, { id: authorId, name: String(body?.authorName ?? "Someone").slice(0, 32) });
  if (res.kind === "none") return NextResponse.json({ action: "none" });
  if (res.card) after(async () => { await (res.card === "post" ? postCard(war.id) : editCard(war.id)); });
  // Done: a check mark, plus a short reply when there's something to say (a fix, a penalty, places that were topped
  // up); a new race shows on the moving card. Not done: a short reply saying why.
  if (!res.ok) return NextResponse.json({ action: "reply", text: res.text ?? "That didn't go in." });
  return NextResponse.json({ action: res.text ? "react_reply" : "react", emoji: "✅", text: res.text });
}
