"use client";

/**
 * The Swiss board: the round in play (a result per table, "Pair again" before
 * any result), one main button (pair the next round, start the top cut),
 * standings with the handbook's tiebreakers, earlier rounds folded away, and
 * the top cut as a bracket tree.
 */

import { Accordion, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconArrowsShuffle, IconTrophy } from "@tabler/icons-react";
import { pctText, recordText } from "@/lib/tournaments/swiss";
import {
  currentRound, cutView, dropPlayer, outcomeOf, pairNext, pickCut, repairRound, setResult, startCut, swissStep, swissTable, swissWinner,
  type SwissTool,
} from "@/lib/brackets/swissTool";
import { MatchPick, outcomeText } from "./MatchPick";
import { BracketTree } from "./BracketTree";

export function SwissPairingBoard({ names, tool, ties, onChange }: {
  names: string[];
  tool: SwissTool;
  ties: boolean;
  onChange: (next: SwissTool) => void;
}) {
  const step = swissStep(tool);
  const round = currentRound(tool);
  const table = swissTable(tool);
  const winner = swissWinner(tool);
  const cut = cutView(tool);
  const name = (id: string | null) => (id == null ? "" : names[Number(id)] ?? "");
  const earlier = tool.swiss.cut ? tool.swiss.list : tool.swiss.list.slice(0, -1);
  const open = round ? round.tables.filter((t) => t.b && !round.results[String(t.t)]).length : 0;
  const betweenRounds = step === "pair";

  return (
    <div className="bt-swiss">
      <div className="bt-swiss__status">
        <p className="bt-swiss__where">
          {tool.swiss.cut
            ? `Top ${tool.swiss.cut.seeds.length} bracket`
            : `Round ${tool.swiss.list.length} of ${tool.swiss.rounds}`}
          {tool.swiss.topCut && !tool.swiss.cut ? `, then a Top ${tool.swiss.topCut} bracket` : ""}
        </p>
        <div className="bt-swiss__actions bt-no-print">
          {step === "results" && <p className="bt-muted">{open} {open === 1 ? "table needs" : "tables need"} a result before the next round.</p>}
          {step === "pair" && <Button variant="primary" onClick={() => onChange(pairNext(tool))}>Pair round {tool.swiss.list.length + 1}</Button>}
          {step === "cut" && <Button variant="primary" onClick={() => onChange(startCut(tool))}>Start the Top {tool.swiss.topCut}</Button>}
          {step === "results" && round && !Object.keys(round.results).length && (
            <Button variant="ghost" size="small" iconBefore={IconArrowsShuffle} onClick={() => onChange(repairRound(tool))}>Pair again</Button>
          )}
        </div>
      </div>

      {winner != null && (
        <p className="bt-winner" role="status"><IconTrophy size={22} stroke={1.75} aria-hidden /> {names[winner]} wins</p>
      )}

      {cut && (
        <section aria-labelledby="bt-swiss-cut">
          <h3 id="bt-swiss-cut" className="bt-sub">Top {tool.swiss.cut!.seeds.length}</h3>
          <p className="bt-muted">Seeded from the Swiss standings: first plays last.</p>
          <div className="bt-frame" tabIndex={0} role="region" aria-label="Top cut bracket">
            <BracketTree
              bracket={cut.bracket}
              nameOf={(id) => name(id)}
              seedOf={(id) => tool.swiss.cut!.seeds.indexOf(id) + 1 || null}
              onPick={(matchId, w) => onChange(pickCut(tool, matchId, w == null ? null : Number(w)))}
            />
          </div>
        </section>
      )}

      {round && !tool.swiss.cut && (
        <section aria-labelledby="bt-swiss-round">
          <h3 id="bt-swiss-round" className="bt-sub">Round {round.n} pairings</h3>
          <ul className="bt-list">
            {round.tables.map((t) => (
              <li key={t.t} className="bt-table-row">
                <span className="bt-table-row__num">Table {t.t}</span>
                {t.b ? (
                  <MatchPick
                    label={`Table ${t.t}`}
                    a={name(t.a)}
                    b={name(t.b)}
                    value={outcomeOf(round.results[String(t.t)])}
                    ties={ties}
                    onChange={(o) => onChange(setResult(tool, t.t, o))}
                  />
                ) : (
                  <span className="bt-bye">{name(t.a)} has a bye (counts as a win)</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="bt-swiss-standings">
        <h3 id="bt-swiss-standings" className="bt-sub">Standings</h3>
        <p className="bt-muted">Win 3 points{ties ? ", tie 1" : ""}. Level on points: opponents&apos; win %, then their opponents&apos; win %, then head-to-head.</p>
        <div className="bt-table-scroll" tabIndex={0} role="region" aria-label="Standings">
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead align="right">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead align="right">Record</TableHead>
                <TableHead align="right">Points</TableHead>
                <TableHead align="right">Opp. win %</TableHead>
                <TableHead align="right">Opp. opp. win %</TableHead>
                {betweenRounds && <TableHead className="bt-no-print"><span className="sr-only">Drop</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.map((r) => (
                <TableRow key={r.id}>
                  <TableCell align="right">{r.rank}</TableCell>
                  <TableCell>{name(r.id)}{r.dropped ? <span className="bt-muted"> (dropped)</span> : null}</TableCell>
                  <TableCell align="right">{recordText(r)}</TableCell>
                  <TableCell align="right"><strong>{r.points}</strong></TableCell>
                  <TableCell align="right">{pctText(r.owp)}</TableCell>
                  <TableCell align="right">{pctText(r.oowp)}</TableCell>
                  {betweenRounds && (
                    <TableCell className="bt-no-print">
                      <Button size="small" variant="ghost" onClick={() => onChange(dropPlayer(tool, Number(r.id), !r.dropped))}>
                        {r.dropped ? "Bring back" : "Drop"}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {earlier.length > 0 && (
        <Accordion
          variant="flush"
          allowMultiple
          className="bt-earlier"
          items={[...earlier].reverse().map((r) => ({
            id: `r${r.n}`,
            title: `Round ${r.n}`,
            content: (
              <ul className="bt-list bt-list--quiet">
                {r.tables.map((t) => (
                  <li key={t.t}>
                    Table {t.t}: {t.b ? `${name(t.a)} vs ${name(t.b)}, ${outcomeText(outcomeOf(r.results[String(t.t)]), name(t.a), name(t.b))}` : `${name(t.a)}, bye`}
                  </li>
                ))}
              </ul>
            ),
          }))}
        />
      )}
    </div>
  );
}
