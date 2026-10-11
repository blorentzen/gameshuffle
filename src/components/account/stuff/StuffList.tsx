"use client";

/**
 * The My Stuff row list: events, seasons and saved games you manage, one line
 * each, built on CDS List. A row is a thumbnail (the event's own cover, else
 * the game's box art, else its generated art), a title linking to the public
 * page, one meta line, then chips and at most one action button.
 *
 * Discovery pages keep the big EventCard; this is the management view, so it
 * trades the artwork for a list you can scan (2026-10-09 design pass).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, List, ListItem } from "@empac/cascadeds";
import { GameCover } from "@/components/games/GameCover";
import { EventHeaderArt, type ArtCategory } from "@/components/events/EventHeaderArt";
import { AdminSection } from "@/components/account/admin/AdminKit";

/** The viewer's zone for event times: their profile timezone, else the browser's. */
export function viewerTimeZone(profileTz?: string | null): string | null {
  if (profileTz) return profileTz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function StuffThumb({ cover, game, art, seed }: {
  cover?: string | null;
  game?: { slug?: string; name: string } | null;
  art?: ArtCategory;
  seed: string;
}) {
  return (
    <span className="stuff-thumb" aria-hidden>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- organizer upload on our own host, sized by CSS
        <img src={cover} alt="" loading="lazy" />
      ) : game ? (
        <GameCover slug={game.slug} name={game.name} className="stuff-thumb__cover" />
      ) : (
        <EventHeaderArt category={art ?? "mixed"} seed={seed} className="stuff-thumb__art" />
      )}
    </span>
  );
}

export function StuffRow({ thumb, title, href, meta, badges, action }: {
  thumb: ReactNode;
  title: string;
  href: string;
  meta?: ReactNode;
  badges?: ReactNode;
  /** One button at the end of the row (Manage, Resume). */
  action?: { label: string; href?: string; onClick?: () => void; variant?: "primary" | "secondary" };
}) {
  const router = useRouter();
  const button = action && (
    <Button
      size="small"
      variant={action.variant ?? "secondary"}
      onClick={action.onClick ?? (() => action.href && router.push(action.href))}
      aria-label={`${action.label} ${title}`}
    >
      {action.label}
    </Button>
  );
  return (
    <ListItem
      className="stuff-row"
      icon={thumb}
      suffix={badges || button ? <>{badges}{button}</> : undefined}
    >
      <Link href={href} className="stuff-row__title">{title}</Link>
      {meta && <span className="stuff-row__meta">{meta}</span>}
    </ListItem>
  );
}

/** A titled group of rows; long groups show `page` at a time with "Show more". */
export function StuffGroup<T>({ title, intro, items, page = 0, row }: {
  title: string;
  intro?: ReactNode;
  items: T[];
  page?: number;
  row: (item: T) => ReactNode;
}) {
  const [shown, setShown] = useState(page || items.length);
  if (items.length === 0) return null;
  const more = Math.min(page, items.length - shown);
  return (
    <AdminSection title={`${title} (${items.length})`} intro={intro}>
      <List divided className="stuff-list">{items.slice(0, shown).map(row)}</List>
      {more > 0 && (
        <div>
          <Button variant="ghost" size="small" onClick={() => setShown((s) => s + page)}>Show {more} more</Button>
        </div>
      )}
    </AdminSection>
  );
}
