"use client";

/**
 * Platform admin ▸ Overview ▸ Setup ▸ Games on Twitch (game spaces picks 2026-11-09, "Keep watching Twitch"): Twitch's
 * biggest games averaged over the last 30 evening readings, with whether we have a space or a catalog entry for each,
 * so the next wave of spaces is picked from a month of readings. Loads on its own (/api/admin/twitch-top), so a slow
 * Twitch reading never holds up the setup numbers. src/lib/platform/twitchTop.ts explains the counts.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconBrandTwitch, IconRefresh } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminSection, AdminTable } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import type { TwitchNow, TwitchNowGame } from "@/lib/platform/twitchTop";

const PAGE = 25;
const fmt = (n: number) => n.toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
});

export function PlatformTwitchNow() {
  const toast = useToast();
  const [now, setNow] = useState<TwitchNow | null>(null);
  const [failed, setFailed] = useState(false);
  const [taking, setTaking] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/twitch-top", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) { setFailed(true); return; }
      setFailed(false);
      setNow(body.now as TwitchNow);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function takeReading() {
    setTaking(true);
    try {
      const res = await fetch("/api/admin/twitch-top", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429 && body.retryAt) { toast.error(`A reading was just taken. Try again after ${when(body.retryAt)} Pacific.`); return; }
      if (!res.ok || !body.ok) { toast.error("Couldn't read Twitch just now. Try again in a minute."); return; }
      setNow(body.now as TwitchNow);
      setFailed(false);
      toast.success(`Read ${fmt(body.taken.games)} games from Twitch`);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setTaking(false);
    }
  }

  const ready = now?.ready ? now : null;
  const games = ready ? (openOnly ? ready.games.filter((g) => !g.space) : ready.games) : [];

  return (
    <div className="admin-setup__part admin-setup__part--games">
      <AdminSection
        title="Games on Twitch"
        icon={<IconBrandTwitch />}
        intro="Twitch's 200 biggest games, read every evening at about 7pm Pacific, averaged over the last 30 readings. Viewers are counted across each game's top 100 live streams, so the biggest games are undercounted. Categories that aren't games, and gambling, are left out."
        actions={now?.ready ? (
          <Button variant="secondary" size="small" iconBefore={IconRefresh} loading={taking} disabled={taking} onClick={() => void takeReading()}>
            Take a reading now
          </Button>
        ) : undefined}
      >
        {failed && <Alert variant="error">Couldn&apos;t load the Twitch readings. Refresh the page in a minute.</Alert>}
        {!now ? (
          !failed && <LoadingLines label="Loading the Twitch readings" />
        ) : !now.ready ? (
          <Alert variant="info">Readings start once this card&apos;s database update has run.</Alert>
        ) : now.days === 0 ? (
          <EmptyState
            variant="bordered"
            icon={<IconBrandTwitch size={28} />}
            title="No readings yet"
            description="The first one is taken this evening, or take one now."
            action={<Button variant="primary" size="small" loading={taking} disabled={taking} onClick={() => void takeReading()}>Take a reading now</Button>}
          />
        ) : (
          <>
            <div className="admin-twitch__bar">
              <p className="admin-twitch__meta">
                {now.days === 1 ? "1 reading so far" : `${fmt(now.days)} readings in the last ${now.window} days`}
                {now.takenAt && <>, the latest on {when(now.takenAt)} Pacific</>}.
                {now.days < 7 && " A week of readings makes the averages steadier."}
              </p>
              <Switch size="small" label="Only games without a space" checked={openOnly} onChange={(e) => { setOpenOnly(e.target.checked); setShown(PAGE); }} />
            </div>
            <AdminTable label="Games on Twitch, most watched first">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead align="right">Viewers a day</TableHead>
                    <TableHead align="right">Twitch rank</TableHead>
                    <TableHead align="right">In English</TableHead>
                    <TableHead align="right">Readings</TableHead>
                    <TableHead>Ours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {games.slice(0, shown).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{g.name}</TableCell>
                      <TableCell align="right" className="admin-num">{fmt(g.avg)}</TableCell>
                      <TableCell align="right" className="admin-num">{g.rank ? `#${g.rank}` : "Out"}</TableCell>
                      <TableCell align="right" className="admin-num">{g.english == null ? "-" : `${Math.round(g.english * 100)}%`}</TableCell>
                      <TableCell align="right" className="admin-num">{fmt(g.seen)} of {fmt(now.days)}</TableCell>
                      <TableCell><Ours game={g} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            {games.length > shown && (
              <div>
                <Button variant="ghost" size="small" onClick={() => setShown((n) => n + PAGE)}>
                  Show {fmt(Math.min(PAGE, games.length - shown))} more of {fmt(games.length)}
                </Button>
              </div>
            )}
          </>
        )}
      </AdminSection>
    </div>
  );
}

/** What we have for the game: its space (open or staff only), a catalog entry, or nothing yet. */
function Ours({ game }: { game: TwitchNowGame }) {
  if (game.space) {
    return (
      <span className="admin-twitch__ours">
        <Link href={`/games/${game.space.id}`}>{game.space.name}</Link>
        {!game.space.open && <Badge size="small" variant="default">Staff only</Badge>}
      </span>
    );
  }
  if (game.catalog) return <Badge size="small" variant="info">{game.catalog.status === "live" ? "Tools, no space" : "In our catalog"}</Badge>;
  return <Badge size="small" variant="default">Not yet</Badge>;
}
