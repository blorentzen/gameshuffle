"use client";

/**
 * Tournament team lists (Pokémon Champions events; game space picks 2026-11-11, pick 10), the team side of the deck
 * lists. The deck list components hand over to these when the route answers `kind: "team"`:
 * - MyTeamListCard: the player's team on the tournament page (build it or paste a team builder link, change it until
 *   the event starts, see whether it's legal and whether the organizer checked it).
 * - OrganizerTeamLists: the manage page (who's in, who's missing with a Remind, anything not legal; mark checked).
 * - PublicTeamLists: the teams the organizer chose to show (open from round 1, the top cut's, or everyone's after).
 */

import { useCallback, useState } from "react";
import { Accordion, Alert, Badge, Button, Input, Modal, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconLink, IconSwords } from "@tabler/icons-react";
import { AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useToast } from "@/components/toast/ToastProvider";
import { ChampionsTeamBuilder, ChampionsTeamList } from "@/components/pokemon/ChampionsTeamBuilder";
import { CHAMPIONS_SEASON, TEAM_MIN, teamBuilderHref, teamFromText, type ChampMon } from "@/lib/pokemon/champions";
import { championsShown } from "@/lib/games-visibility";
import { EVENTS, track } from "@/lib/analytics/events";
import { teamAfterHelp, type DeckListSettings } from "@/lib/tournaments/deckLists";
import type { OrganizerTeamRow, PublicTeamList, TeamListView, TeamScope } from "@/lib/tournaments/teamListStore";
import "@/styles/champions.css";

export type TeamMine = { participantId: string | null; team: TeamListView | null; locked: boolean; settings: DeckListSettings };

const legalBadge = (t: Pick<TeamListView, "legal" | "problems">) =>
  t.legal
    ? <Badge variant="success" size="small">Legal for {CHAMPIONS_SEASON.regulation}</Badge>
    : <Badge variant="error" size="small">{t.problems.length === 1 ? "1 problem" : `${t.problems.length} problems`}</Badge>;

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** The team builder link for a stored team (only while the builder can be seen here). */
function BuilderLink({ team }: { team: TeamListView }) {
  if (!championsShown()) return null;
  const ids = team.members.filter((m) => m.onList).map((m) => ({ id: m.id }));
  return <ArrowLink href={teamBuilderHref(ids)}>Open in the team builder</ArrowLink>;
}

function Problems({ team }: { team: TeamListView }) {
  if (!team.problems.length) return null;
  return <ul className="tteam-problems">{team.problems.map((p) => <li key={p}>{p}</li>)}</ul>;
}

