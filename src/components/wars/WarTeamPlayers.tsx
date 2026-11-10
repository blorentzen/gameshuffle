"use client";

/**
 * A team's players on the Teams page. Not linked to MKCentral: the server's own lines (in-game name → the name and
 * flag tables show, and where that comes from). Linked (logos + MKCentral picks 2026-11-09, all A): its MKCentral
 * players who've played a war here, each beside the server's line for them; the rest of its MKCentral team folded
 * away; then the server's lines that aren't anyone on MKCentral. Every row can be overridden: a line can be edited
 * or removed, and an MKCentral player without one can be given their in-game name (and a name or flag of your own).
 */

import { Accordion, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconPlus } from "@tabler/icons-react";
import { AdminRowMenu, AdminTable } from "@/components/account/admin/AdminKit";
import { SET_BY_LABEL, type MkcPlayerView, type TeamPlayerView, type TeamView } from "@/lib/wars/teamView";

const teamLabel = (t: TeamView) => t.name ?? t.tags[0];

function FlagCell({ flag, url }: { flag: string | null; url: string | null }) {
  if (!flag) return <span className="admin-table__sub">None</span>;
  return (
    <span className="wt-flag">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small flag from our own files or this server's uploads */}
      {url && <img src={url} alt="" width={24} height={18} />}
      <code>{flag}</code>
    </span>
  );
}

interface LineActions {
  onEdit: (p: TeamPlayerView) => void;
  onRemove: (p: TeamPlayerView) => void;
}

function LineButtons({ p, onEdit, onRemove }: { p: TeamPlayerView } & LineActions) {
  return (
    <span className="admin-row-actions">
      <Button variant="ghost" size="small" onClick={() => onEdit(p)} aria-label={`Edit ${p.ingame}`}>Edit</Button>
      <AdminRowMenu label={`More for ${p.ingame}`} items={[{ label: "Remove", danger: true, onClick: () => onRemove(p) }]} />
    </span>
  );
}

/** The server's own lines: in-game name, the name and flag tables show, and where those come from. */
export function WarLinesTable({ label, players, ...actions }: { label: string; players: TeamPlayerView[] } & LineActions) {
  return (
    <AdminTable label={label}>
      <Table dense>
        <TableHeader>
          <TableRow>
            <TableHead>In-game</TableHead>
            <TableHead>On tables</TableHead>
            <TableHead>Flag</TableHead>
            <TableHead>From</TableHead>
            <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p) => (
            <TableRow key={p.id}>
              <TableCell><strong>{p.ingame}</strong></TableCell>
              <TableCell>{p.shown ?? <span className="admin-table__sub">Same as in-game</span>}</TableCell>
              <TableCell><FlagCell flag={p.flag} url={p.flagUrl} /></TableCell>
              <TableCell className="admin-nowrap">{SET_BY_LABEL[p.setBy]}</TableCell>
              <TableCell align="right"><LineButtons p={p} {...actions} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTable>
  );
}

function MkcTable({ label, rows, lines, withIngame, onAdd, ...actions }: {
  label: string;
  rows: MkcPlayerView[];
  lines: Map<string, TeamPlayerView>;
  withIngame: boolean;
  onAdd: (p: MkcPlayerView) => void;
} & LineActions) {
  return (
    <AdminTable label={label}>
      <Table dense>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead>On tables</TableHead>
            <TableHead>Flag</TableHead>
            {withIngame && <TableHead>In-game</TableHead>}
            <TableHead>From</TableHead>
            <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const line = p.lineId ? lines.get(p.lineId) : undefined;
            return (
              <TableRow key={p.id}>
                <TableCell><strong>{p.name}</strong></TableCell>
                <TableCell>{p.shown}</TableCell>
                <TableCell><FlagCell flag={p.flag} url={p.flagUrl} /></TableCell>
                {withIngame && <TableCell>{p.ingame ?? <span className="admin-table__sub">Not on your list</span>}</TableCell>}
                <TableCell className="admin-nowrap">{SET_BY_LABEL[p.from]}</TableCell>
                <TableCell align="right">
                  {line ? <LineButtons p={line} {...actions} /> : (
                    <Button variant="ghost" size="small" iconBefore={IconPlus} onClick={() => onAdd(p)} aria-label={`Add ${p.name}'s in-game name`}>In-game name</Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AdminTable>
  );
}

const count = (n: number) => (n === 1 ? "1 player" : `${n} players`);

/** Everything about one team's players, linked or not. */
export function WarTeamPlayers({ team, onAdd, ...actions }: { team: TeamView; onAdd: (p: MkcPlayerView) => void } & LineActions) {
  const label = teamLabel(team);
  const mkc = team.links?.mkc ?? null;
  const roster = team.mkcPlayers;

  if (!mkc || !roster) {
    return team.players.length > 0
      ? <WarLinesTable label={`${label} players`} players={team.players} {...actions} />
      : <p className="wt-team__empty">Add them one at a time or paste a list, like <code>Jalen = peep/Sxyd [us]</code>: the in-game name, the name for tables, then a flag.</p>;
  }

  const lines = new Map(team.players.map((p) => [p.id, p]));
  const tied = new Set(roster.map((p) => p.lineId).filter((v): v is string => !!v));
  const here = roster.filter((p) => p.played);
  const more = roster.filter((p) => !p.played);
  const own = team.players.filter((p) => !tied.has(p.id));
  const moreId = `wt-mkc-more-${team.id}`;

  return (
    <div className="wt-roster">
      {roster.length === 0 ? (
        <p className="wt-team__empty">{mkc.name} has no {mkc.game === "mkworld" ? "Mario Kart World" : "Mario Kart 8 Deluxe"} players on MKCentral, so tables use your list alone.</p>
      ) : (
        <>
          <p className="wt-roster__key">Tables show your list first, then a player&apos;s own card (/me), then MKCentral.</p>
          {here.length > 0
            ? <MkcTable label={`${label} players on MKCentral who've played here`} rows={here} lines={lines} withIngame onAdd={onAdd} {...actions} />
            : <p className="wt-team__empty">None of the {count(roster.length)} on MKCentral have played a war here yet.</p>}
          {more.length > 0 && (
            <Accordion
              variant="flush"
              className="wt-more"
              defaultOpenIds={here.length ? [] : [moreId]}
              items={[{
                id: moreId,
                title: `${more.length} more on MKCentral who haven't played a war here yet`,
                content: <MkcTable label={`${label} players on MKCentral who haven't played here`} rows={more} lines={lines} withIngame={false} onAdd={onAdd} {...actions} />,
              }]}
            />
          )}
        </>
      )}
      {own.length > 0 && (
        <div className="wt-roster__own">
          {roster.length > 0 && <h4 className="wt-sub">Not on MKCentral</h4>}
          <WarLinesTable label={roster.length ? `${label} players not on MKCentral` : `${label} players`} players={own} {...actions} />
        </div>
      )}
    </div>
  );
}
