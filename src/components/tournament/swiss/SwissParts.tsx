"use client";

/**
 * Pieces shared by the organizer's Swiss console and the public page: the
 * result window, the round's tables, the standings and the top cut matches.
 */

import { Badge, Button, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { AdminTable } from "@/components/account/admin/AdminKit";
import { pctText } from "@/lib/tournaments/swiss";
import type { SwissView, ViewCutMatch, ViewTable } from "@/lib/tournaments/swissStore";

const score = (a: number, b: number) => `${a}-${b}`;

/** "Sam 2-1", "Tie 1-1". From side a's point of view. */
export function resultText(r: { a: number; b: number }, aName: string, bName: string): string {
  if (r.a === r.b) return `Tie ${score(r.a, r.b)}`;
  return r.a > r.b ? `${aName} ${score(r.a, r.b)}` : `${bName} ${score(r.b, r.a)}`;
}

export function ResultBadge({ table }: { table: Pick<ViewTable, "state" | "result" | "a" | "b" | "reportA" | "reportB"> }) {
  if (table.state === "bye") return <Badge variant="info" size="small">Win (bye)</Badge>;
  if (table.result && table.b) {
    const label = table.result.by === "drop" ? `${resultText(table.result, table.a.name, table.b.name)} (drop)` : resultText(table.result, table.a.name, table.b.name);
    return <Badge variant="success" size="small">{label}</Badge>;
  }
  if (table.state === "disagree") return <Badge variant="warning" size="small">Players disagree</Badge>;
  // Organizers see a one-sided report so they can confirm it (a guest opponent can't).
  const one = table.reportA ? { who: table.a.name, r: table.reportA } : table.reportB && table.b ? { who: table.b.name, r: table.reportB } : null;
  if (one) return <span className="swiss-muted">{one.who} says {one.r[0] === one.r[1] ? `tie ${one.r[0]}-${one.r[1]}` : one.r[0] > one.r[1] ? `they won ${one.r[0]}-${one.r[1]}` : `they lost ${one.r[0]}-${one.r[1]}`}</span>;
  return <span className="swiss-muted">Playing</span>;
}

/** The organizer's window for one match: each player's report, then every possible score as a button. */
export function ResultModal({ open, onClose, title, aName, bName, bestOf, cut, reportA, reportB, hasResult, setByOrganizer, onPick, onClear, busy }: {
  open: boolean; onClose: () => void; title: string; aName: string; bName: string; bestOf: 1 | 3; cut: boolean;
  reportA?: [number, number] | null; reportB?: [number, number] | null; hasResult: boolean; setByOrganizer: boolean;
  onPick: (a: number, b: number) => void; onClear: () => void; busy: boolean;
}) {
  const need = bestOf === 1 ? 1 : 2;
  const options: { a: number; b: number; label: string }[] = bestOf === 1
    ? [{ a: 1, b: 0, label: `${aName} won` }, { a: 0, b: 1, label: `${bName} won` }]
    : [{ a: 2, b: 0, label: `${aName} won 2-0` }, { a: 2, b: 1, label: `${aName} won 2-1` }, { a: 1, b: 2, label: `${bName} won 2-1` }, { a: 0, b: 2, label: `${bName} won 2-0` }];
  if (!cut) options.push({ a: need === 1 ? 0 : 1, b: need === 1 ? 0 : 1, label: "Tie" });
  const said = (name: string, r: [number, number] | null | undefined) =>
    r ? `${name} says ${r[0] === r[1] ? `tie ${score(r[0], r[1])}` : r[0] > r[1] ? `they won ${score(r[0], r[1])}` : `they lost ${score(r[0], r[1])}`}` : `${name} hasn't reported`;
  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="small">
      <div className="swiss-result">
        <ul className="swiss-result__said">
          <li>{said(aName, reportA)}</li>
          <li>{said(bName, reportB)}</li>
        </ul>
        <div className="swiss-result__options" role="group" aria-label="Result">
          {options.map((o) => (
            <Button key={o.label} variant="secondary" onClick={() => onPick(o.a, o.b)} disabled={busy}>{o.label}</Button>
          ))}
        </div>
        {hasResult && setByOrganizer && <Button variant="ghost" size="small" onClick={onClear} disabled={busy}>Clear the result you entered</Button>}
      </div>
    </Modal>
  );
}