export function MyTeamListCard({ tournamentId, initial, onChanged }: { tournamentId: string; initial: TeamMine; onChanged?: () => void }) {
  const toast = useToast();
  const [mine, setMine] = useState<TeamMine>(initial);
  const [building, setBuilding] = useState(false);
  const [link, setLink] = useState("");
  const [name, setName] = useState(initial.team?.name ?? "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=mine`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; mine?: TeamMine } | null;
    if (j?.ok && j.mine) setMine(j.mine);
  }, [tournamentId]);

  if (!mine.participantId) return null;
  const team = mine.team;

  const send = async (picked: Pick<ChampMon, "id">[]) => {
    if (picked.length < TEAM_MIN) { toast.toast({ variant: "error", title: "Not enough Pokémon", message: "A team for an event needs four to six." }); return false; }
    setBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team: picked.map((m) => m.id), name: name.trim() }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setBusy(false);
    if (!j?.ok) { toast.toast({ variant: "error", title: "Couldn't send your team", message: j?.message ?? "Try again." }); return false; }
    toast.toast({ variant: "success", message: team ? "Team changed." : "Team sent to the organizer." });
    track(EVENTS.teamListSent, { size: picked.length, swap: team ? "yes" : "no" });
    setBuilding(false); setLink("");
    await load(); onChanged?.();
    return true;
  };
  const sendLink = async () => {
    const { team: fromLink, unknown } = teamFromText(link);
    if (unknown.length) { toast.toast({ variant: "error", title: "That link has Pokémon we don't know", message: `Check it in the team builder: ${unknown.length === 1 ? "one isn't" : `${unknown.length} aren't`} on this season's list.` }); return; }
    if (!fromLink.length) { toast.toast({ variant: "error", title: "No team in that link", message: "Paste the link the team builder's Copy link gives you." }); return; }
    await send(fromLink);
  };

  return (
    <div className="comp-card tdeck-mine" id="deck-list">
      <div className="tdeck-mine__head">
        <h2 className="swiss-card-title">Your team list</h2>
        {team?.checkedAt && <Badge variant="success" size="small">Checked by the organizer</Badge>}
      </div>
      {!team && mine.locked && <Alert variant="warning">You didn&apos;t send a team before the event started. Talk to the organizer.</Alert>}
      {team && (
        <>
          <div className="tdeck-mine__deck">
            <strong>{team.name}</strong>
            <span className="swiss-muted">{team.members.length} Pokémon</span>
            {legalBadge(team)}
          </div>
          <Problems team={team} />
          <ChampionsTeamList members={team.members} label="Your team" />
          <BuilderLink team={team} />
        </>
      )}
      {!mine.locked && (
        <div className="tdeck-mine__pick">
          <div className="tdeck-mine__actions">
            <Button variant={team ? "secondary" : "primary"} iconBefore={IconSwords} onClick={() => setBuilding(true)}>{team ? "Change your team" : "Build your team"}</Button>
          </div>
          {championsShown() && (
            <div className="tteam-link">
              <Input floatingLabel="Or paste a team builder link" value={link} onChange={(e) => setLink(e.target.value)} fullWidth />
              <Button variant="secondary" iconBefore={IconLink} onClick={() => void sendLink()} disabled={!link.trim() || busy} loading={busy}>Use this link</Button>
            </div>
          )}
        </div>
      )}
      <p className="swiss-help">
        {mine.locked ? "Teams are locked: the event has started." : `${teamAfterHelp(mine.settings.after)} You can change your team until the event starts.`}
      </p>
      <Modal isOpen={building} onClose={() => setBuilding(false)} title={team ? "Change your team" : "Build your team"} size="large">
        <div className="tteam-window">
          <Input floatingLabel="Team name (optional)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} fullWidth />
          <ChampionsTeamBuilder mode="pick" initial={team?.members.filter((m) => m.onList).map((m) => m.id)} onUse={(t) => void send(t)} useLabel={team ? "Use this team" : "Send this team"} busy={busy} />
        </div>
      </Modal>
    </div>
  );
}

type Org = { rows: OrganizerTeamRow[]; settings: DeckListSettings; locked: boolean };

export function OrganizerTeamLists({ tournamentId, initial }: { tournamentId: string; initial: Org }) {
  const toast = useToast();
  const [data, setData] = useState<Org>(initial);
  const [open, setOpen] = useState<OrganizerTeamRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=organizer`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; organizer?: Org } | null;
    if (j?.ok && j.organizer) setData(j.organizer);
    return j?.organizer ?? null;
  }, [tournamentId]);
  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.action));
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; sent?: boolean; message?: string } | null;
    setBusy(null);
    if (!j?.ok) { toast.toast({ variant: "error", title: "Couldn't do that", message: j?.message ?? "Try again." }); return false; }
    toast.toast({ variant: "success", message: body.action === "remind" && j.sent === false ? "They joined as a guest, so there's no account to remind." : done });
    const next = await load();
    if (open && next) setOpen(next.rows.find((r) => r.participantId === open.participantId) ?? null);
    return true;
  };

  const playing = data.rows.filter((r) => r.status !== "dropped");
  const inCount = playing.filter((r) => r.deck).length;
  const toLook = playing.filter((r) => r.deck && !r.deck.checkedAt && !r.deck.legal).length;
  return (
    <div className="tdeck-org">
      <AdminStats columns={4} label="Team lists">
        <StatCard label="Players" stat={String(playing.length)} />
        <StatCard label="Teams in" stat={String(inCount)} />
        <StatCard label="Not legal" stat={String(toLook)} />
        <StatCard label="Missing" stat={String(playing.length - inCount)} />
      </AdminStats>
      {playing.length === 0 ? <p className="swiss-help">Nobody has joined yet. Teams show here as players send them.</p> : (
        <AdminTable label="Team lists">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Check</TableHead>
                <TableHead>Checked by you</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playing.map((r) => (
                <TableRow key={r.participantId} className={r.deck && !r.deck.checkedAt && !r.deck.legal ? "swiss-row--flag" : undefined}>
                  <TableCell>{r.player}</TableCell>
                  <TableCell>{r.deck ? <>{r.deck.name} <span className="swiss-muted">· {r.deck.members.map((m) => m.name).join(", ")}</span></> : <span className="swiss-muted">No team yet</span>}</TableCell>
                  <TableCell>{r.deck ? legalBadge(r.deck) : <Badge variant="error" size="small">Missing</Badge>}</TableCell>
                  <TableCell>{r.deck?.checkedAt ? <Badge variant="success" size="small">Checked</Badge> : r.deck ? <span className="swiss-muted">Not yet</span> : null}</TableCell>
                  <TableCell>
                    {r.deck
                      ? <Button size="small" variant="ghost" onClick={() => setOpen(r)}>Open</Button>
                      : !data.locked && r.hasAccount && <Button size="small" variant="ghost" onClick={() => void post({ action: "remind", participantId: r.participantId }, `${r.player} has been reminded.`)} disabled={!!busy}>Remind</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      <p className="swiss-help">{data.locked ? "Teams locked when the event started." : "Teams lock when you start the event. Players without a team can still play if you allow it."} {teamAfterHelp(data.settings.after)}</p>

      <Modal isOpen={!!open?.deck} onClose={() => setOpen(null)} title={open?.deck ? `${open.player} · ${open.deck.name}` : "Team list"} size="medium">
        {open?.deck && (
          <div className="tdeck-detail">
            <div className="tdeck-mine__deck">
              {legalBadge(open.deck)}
              <span className="swiss-muted">{open.deck.members.length} Pokémon</span>
              {open.deck.checkedAt && <Badge variant="success" size="small">Checked</Badge>}
            </div>
            <Problems team={open.deck} />
            <ChampionsTeamList members={open.deck.members} label={`${open.player}'s team`} />
            <BuilderLink team={open.deck} />
            <div className="tdeck-mine__actions">
              <Button variant="primary" size="small" loading={busy === "check"} disabled={!!busy}
                onClick={() => void post({ action: "check", participantId: open.participantId, checked: !open.deck!.checkedAt }, open.deck!.checkedAt ? "Marked as not checked." : "Marked checked.")}>
                {open.deck.checkedAt ? "Mark not checked" : "Mark checked"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const SCOPE_LINE: Record<TeamScope, string> = {
  open: "Open team lists: everyone's team, from round 1.",
  top_cut: "The top cut's teams.",
  all: "Everyone's teams, shown after the event.",
};

export function PublicTeamLists({ data }: { data: { lists: PublicTeamList[]; scope: TeamScope } }) {
  if (!data.lists.length) return null;
  return (
    <div className="comp-card">
      <h2 className="swiss-card-title">Team lists</h2>
      <p className="swiss-help">{SCOPE_LINE[data.scope]}</p>
      <Accordion
        variant="bordered"
        allowMultiple
        items={data.lists.map((entry, i) => ({
          id: `team-${i}`,
          title: <span className="tteam-pub__title"><strong>{entry.placement ? `${ord(entry.placement)} · ` : ""}{entry.player}</strong> <span className="swiss-muted">{entry.team.name}</span></span>,
          content: (
            <div className="tdeck-pub">
              <ChampionsTeamList members={entry.team.members} label={`${entry.player}'s team`} />
              <BuilderLink team={entry.team} />
            </div>
          ),
        }))}
      />
    </div>
  );
}
