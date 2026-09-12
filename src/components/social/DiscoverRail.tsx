"use client";

/**
 * Community Hub discovery rail — a scrollable list of every community with a
 * one-tap Join, a quick read of what each is about (top topics), and member
 * count. Joining is optimistic and idempotent via the membership API.
 */

import { useState } from "react";
import Link from "next/link";
import { Card, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { DiscoverCommunity } from "@/lib/communities/discover";

function CommunityRow({ c, isAuthed }: { c: DiscoverCommunity; isAuthed: boolean }) {
  const toast = useToast();
  const [joined, setJoined] = useState(c.isMember);
  const [busy, setBusy] = useState(false);
  const name = c.displayName || `@${c.slug}`;

  async function join() {
    if (busy || joined) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${c.id}/membership`, { method: "POST" });
      if (res.ok) { setJoined(true); toast.success(`Joined ${name}.`); }
      else if (res.status === 401) toast.error("Sign in to join communities.");
      else toast.error("Couldn't join. Try again.");
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  return (
    <li className="drail__item">
      <Link href={`/c/${c.slug}`} className="drail__link">
        <span className="drail__avatar" aria-hidden>{name.replace("@", "")[0]?.toUpperCase() ?? "?"}</span>
        <span className="drail__body">
          <span className="drail__name">{name}</span>
          <span className="drail__meta">
            {c.memberCount.toLocaleString()} {c.memberCount === 1 ? "member" : "members"}
            {c.platforms.length > 0 && (
              <span className="drail__platforms">{c.platforms.slice(0, 3).map((p) => <PlatformIcon key={p} platform={p} size={12} />)}</span>
            )}
          </span>
          {c.topics.length > 0 && (
            <span className="drail__topics">{c.topics.map((t) => <span key={t} className="drail__topic">{t}</span>)}</span>
          )}
        </span>
      </Link>
      {isAuthed && (
        joined ? (
          <span className="drail__joined">Joined</span>
        ) : (
          <Button variant="secondary" size="small" onClick={() => void join()} disabled={busy}>{busy ? "…" : "Join"}</Button>
        )
      )}
    </li>
  );
}

export function DiscoverRail({ communities, isAuthed }: { communities: DiscoverCommunity[]; isAuthed: boolean }) {
  return (
    <Card padding="large">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--spacing-12)" }}>
        <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: 0 }}>Discover communities</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{communities.length}</span>
      </div>
      {communities.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          No communities yet. When creators go live and run sessions, they show up here.
        </p>
      ) : (
        <ul className="drail__list">
          {communities.map((c) => <CommunityRow key={c.id} c={c} isAuthed={isAuthed} />)}
        </ul>
      )}
    </Card>
  );
}
