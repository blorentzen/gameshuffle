"use client";

/**
 * Community Hub discovery rail — a scrollable list of every community with a
 * one-tap Join, a quick read of what each is about (top topics), and member
 * count. Joining is optimistic and idempotent via the membership API.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { PlatformIcon } from "@/components/PlatformIcon";
import { COMMUNITY_SUBTYPES } from "@/data/community-sections";
import type { DiscoverCommunity } from "@/lib/communities/discover";
import { IconFlag } from "@tabler/icons-react";

const subtypeLabel = (s: string | null): string | null =>
  s ? (COMMUNITY_SUBTYPES.find((x) => x.value === s)?.label ?? null) : null;


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
          {/* The kind pill and the member count are separate atoms on one row.
              They used to be inline text, so "23 members" could break across
              lines with "members" stranded under the pill. */}
          <span className="drail__meta">
            {c.kind === "group" && subtypeLabel(c.subtype) && (
              <span className="drail__kind">{subtypeLabel(c.subtype)}</span>
            )}
            <span className="drail__count">
              {c.memberCount.toLocaleString()} {c.memberCount === 1 ? "member" : "members"}
            </span>
            {c.platforms.length > 0 && (
              <span className="drail__platforms">{c.platforms.slice(0, 3).map((p) => <PlatformIcon key={p} platform={p} size={12} />)}</span>
            )}
          </span>
          {c.crewGames.length > 0 && (
            <span className="drail__crews" title={`Fields crews in ${c.crewGames.join(", ")}`}>
              <IconFlag size={13} stroke={1.9} aria-hidden /> {c.crewGames.slice(0, 3).join(" · ")}{c.crewGames.length > 3 ? ` +${c.crewGames.length - 3}` : ""}
            </span>
          )}
          {/* Two topics plus a counter. Unbounded, a community with five tags
              ran to three lines and every row in the rail became a different
              height. */}
          {c.topics.length > 0 && (
            <span className="drail__topics">
              {c.topics.slice(0, 2).map((t) => <span key={t} className="drail__topic">{t}</span>)}
              {c.topics.length > 2 && (
                <span className="drail__topic drail__topic--more" title={c.topics.join(", ")}>
                  +{c.topics.length - 2}
                </span>
              )}
            </span>
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

/** Rows before the card defers to "Show all". Keeps Discover from eating the
 *  whole rail, so the cards under it are reachable without scrolling first. */
const CAP = 6;

export function DiscoverRail({ communities, isAuthed }: { communities: DiscoverCommunity[]; isAuthed: boolean }) {
  // Filter is a kind ("all" | "channel" | "group") OR a group subtype value.
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);

  // Build the filter row from what's actually present: kinds, then the group
  // subtypes that exist (so we never show an empty subtype chip).
  const filters = useMemo(() => {
    const hasChannel = communities.some((c) => c.kind === "channel");
    const hasGroup = communities.some((c) => c.kind === "group");
    const subtypesPresent = new Set(
      communities.filter((c) => c.kind === "group" && c.subtype).map((c) => c.subtype as string),
    );
    const list: { value: string; label: string }[] = [{ value: "all", label: "All" }];
    if (hasChannel) list.push({ value: "channel", label: "Channels" });
    if (hasGroup) list.push({ value: "group", label: "Groups" });
    for (const s of COMMUNITY_SUBTYPES) {
      if (subtypesPresent.has(s.value)) list.push({ value: s.value, label: s.label });
    }
    // Only worth showing the row when there's more than one dimension to filter.
    return list.length > 2 ? list : [];
  }, [communities]);

  const shown = useMemo(() => {
    if (filter === "all") return communities;
    if (filter === "channel" || filter === "group") return communities.filter((c) => c.kind === filter);
    return communities.filter((c) => c.kind === "group" && c.subtype === filter);
  }, [communities, filter]);

  return (
    <Card padding="large">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--spacing-12)" }}>
        <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: 0 }}>Discover communities</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{shown.length}</span>
      </div>
      {/* Kind + subtype filter — only shows when there's more than one to pick. */}
      {filters.length > 0 && (
        <div style={{ display: "flex", gap: "var(--spacing-4)", flexWrap: "wrap", marginBottom: "var(--spacing-12)" }}>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`drail__filter${filter === f.value ? " drail__filter--on" : ""}`}
              onClick={() => { setFilter(f.value); setExpanded(false); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          {communities.length === 0
            ? "No communities yet. When creators go live and run sessions, they show up here."
            : "No communities match this filter yet."}
        </p>
      ) : (
        <>
          <ul className="drail__list">
            {(expanded ? shown : shown.slice(0, CAP)).map((c) => (
              <CommunityRow key={c.id} c={c} isAuthed={isAuthed} />
            ))}
          </ul>
          {shown.length > CAP && (
            <button type="button" className="drail__more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : `Show all ${shown.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
