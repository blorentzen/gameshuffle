/**
 * GET /api/chat-brain/share/[id]?format=og|story
 * The share image for one Chat Brain question: og (1200×630, link previews on
 * X, Bluesky, Discord, Reddit) or story (1080×1920, Instagram and TikTok
 * stories, where links don't preview). Text only, on the brand gradient.
 */
import { ImageResponse } from "next/og";
import { getPublicPrompt } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = new URL(req.url).searchParams.get("format") === "story";
  const p = await getPublicPrompt(id);
  if (!p) return new Response("not found", { status: 404 });
  const w = story ? 1080 : 1200, h = story ? 1920 : 630;
  const q = p.text;
  const size = story ? (q.length > 70 ? 76 : 92) : (q.length > 70 ? 54 : 66);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: story ? "140px 90px" : "64px 72px", background: "linear-gradient(135deg, #2d1b8f 0%, #4b3bd6 55%, #7a3fe0 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: story ? 84 : 60, height: story ? 84 : 60, borderRadius: 18, background: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", fontSize: story ? 48 : 34, fontWeight: 800 }}>CB</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: story ? 52 : 36, fontWeight: 800, letterSpacing: -1 }}>Chat Brain</div>
            <div style={{ fontSize: story ? 30 : 22, opacity: 0.8 }}>a GameShuffle Original</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: size, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1.5 }}>{q}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: story ? 40 : 28 }}>
          <div style={{ display: "flex", padding: story ? "22px 36px" : "14px 26px", borderRadius: 999, background: "#ffd166", color: "#2d1b8f", fontWeight: 800 }}>Answer in 5 seconds</div>
          <div style={{ display: "flex", opacity: 0.85 }}>gameshuffle.co</div>
        </div>
      </div>
    ),
    { width: w, height: h, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
