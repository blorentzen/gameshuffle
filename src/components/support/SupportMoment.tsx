"use client";

/**
 * Support at the end of something fun (Britton's picks, 2026-10-19, VDh1QfETVjNTjjzeiKqLNg):
 * a finished daily, Fire Round, the Weekly, a Chat Brain answer, a trivia or party night, a
 * finished tournament, and a free tool once it's been used (`ready`: FreeToolShell flips it on the
 * first button pressed inside the tool). For everyone in the US, GS Pro
 * members included, at most once a week per browser; a supporter gets a thank-you line instead.
 * Never inside the Discord Activity, and nothing outside the US (support is US only for now).
 * Sits flat under a thin line (containers rule): a prompt, not a card.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconHeart } from "@tabler/icons-react";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { EVENTS, track } from "@/lib/analytics/events";
import { supportLevel } from "@/lib/support/rules";
import "@/styles/support.css";

/** The lowest monthly level, "$3". */
const FROM_PRICE = `$${(supportLevel("supporter")?.cents ?? 300) / 100}`;

const KEY = "gs-support-moment";
const WEEK = 7 * 86_400_000;

/** Seen within the week somewhere else: stay quiet. The same page may show it again (a re-render). */
function recentlyAsked(here: string): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number; where: string } | null;
    return !!raw && Date.now() - raw.at < WEEK && raw.where !== here;
  } catch { return false; }
}
function rememberAsked(here: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), where: here })); } catch { /* fine */ }
}

export function SupportMoment({ from, title = "Enjoying GameShuffle?", ready = true }: {
  /** Analytics place name (Support Clicked `from`). */
  from: string;
  /** What just happened, as a question: "Enjoying the dailies?" */
  title?: string;
  /** False until the thing on the page has been used (free tool pages). */
  ready?: boolean;
}) {
  const { activity } = useOriginalsHost();
  const status = useSupportStatus();
  const used = ready;
  const [state, setState] = useState<"wait" | "ask" | "quiet" | "closed">("wait");

  useEffect(() => {
    if (!status || !used || state !== "wait") return;
    const here = `${from}:${window.location.pathname}`;
    const ask = status.available && !status.supporter && !recentlyAsked(here);
    if (ask) rememberAsked(here);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once, after the status loads
    setState(ask ? "ask" : "quiet");
  }, [status, used, state, from]);

  if (activity || !status || !status.available) return null;
  if (status.supporter && used) {
    return (
      <p className="support-thankline">
        <IconHeart size={16} stroke={2} aria-hidden="true" />
        Thanks for supporting GameShuffle{status.name ? `, ${status.name}` : ""}.
      </p>
    );
  }
  if (state !== "ask") return null;
  const count = status.supportersThisMonth;
  return (
    <aside className="support-moment" aria-label="Support GameShuffle">
      <span className="support-tile support-tile--small" aria-hidden="true"><IconHeart size={18} stroke={2} /></span>
      <div className="support-moment__body">
        <p className="support-moment__title">{title}</p>
        <p className="support-moment__text">
          Players like you keep GameShuffle free.{count >= 5 ? ` ${count} people supported us this month.` : ""}
        </p>
        <div className="support-moment__actions">
          <Link href={`/support?from=${encodeURIComponent(from)}`} onClick={() => track(EVENTS.supportClicked, { from })}>
            <Button variant="secondary" size="small">Support GameShuffle</Button>
          </Link>
          <Button variant="ghost" size="small" onClick={() => setState("closed")}>Not now</Button>
        </div>
      </div>
    </aside>
  );
}

/**
 * The quiet second choice under a GS Pro wall's buttons: backing GameShuffle from $3 a month, the
 * lowest way in (Britton, 2026-10-29; it led with the $9 Backer level from 2026-10-19). It lands on the
 * Supporter level; the form shows Backer, with GS Pro, beside it. In the US only, and not for someone
 * who already supports us.
 */
export function SupportInstead({ from }: { from: string }) {
  const status = useSupportStatus();
  if (!status || !status.available || status.supporter) return null;
  return (
    <p className="support-instead">
      Or{" "}
      <Link href={`/support?level=supporter&from=${encodeURIComponent(`wall-${from}`)}#give`} onClick={() => track(EVENTS.supportClicked, { from: `wall-${from}` })}>
        <IconHeart size={15} stroke={2} aria-hidden="true" /> back GameShuffle from {FROM_PRICE} a month
      </Link>
    </p>
  );
}
