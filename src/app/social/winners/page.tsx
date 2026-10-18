import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";
import { dayKey } from "@/lib/originals/daily";
import { gsAddDays } from "@/lib/time/gsClock";
import { sectionHead, winnersFor } from "@/lib/daily/winners";
import { generateDicebearAvatarDataUri } from "@/lib/avatar/dicebear";
import { winnersCaption, winnersDateLabel, type WinnerRow, type WinnersSection } from "@/lib/originals/winners";
import { WinnersStage } from "@/components/originals/WinnersStage";
import "../../../styles/social.css";

/**
 * /social/winners — the hidden 9:16 stage for the morning winners video
 * (Britton's picks, 2026-10-16): yesterday's top 5 on the Daily Shuffle and
 * the Daily Dex, filmed on Britton's phone from the start screen (Play, Copy
 * caption) or by the recorder (?paused=1). Names come from the day boards as
 * they show them; anyone who opted out in Settings ▸ Privacy is "A player".
 *
 * Staff only in production (it shows people's names before the post goes
 * up); open on the dev server. Never in the sitemap or search.
 *   ?day=YYYY-MM-DD  the day to celebrate (default yesterday, Pacific)
 *   ?paused=1        no start screen; hold until the recorder adds `go`
 *   ?rows=…          dev server only: base64url JSON { shuffle?: { rows, finishers }, dex?: … }
 *                    standing in for the boards, so the recorder can film a day read from production
 */

export const metadata: Metadata = {
  title: "Winners stage",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type GivenRows = Partial<Record<"shuffle" | "dex", { rows: WinnerRow[]; finishers: number }>>;

/** Dev only: sections from rows passed in the URL instead of the boards. */
function givenSections(raw: string, day: string): WinnersSection[] | null {
  try {
    const given = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GivenRows;
    // "dicebear:<seed>" stands in for a generated avatar, which is too long for a URL.
    const face = (r: WinnerRow): WinnerRow => (r.avatar?.startsWith("dicebear:") ? { ...r, avatar: generateDicebearAvatarDataUri(r.avatar.slice(9), null) } : r);
    return (["shuffle", "dex"] as const).flatMap((g) => (given[g] ? [{ ...sectionHead(g, day), rows: given[g]!.rows.map(face), finishers: given[g]!.finishers }] : []));
  } catch {
    return null;
  }
}

export default async function SocialWinnersPage({ searchParams }: { searchParams: Promise<{ day?: string; paused?: string; rows?: string }> }) {
  if (process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : gsAddDays(dayKey(), -1);
  const given = process.env.NODE_ENV === "development" && sp.rows ? givenSections(sp.rows, day) : null;
  const sections = given ?? (await winnersFor(day));
  return <WinnersStage dateLabel={winnersDateLabel(day)} sections={sections} caption={winnersCaption(sections)} paused={sp.paused === "1"} />;
}
