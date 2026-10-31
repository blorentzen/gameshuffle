import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";
import { ClipStage } from "@/components/originals/ClipStage";
import type { ArtCategory } from "@/components/events/EventHeaderArt";
import "../../../styles/social.css";

/**
 * /social/clip — the hidden 9:16 stage for the "tool moment" social videos
 * (Britton's picks, 2026-10-17): a hook, one of our pages running inside a
 * phone-sized window, and where to find it. Filmed by
 * scripts/.tmp/rec/social-clip.cjs, which drives the page while it records.
 *
 * Staff only in production; open on the dev server. Never in the sitemap or search.
 *   ?src=/randomizers/…   the page to show (a path on this site)
 *   ?hook=…               the line on top
 *   ?cta=…                the pill at the end (default "Play free at gameshuffle.co")
 *   ?sub=…                a small line under the pill
 *   ?accent=…             the ground's colors (a browse-hero accent: daily, dex, gold, red…)
 *   ?field=…              the glyph field's category (video, board, heroes, tools…)
 *   ?cta_at=16            when the pill appears, in seconds
 *   ?pw=330               the width the page renders at (320 to 430, default 390): narrower = bigger in the window
 *   ?paused=1             hold until the recorder adds `go`
 *   ?end_title=…          an end card at cta_at (the window steps away): its title
 *   ?end_lines=a|b|c      the end card's lines (up to four)
 */

export const metadata: Metadata = {
  title: "Clip stage",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ACCENTS = new Set(["gold", "cyan", "violet", "blue", "orange", "red", "daily", "dex", "weekly", "brain", "fire", "duel"]);
const FIELDS = new Set<string>(["compete", "board", "video", "tcg", "mixed", "stream", "series", "tools", "mystery", "minigame", "brain", "originals", "heroes", "daily", "dex", "weekly", "community", "fire", "duel"]);

export default async function SocialClipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  const sp = await searchParams;
  // Only our own pages: a path, never another site.
  const src = sp.src && sp.src.startsWith("/") && !sp.src.startsWith("//") ? sp.src : null;
  if (!src) notFound();
  const ctaAt = Number(sp.cta_at);
  const pw = Number(sp.pw);
  return (
    <ClipStage
      src={src}
      hook={(sp.hook ?? "").slice(0, 140)}
      cta={(sp.cta ?? "Play free at gameshuffle.co").slice(0, 60)}
      sub={sp.sub ? sp.sub.slice(0, 90) : null}
      accent={sp.accent && ACCENTS.has(sp.accent) ? sp.accent : "blue"}
      field={(sp.field && FIELDS.has(sp.field) ? sp.field : "video") as ArtCategory}
      ctaAt={Number.isFinite(ctaAt) && ctaAt > 0 ? ctaAt : 16}
      pageWidth={Number.isFinite(pw) && pw >= 320 && pw <= 430 ? pw : undefined}
      paused={sp.paused === "1"}
      endTitle={sp.end_title ? sp.end_title.slice(0, 40) : null}
      endLines={(sp.end_lines ?? "").split("|").map((l) => l.trim().slice(0, 70)).filter(Boolean).slice(0, 4)}
    />
  );
}
