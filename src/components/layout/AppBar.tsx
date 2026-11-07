"use client";

/**
 * The phone app bar for members (phone picks 2026-11-05, 4A; built with /home, journeys picks 2026-11-06): Home, Games,
 * Create, Inbox, You along the foot of the screen below 768px. Home is your room, Games your game spaces, Create a
 * window of things to start, Inbox the Comms Center with its unread count, You your profile. Not on screens that are a
 * game in progress (the companion's board, a party game on your phone, trivia answers) or the sign-in pages.
 *
 * CascadeDS has no bottom tab bar (raise it on the CDS fix list), so this is a plain nav of links with
 * aria-current; Create opens a CDS Modal, shown as a sheet from the bottom.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Modal } from "@empac/cascadeds";
import {
  IconArrowsShuffle, IconCalendarEvent, IconConfetti, IconDeviceGamepad2, IconDeviceTv, IconHome, IconInbox, IconMessage2,
  IconPlus, IconTournament, IconUserCircle, type Icon,
} from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { IconTile } from "@/components/ui/IconTile";
import { useCommsUnread } from "@/lib/social/useCommsUnread";
import { createClient } from "@/lib/supabase/client";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/app-bar.css";

/** Screens with their own controls at the foot, or no place for the bar. */
const HIDDEN = [/^\/tcg-companion/, /^\/party\//, /^\/trivia\/(play|tv)\//, /^\/discord\/activity/, /^\/login/, /^\/signup/, /^\/auth\//, /^\/reset-password/, /^\/forgot-password/];

type CreateItem = { key: string; label: string; line: string; href: string; icon: Icon; tone: "violet" | "magenta" | "teal" | "blue" | "orange" | "red" };
const CREATE: CreateItem[] = [
  { key: "roll", label: "Roll something", line: "A randomizer for any of 18 games", href: "/randomizers", icon: IconArrowsShuffle, tone: "violet" },
  { key: "party", label: "Start a party game", line: "Everyone joins on their phone", href: "/game-nights/tools/night-planner", icon: IconConfetti, tone: "magenta" },
  { key: "night", label: "Host a game night", line: "An event people can find and join", href: "/game-nights/create", icon: IconCalendarEvent, tone: "teal" },
  { key: "tournament", label: "Run a tournament", line: "Brackets, Swiss or points", href: "/tournament/create", icon: IconTournament, tone: "blue" },
  { key: "post", label: "Write a post", line: "Clips, wins, questions", href: "/communities", icon: IconMessage2, tone: "orange" },
];
const STREAM: CreateItem = { key: "stream", label: "Plan a stream", line: "Set up your next stream", href: "/hub/sessions/new", icon: IconDeviceTv, tone: "red" };

export function AppBar() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "/";
  const unread = useCommsUnread();
  const [me, setMe] = useState<{ username: string | null; streamer: boolean } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    let gone = false;
    const db = createClient();
    Promise.all([
      db.from("users").select("username, is_public").eq("id", user.id).maybeSingle(),
      db.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
    ]).then(([u, t]) => {
      if (gone) return;
      const row = u.data as { username: string | null; is_public: boolean | null } | null;
      setMe({ username: row?.username && row.is_public !== false ? row.username : null, streamer: !!t.data });
    });
    return () => { gone = true; };
  }, [user]);

  if (!user || HIDDEN.some((r) => r.test(pathname))) return null;

  const youHref = me?.username ? `/u/${me.username}` : "/account";
  const on = {
    home: pathname === "/home",
    games: pathname === "/games" || pathname.startsWith("/games/"),
    inbox: pathname.startsWith("/comms"),
    you: (me?.username && pathname === `/u/${me.username}`) || pathname.startsWith("/account"),
  };
  const items = me?.streamer ? [...CREATE, STREAM] : CREATE;
  const tab = (key: string, href: string, label: string, Glyph: Icon, current: boolean, badge = 0) => (
    <li key={key}>
      <Link href={href} className="app-bar__tab" aria-current={current ? "page" : undefined} onClick={() => track(EVENTS.appBarUsed, { tab: key })}>
        <span className="app-bar__icon">
          <Glyph size={24} stroke={current ? 2.2 : 1.8} aria-hidden="true" />
          {badge > 0 && <span className="app-bar__badge">{badge > 9 ? "9+" : badge}<span className="sr-only"> unread</span></span>}
        </span>
        <span className="app-bar__label">{label}</span>
      </Link>
    </li>
  );

  return (
    <>
      <nav className="app-bar" aria-label="Your places">
        <ul>
          {tab("home", "/home", "Home", IconHome, on.home)}
          {tab("games", "/games", "Games", IconDeviceGamepad2, on.games)}
          <li>
            <button type="button" className="app-bar__tab app-bar__create" aria-haspopup="dialog" aria-expanded={creating} onClick={() => { setCreating(true); track(EVENTS.appBarUsed, { tab: "create" }); }}>
              <span className="app-bar__icon app-bar__plus"><IconPlus size={24} stroke={2.2} aria-hidden="true" /></span>
              <span className="app-bar__label">Create</span>
            </button>
          </li>
          {tab("inbox", "/comms", "Inbox", IconInbox, on.inbox, unread.total)}
          {tab("you", youHref, "You", IconUserCircle, !!on.you)}
        </ul>
      </nav>
      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Create" size="small" className="app-create">
        <ul className="app-create__list">
          {items.map((c) => (
            <li key={c.key}>
              <Link href={c.href} className="app-create__item" onClick={() => { setCreating(false); track(EVENTS.appBarUsed, { tab: "create", to: c.key }); }}>
                <IconTile icon={c.icon} tone={c.tone} />
                <span><b>{c.label}</b><small>{c.line}</small></span>
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
