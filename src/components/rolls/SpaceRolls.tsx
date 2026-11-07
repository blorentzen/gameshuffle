"use client";

/**
 * A game space's Rolls tab (round two picks 5A to 7A, 2026-11-06). "Roll for me": one tap rolls from the game's own
 * randomizer (the server rolls and signs it), shown large; Roll again, and Share it here posts it in the space so
 * people can react and comment. The full randomizer stays its own page (search earns there), linked under it. Then the
 * rolls people shared.
 */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { RollReelCard } from "@/components/rolls/RollReelCard";
import { GhostRoll } from "@/components/ui/Ghost";
import { PostCard } from "@/components/social/PostCard";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import type { FeedPost } from "@/lib/social/feed";

export function SpaceRolls({ space, gameName, rollLabel, full, initialPosts, currentUserId, only }: {
  space: string;
  gameName: string;
  /** The first roll's button ("Roll a build"). */
  rollLabel: string;
  /** The full randomizer page. */
  full: { href: string; label: string };
  initialPosts: FeedPost[];
  currentUserId: string | null;
  /** "roll": only Roll for me, for the Now tab's rail while nobody has shared a roll (other spaces pass, 2026-11-06). */
  only?: "roll";
}) {
  const toast = useToast();
  const [got, setGot] = useState<{ roll: ChatRoll; sig: string; reel?: RollSlot[][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [posts, setPosts] = useState(initialPosts);

  async function roll() {
    setBusy(true);
    try {
      const r = await fetch(`/api/games/${space}/roll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "roll" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.roll) { setGot({ roll: d.roll, sig: d.sig, reel: Array.isArray(d.reel) ? d.reel : undefined }); setShared(false); }
      else toast.error(r.status === 429 ? "That's a lot of rolls. Give it a minute." : "The randomizer didn't answer. Try again.");
    } catch { toast.error("The randomizer didn't answer. Try again."); }
    setBusy(false);
  }

  async function share() {
    if (!got) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/games/${space}/roll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "share", roll: got.roll, sig: got.sig }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setShared(true);
        if (d.post) setPosts((ps) => [d.post as FeedPost, ...ps]);
        toast.success(`Shared in ${gameName}.`);
      } else toast.error(r.status === 429 ? "You're posting fast. Give it a minute." : "Couldn't share that roll. Try again.");
    } catch { toast.error("Couldn't share that roll. Try again."); }
    setBusy(false);
  }

  const back = only ? `/games/${space}` : `/games/${space}?tab=rolls`;
  const headingId = only ? "sp-roll-now" : "sp-roll";
  const rollTile = (
    <section className={`room-tile space-roll${only ? " room-rail__block space-roll--rail" : ""}`} aria-labelledby={headingId}>
      <div className="room-tile__head">
        <h2 id={headingId}>Roll for me</h2>
        {only && shared && <ArrowLink plain href="?tab=rolls" className="room-tile__more">Shared rolls</ArrowLink>}
      </div>
      {got ? <RollReelCard roll={got.roll} reel={got.reel} /> : <p className="room-tile__note">{only ? `One tap and the ${gameName} randomizer picks for you.` : `One tap and the ${gameName} randomizer picks for you. Share what you get and see what everyone else rolled.`}</p>}
      <div className="space-actions" aria-live="polite">
        {got && (currentUserId ? (
          <Button variant="primary" onClick={() => void share()} disabled={busy || shared}>{shared ? "Shared" : "Share it here"}</Button>
        ) : (
          <Link href={`/login?redirect=${encodeURIComponent(back)}`} className="room-btn">Sign in to share it</Link>
        ))}
        <Button variant={got ? "secondary" : "primary"} onClick={() => void roll()} disabled={busy}>{got ? "Roll again" : rollLabel}</Button>
      </div>
      <ArrowLink href={full.href} className="space-roll__full">{full.label}</ArrowLink>
    </section>
  );
  if (only) return rollTile;
  return (
    <div className="space-stack">
      {rollTile}
      <section className="space-flat" aria-labelledby="sp-shared-rolls">
        <div className="room-tile__head"><h2 id="sp-shared-rolls">Shared rolls</h2></div>
        {posts.length ? (
          <div className="feed__list">
            {posts.map((p) => <PostCard key={p.id} post={p} currentUserId={currentUserId ?? ""} readOnly={!currentUserId} hideGame onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />)}
          </div>
        ) : (
          <GhostRoll notice={<p>Nobody has shared a roll this week. <b>Roll one above and share it here.</b></p>} />
        )}
      </section>
    </div>
  );
}