const playerCell = (p: ViewTable["a"]) => <span className="swiss-player">{p.name} <span className="swiss-rec">{p.record}</span></span>;

/** One round's tables. `onOpen` (organizers) adds a button per table. */
export function TablesTable({ tables, label, onOpen }: { tables: ViewTable[]; label: string; onOpen?: (t: ViewTable) => void }) {
  return (
    <AdminTable label={label}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Table</TableHead>
            <TableHead>Players</TableHead>
            <TableHead>Result</TableHead>
            {onOpen && <TableHead><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((t) => (
            <TableRow key={t.t} className={t.state === "disagree" ? "swiss-row--flag" : undefined}>
              <TableCell>{t.b ? t.t : "Bye"}</TableCell>
              <TableCell>{playerCell(t.a)}{t.b && <><span className="swiss-vs">vs</span>{playerCell(t.b)}</>}</TableCell>
              <TableCell><ResultBadge table={t} /></TableCell>
              {onOpen && (
                <TableCell>
                  {t.b && (
                    <Button size="small" variant={t.state === "disagree" ? "secondary" : "ghost"} onClick={() => onOpen(t)}>
                      {t.state === "disagree" ? "Settle" : t.result ? "Change" : "Enter result"}
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTable>
  );
}

export function StandingsTable({ rows, topCut, final, highlight }: { rows: SwissView["standings"]; topCut: number; final?: boolean; highlight?: string | null }) {
  const cutAt = topCut ? rows.filter((r) => !r.dropped).slice(0, topCut).pop()?.id : null;
  return (
    <>
      <AdminTable label="Standings">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Record</TableHead>
              <TableHead className="swiss-num">Points</TableHead>
              <TableHead className="swiss-num">Opp. win %</TableHead>
              <TableHead className="swiss-num">Opp. opp. win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={[r.id === cutAt && !final ? "swiss-row--cut" : "", r.id === highlight ? "swiss-row--you" : ""].filter(Boolean).join(" ") || undefined}>
                <TableCell>{r.rank}</TableCell>
                <TableCell>{r.name}{r.dropped && <span className="swiss-muted"> (dropped)</span>}</TableCell>
                <TableCell>{r.record}</TableCell>
                <TableCell className="swiss-num">{r.points}</TableCell>
                <TableCell className="swiss-num">{pctText(r.owp)}</TableCell>
                <TableCell className="swiss-num">{pctText(r.oowp)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
      <p className="swiss-help">
        Players on the same points are split by their opponents&apos; win rate, then by their opponents&apos; opponents&apos; win rate.
        {topCut && !final ? ` The dashed line marks the Top ${topCut}.` : ""} A dropped player keeps their place.
      </p>
    </>
  );
}

/** The top cut's matches that are ready or done, in bracket order. */
export function CutMatches({ matches, nameOf, label, onOpen }: { matches: ViewCutMatch[]; nameOf: (id: string | null) => string; label: (m: ViewCutMatch) => string; onOpen?: (m: ViewCutMatch) => void }) {
  const ready = matches.filter((m) => m.a && m.b);
  if (!ready.length) return null;
  return (
    <AdminTable label="Top cut matches">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead>Players</TableHead>
            <TableHead>Result</TableHead>
            {onOpen && <TableHead><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ready.map((m) => (
            <TableRow key={m.id} className={m.state === "disagree" ? "swiss-row--flag" : undefined}>
              <TableCell>{label(m)}</TableCell>
              <TableCell>{nameOf(m.a)}<span className="swiss-vs">vs</span>{nameOf(m.b)}</TableCell>
              <TableCell>
                {m.result ? <Badge variant="success" size="small">{resultText(m.result, nameOf(m.a), nameOf(m.b))}</Badge>
                  : m.state === "disagree" ? <Badge variant="warning" size="small">Players disagree</Badge>
                  : <span className="swiss-muted">Playing</span>}
              </TableCell>
              {onOpen && (
                <TableCell>
                  <Button size="small" variant={m.state === "disagree" ? "secondary" : "ghost"} onClick={() => onOpen(m)}>
                    {m.state === "disagree" ? "Settle" : m.result ? "Change" : "Enter result"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTable>
  );
}
