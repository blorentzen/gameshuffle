"use client";

/**
 * My Stuff ▸ Events ▸ Tournaments: the ones you organize or co-organize, the
 * ones you've joined, and the championship seasons you run, as one list per
 * stage: running now, coming up, didn't start (an open tournament whose date
 * passed without starting, `isStaleOpen`), finished, then archived out of the
 * way. Rows come from StuffList; discovery pages keep the big event cards.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Accordion, Badge, Button, EmptyState, List } from "@empac/cascadeds";
import { IconTrophy } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";
import { formatEventShort } from "@/lib/time/format";
import { isStaleOpen } from "@/lib/events/lifecycle";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { StuffGroup, StuffRow, StuffThumb, viewerTimeZone } from "@/components/account/stuff/StuffList";
import { LoadingLines } from "@/components/loading/LoadingLines";

interface TournamentEntry {
  id: string;
  title: string;
  game_slug: string;
  mode: string;
  status: string;
  date_time: string | null;
  header_image_url?: string | null;
  archived_at?: string | null;
  role: "organizer" | "participant";
  participant_status?: string;
}

interface Season { id: string; name: string; status: string }

const PLAYER_STATUS: Record<string, string> = { registered: "Registered", confirmed: "Confirmed", checked_in: "Checked in", waitlisted: "Waitlist" };

const byDate = (dir: 1 | -1) => (a: TournamentEntry, b: TournamentEntry) => {
  if (!a.date_time) return 1;
  if (!b.date_time) return -1;
  return dir * (Date.parse(a.date_time) - Date.parse(b.date_time));
};

export function TournamentsTab({ timeZone }: { timeZone?: string | null } = {}) {
  const { user } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let active = true;
    (async () => {
      const cols = "id, title, game_slug, mode, status, date_time, header_image_url, archived_at";
      const [organizedRes, coRes, participatingRes, seasonsRes] = await Promise.all([
        supabase.from("tournaments").select(cols).eq("organizer_id", user.id).order("created_at", { ascending: false }),
        // Co-organized tournaments: you can manage them too, so they list with yours.
        supabase.from("tournament_organizers").select(`tournaments(${cols})`).eq("user_id", user.id),
        supabase.from("tournament_participants").select(`tournament_id, status, tournaments(${cols})`).eq("user_id", user.id).neq("status", "dropped").order("joined_at", { ascending: false }),
        // Championship seasons you run (listed nowhere else in My Stuff).
        supabase.from("championships").select("id, name, status").eq("owner_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      const entries: TournamentEntry[] = [];
      const add = (t: TournamentEntry | undefined, extra: Partial<TournamentEntry>) => {
        if (t && !entries.find((e) => e.id === t.id)) entries.push({ ...t, ...extra } as TournamentEntry);
      };
      (organizedRes.data ?? []).forEach((t) => add(t as unknown as TournamentEntry, { role: "organizer" }));
      (coRes.data ?? []).forEach((r) => add((r as Record<string, unknown>).tournaments as TournamentEntry, { role: "organizer" }));
      (participatingRes.data ?? []).forEach((p) => {
        const row = p as Record<string, unknown>;
        add(row.tournaments as TournamentEntry, { role: "participant", participant_status: row.status as string });
      });
      setTournaments(entries);
      setSeasons((seasonsRes.data ?? []) as Season[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  const groups = useMemo(() => {
    const live = tournaments.filter((t) => !t.archived_at && t.status === "in_progress");
    const stale = tournaments.filter((t) => !t.archived_at && isStaleOpen(t)).sort(byDate(-1));
    const upcoming = tournaments.filter((t) => !t.archived_at && (t.status === "draft" || t.status === "open") && !isStaleOpen(t)).sort(byDate(1));
    const finished = tournaments.filter((t) => !t.archived_at && t.status === "complete").sort(byDate(-1));
    const archived = tournaments.filter((t) => t.archived_at || t.status === "cancelled");
    return { live, stale, upcoming, finished, archived };
  }, [tournaments]);

  const tz = viewerTimeZone(timeZone);
  const create = <Button variant="primary" onClick={() => router.push("/tournament/create")}>Create tournament</Button>;

  if (loading) {
    return <AdminScreen title="Tournaments"><LoadingLines label="Loading your tournaments" /></AdminScreen>;
  }

  const row = (t: TournamentEntry, opts: { status?: boolean } = {}) => {
    const organizer = t.role === "organizer";
    const game = getGameName(t.game_slug);
    const statusBadge = opts.status && (
      t.status === "draft" ? <Badge size="small" variant="default">Draft</Badge>
        : t.status === "cancelled" ? <Badge size="small" variant="default">Cancelled</Badge>
          : t.archived_at ? <Badge size="small" variant="default">Archived</Badge>
            : null
    );
    return (
      <StuffRow
        key={t.id}
        thumb={<StuffThumb cover={t.header_image_url} game={{ slug: t.game_slug, name: game }} seed={t.id} />}
        title={t.title}
        href={`/tournament/${t.id}`}
        meta={<>{t.date_time ? formatEventShort(t.date_time, tz) : "No date yet"} · {game}</>}
        badges={
          <>
            {statusBadge}
            {/* Yours carry a Manage button; ones you've joined say where you stand. */}
            {!organizer && <Badge size="small" variant="outline">{PLAYER_STATUS[t.participant_status ?? ""] ?? "Playing"}</Badge>}
          </>
        }
        action={organizer ? { label: "Manage", href: `/tournament/${t.id}/manage` } : undefined}
      />
    );
  };

  const empty = tournaments.length === 0 && seasons.length === 0;

  return (
    <AdminScreen
      title="Tournaments"
      intro="The ones you run and the ones you've joined. Times are in your timezone."
      actions={empty ? undefined : create}
    >
      {empty ? (
        <EmptyState
          variant="bordered"
          icon={<IconTrophy size={40} stroke={1.4} />}
          title="No tournaments yet"
          description="Join one that's taking sign-ups, or run your own: brackets, heats, points and randomized rounds."
          action={
            <div className="stuff-empty-actions">
              <Button variant="primary" onClick={() => router.push("/tournament/create")}>Create tournament</Button>
              <Button variant="secondary" onClick={() => router.push("/tournament")}>Browse tournaments</Button>
            </div>
          }
        />
      ) : (
        <>
          <StuffGroup title="Running now" items={groups.live} row={(t) => row(t)} />
          <StuffGroup
            title="Championship seasons"
            items={seasons}
            row={(c) => (
              <StuffRow
                key={c.id}
                thumb={<StuffThumb art="series" seed={c.id} />}
                title={c.name}
                href={`/tournament/championship/${c.id}`}
                meta={c.status === "archived" ? "Season complete" : "Season running"}
                action={{ label: "Manage", href: `/tournament/championship/${c.id}/manage` }}
              />
            )}
          />
          <StuffGroup title="Coming up" items={groups.upcoming} row={(t) => row(t, { status: true })} />
          <StuffGroup
            title="Didn't start"
            intro="Their date passed and they never started. If one is yours, start it, give it a new date or archive it from its manage page."
            items={groups.stale}
            row={(t) => row(t)}
          />
          <StuffGroup title="Finished" items={groups.finished} page={5} row={(t) => row(t)} />
          {groups.archived.length > 0 && (
            <Accordion
              variant="bordered"
              items={[{
                id: "archived",
                title: `Archived and cancelled (${groups.archived.length})`,
                content: <List divided className="stuff-list">{groups.archived.map((t) => row(t, { status: true }))}</List>,
              }]}
            />
          )}
        </>
      )}
    </AdminScreen>
  );
}
