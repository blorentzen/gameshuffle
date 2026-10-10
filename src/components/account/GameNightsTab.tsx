"use client";

/**
 * My Stuff ▸ Events ▸ Game nights: nights you host and nights you're going to,
 * as a list per stage (coming up, past, then archived out of the way). Rows
 * come from StuffList; discovery pages keep the big event cards. Backed by
 * /api/account/game-nights.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Accordion, Badge, Button, EmptyState, List } from "@empac/cascadeds";
import { IconCalendarEvent } from "@tabler/icons-react";
import { formatEventShort } from "@/lib/time/format";
import { artCategoryFor } from "@/lib/events/artCategory";
import type { GameNight } from "@/lib/game-nights/types";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { StuffGroup, StuffRow, StuffThumb, viewerTimeZone } from "@/components/account/stuff/StuffList";
import { LoadingLines } from "@/components/loading/LoadingLines";

interface Entry { night: GameNight; role: "host" | "attend" }

/** A night counts as past a few hours after it starts (most run 3 hours or so). */
const PAST_AFTER_MS = 6 * 3600_000;

const startOf = (e: Entry) => (e.night.starts_at ? Date.parse(e.night.starts_at) : Number.POSITIVE_INFINITY);

export function GameNightsTab({ timeZone }: { timeZone?: string | null } = {}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/game-nights")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const hosting: GameNight[] = Array.isArray(j?.hosting) ? j.hosting : [];
        const attending: GameNight[] = Array.isArray(j?.attending) ? j.attending : [];
        setEntries([
          ...hosting.map((night) => ({ night, role: "host" as const })),
          ...attending.filter((n) => !hosting.some((h) => h.id === n.id)).map((night) => ({ night, role: "attend" as const })),
        ]);
      })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const list = entries ?? [];
    // eslint-disable-next-line react-hooks/purity -- "now" only sorts rows into coming up / past for this render
    const now = Date.now();
    const off = (e: Entry) => !!e.night.archived_at || e.night.status === "cancelled";
    const past = (e: Entry) => e.night.status === "ended" || startOf(e) < now - PAST_AFTER_MS;
    return {
      upcoming: list.filter((e) => !off(e) && !past(e)).sort((a, b) => startOf(a) - startOf(b)),
      past: list.filter((e) => !off(e) && past(e)).sort((a, b) => startOf(b) - startOf(a)),
      archived: list.filter(off),
    };
  }, [entries]);

  const tz = viewerTimeZone(timeZone);

  if (entries === null) {
    return <AdminScreen title="Game nights"><LoadingLines label="Loading your game nights" /></AdminScreen>;
  }

  const row = ({ night: n, role }: Entry, opts: { status?: boolean } = {}) => (
    <StuffRow
      key={`${n.id}-${role}`}
      thumb={<StuffThumb cover={n.cover_image_url} art={artCategoryFor("game-night", n.kind)} seed={n.id} />}
      title={n.title}
      href={`/game-nights/${n.id}`}
      meta={<>{n.starts_at ? formatEventShort(n.starts_at, tz) : "No date yet"}{n.place ? ` · ${n.place}` : ""}</>}
      badges={
        <>
          {opts.status && n.status === "draft" && <Badge size="small" variant="default">Draft</Badge>}
          {opts.status && n.status === "cancelled" && <Badge size="small" variant="default">Cancelled</Badge>}
          {opts.status && n.archived_at && n.status !== "cancelled" && <Badge size="small" variant="default">Archived</Badge>}
          {/* Nights you host carry a Manage button; the rest say you're going. */}
          {role === "attend" && <Badge size="small" variant="outline">Going</Badge>}
        </>
      }
      action={role === "host" ? { label: "Manage", href: `/game-nights/${n.id}/manage` } : undefined}
    />
  );

  return (
    <AdminScreen
      title="Game nights"
      intro="Nights you host and nights you're going to. Times are in your timezone."
      actions={entries.length > 0 ? <Button variant="primary" onClick={() => router.push("/game-nights/create")}>Host a night</Button> : undefined}
    >
      {entries.length === 0 ? (
        <EmptyState
          variant="bordered"
          icon={<IconCalendarEvent size={40} stroke={1.4} />}
          title="No game nights yet"
          description="Find a night near you, or host one: board games, video games, cards or a mix."
          action={
            <div className="stuff-empty-actions">
              <Button variant="primary" onClick={() => router.push("/game-nights/create")}>Host a night</Button>
              <Button variant="secondary" onClick={() => router.push("/game-nights")}>Find a night</Button>
            </div>
          }
        />
      ) : (
        <>
          <StuffGroup title="Coming up" items={groups.upcoming} row={(e) => row(e, { status: true })} />
          <StuffGroup title="Past" items={groups.past} page={5} row={(e) => row(e)} />
          {groups.archived.length > 0 && (
            <Accordion
              variant="bordered"
              items={[{
                id: "archived",
                title: `Archived and cancelled (${groups.archived.length})`,
                content: <List divided className="stuff-list">{groups.archived.map((e) => row(e, { status: true }))}</List>,
              }]}
            />
          )}
        </>
      )}
    </AdminScreen>
  );
}
