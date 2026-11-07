"use client";

/**
 * "Kai brought you here" (bring-along picks 2026-11-05, 1A): on the welcome page after sign-up, the person whose link
 * brought you, with Follow. Following turns the button into "Following" in place; when they follow back you're
 * friends. Asks /api/account/brought-by once with what this browser remembers (a profile, live page or event of
 * theirs, or their invite code); nothing shows when nobody brought you or after "Not now".
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconCheck, IconUserPlus } from "@tabler/icons-react";
import { UserAvatar } from "@/components/UserAvatar";
import { GameCover } from "@/components/games/GameCover";
import { useToast } from "@/components/toast/ToastProvider";
import { readCameFrom } from "./CameFrom";
import { storedReferral } from "@/lib/originals/referral";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/social-cards.css";

interface Bringer { id: string; name: string; username: string; avatar: { id: string; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null }; games: string[]; following: boolean }

const DISMISS = "gs-brought-dismissed";

/** "A", "A and B", "A, B and C". */
const andList = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

export function BroughtByCard() {
  const toast = useToast();
  const [bringer, setBringer] = useState<Bringer | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(DISMISS) === "1") return; } catch { /* private mode */ }
    const body = { userId: readCameFrom(), code: storedReferral()?.code ?? null };
    void fetch("/api/account/brought-by", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => (r.ok ? r.json() : null)).then((j: { bringer?: Bringer | null } | null) => {
        if (j?.bringer) { setBringer(j.bringer); setFollowing(j.bringer.following); }
      }).catch(() => {});
  }, []);

  if (!bringer || hidden) return null;
  const follow = async () => {
    setBusy(true);
    const ok = await fetch("/api/account/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: bringer.id }) }).then((r) => r.ok).catch(() => false);
    setBusy(false);
    if (!ok) { toast.error("That didn't go through. Try again."); return; }
    setFollowing(true);
    track(EVENTS.homeSectionClicked, { to: "brought-by-follow" });
  };
  const dismiss = () => { try { localStorage.setItem(DISMISS, "1"); } catch { /* private mode */ } setHidden(true); };

  return (
    <section className="brought" aria-labelledby="brought-title">
      <div className="brought__who">
        <UserAvatar user={bringer.avatar} size={64} className="brought__face" />
        <div className="brought__text">
          <span className="brought__kick">You came from {bringer.name}&apos;s link</span>
          <h2 id="brought-title">{bringer.name} brought you here</h2>
        </div>
      </div>
      <p>{bringer.games.length ? `${bringer.name} plays ${andList(bringer.games)}. ` : ""}Follow and their results show on your home; when they follow back, you&apos;re friends.</p>
      {bringer.games.length > 0 && (
        <ul className="brought__games" aria-hidden="true">{bringer.games.map((g) => <li key={g}><GameCover name={g} /></li>)}</ul>
      )}
      <div className="brought__acts">
        {following
          ? <span className="brought__done" role="status"><IconCheck size={18} stroke={2.5} aria-hidden="true" />Following {bringer.name}</span>
          : <Button variant="primary" iconBefore={IconUserPlus} loading={busy} onClick={() => void follow()}>Follow {bringer.name}</Button>}
        <Link href={`/u/${bringer.username}`} className="brought__profile">See {bringer.name}&apos;s profile</Link>
        <Button variant="ghost" className="brought__later" onClick={dismiss}>Not now</Button>
      </div>
    </section>
  );
}
