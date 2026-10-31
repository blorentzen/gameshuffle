import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";
import { answerFor, dayKey, guessLimits, puzzleFor, puzzleNumber } from "@/lib/originals/daily";
import { DEX_PUZZLE, dexAnswer, dexNumber } from "@/lib/originals/dailyDex";
import { DailySocialStage } from "@/components/originals/DailySocialStage";
import "../../../styles/social.css";

/**
 * /social/daily — a hidden 9:16 stage for the Daily's social videos (Britton,
 * 2026-10-16): the site's icon field behind today's first hint, the logo and
 * the way to play, animated in CSS and filmed for as long as a post needs
 * (scripts/.tmp/rec/social-daily.cjs). Only the first hint shows: everyone
 * sees it before their first guess, so a post gives nobody a head start.
 *
 * It reads any day's puzzle, so it opens only on the dev server or for staff;
 * everyone else gets page not found. Never in the sitemap or search.
 *   ?day=YYYY-MM-DD  the puzzle day (default today, Pacific)
 *   ?paused=1        hold every animation until the recorder adds `go`
 *   ?game=dex        the Daily Dex (its own colors, glyphs and link)
 */

export const metadata: Metadata = {
  title: "Daily social stage",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SocialDailyPage({ searchParams }: { searchParams: Promise<{ day?: string; paused?: string; game?: string }> }) {
  if (process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : dayKey();
  if (sp.game === "dex") {
    const hint = dexAnswer(day).ladder?.find((h) => h.after === 0)?.text;
    if (!hint || dexNumber(day) < 1) notFound(); // a day before launch, or one whose nods aren't written yet
    return <DailySocialStage game="dex" number={dexNumber(day)} hint={hint} guesses={guessLimits(DEX_PUZZLE).main} paused={sp.paused === "1"} />;
  }
  const puzzle = puzzleFor(day);
  const hint = answerFor(day).ladder?.find((h) => h.after === 0)?.text;
  if (!hint) notFound(); // only puzzles with a hint ladder (All-Stars) have a first hint to post
  return (
    <DailySocialStage
      number={puzzleNumber(day)}
      hint={hint}
      guesses={guessLimits(puzzle).main}
      paused={sp.paused === "1"}
    />
  );
}
