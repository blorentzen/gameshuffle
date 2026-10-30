"use client";

/**
 * A track's board: every player's best, by everyone, your friends, your crew or one of
 * your Discord servers, optionally only times with proof. Your own row is marked and
 * can be removed; anyone signed in can report someone else's.
 */

import { useState } from "react";
import Link from "next/link";
import { Avatar, Chip, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconBrandDiscord, IconCamera, IconCircleCheck, IconFlag, IconTrash, IconVideo } from "@tabler/icons-react";
import { IconAction } from "@/components/actions/IconAction";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { formatTime } from "@/lib/timeTrials/rules";
import type { TtBoard, TtBoardRow } from "@/lib/timeTrials/store";
import type { TtClass, TtGame } from "@/lib/timeTrials/tracks";

type Scope = { id: string; label: string; scope: "everyone" | "friends" | "crew" | "server"; guild?: string };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export function TimeTrialBoard({ initial, game, track, cc, signedIn, servers }: {
  initial: TtBoard; game: TtGame; track: string; cc: TtClass; signedIn: boolean; servers: { guildId: string; name: string }[];
}) {
  const [board, setBoard] = useState(initial);
  const [scopeId, setScopeId] = useState("everyone");
  const [proofOnly, setProofOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const scopes: Scope[] = [
    { id: "everyone", label: "Everyone", scope: "everyone" },
    ...(signedIn ? [{ id: "friends", label: "Friends", scope: "friends" as const }, { id: "crew", label: "My crew", scope: "crew" as const }] : []),
    ...servers.map((s) => ({ id: `server:${s.guildId}`, label: s.name, scope: "server" as const, guild: s.guildId })),
  ];

  async function load(nextScope: string, nextProof: boolean) {
    const s = scopes.find((x) => x.id === nextScope) ?? scopes[0];
    setLoading(true);
    try {
      const qs = new URLSearchParams({ game, track, cc: String(cc), scope: s.scope });
      if (s.guild) qs.set("guild", s.guild);
      if (nextProof) qs.set("proof", "1");
      const res = await fetch(`/api/time-trials?${qs}`);
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; board?: TtBoard };
      if (j.ok && j.board) setBoard(j.board);
    } finally {
      setLoading(false);
    }
  }

  async function remove(row: TtBoardRow) {
    if (!(await confirm({ title: "Remove your time?", body: `${formatTime(row.timeMs)} comes off every board. Your next best time takes its place.`, confirmLabel: "Remove time" }))) return;
    const res = await fetch(`/api/time-trials/${row.timeId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Time removed"); void load(scopeId, proofOnly); }
    else toast.error("That time couldn't be removed.");
  }
  async function report(row: TtBoardRow) {
    if (!(await confirm({ title: `Report ${row.name}'s time?`, body: "GameShuffle staff will look at it and remove it if it isn't real.", confirmLabel: "Report time" }))) return;
    const res = await fetch(`/api/time-trials/${row.timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report" }) });
    if (res.ok) toast.success("Reported. Thanks for letting us know.");
    else toast.error("That report didn't go through.");
  }

  const rows = board.mine ? [...board.rows, board.mine] : board.rows;
  return (
    <div className="tt-board" aria-busy={loading}>
      <div className="tt-board__controls">
        <div className="tt-board__scopes" role="group" aria-label="Whose times">
          {scopes.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              icon={s.scope === "server" ? <IconBrandDiscord size={16} aria-hidden="true" /> : undefined}
              clickable
              selected={s.id === scopeId}
              onClick={() => { setScopeId(s.id); void load(s.id, proofOnly); }}
            />
          ))}
        </div>
        <Switch label="With proof only" checked={proofOnly} onChange={(e) => { const v = e.target.checked; setProofOnly(v); void load(scopeId, v); }} />
      </div>

      {rows.length === 0 ? (
        <p className="tt-board__empty">{proofOnly ? "No times with proof here yet." : scopeId === "everyone" ? "No times on this track yet. Add the first one." : "No times from these players yet."}</p>
      ) : (
        <TableScroll label="Times on this track">
          <Table className="tt-board__table">
            <TableHeader>
              <TableRow>
                <TableHead>Place</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Set</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.player} className={`${r.you ? "tt-board__you" : ""}${board.mine && i === rows.length - 1 ? " tt-board__gap" : ""}`}>
                  <TableCell className="tt-board__place">{r.rank}</TableCell>
                  <TableCell>
                    <span className="tt-board__who">
                      <Avatar size="small" src={r.avatar ?? undefined} initials={r.name.slice(0, 1).toUpperCase()} alt="" />
                      {r.profile ? <Link href={r.profile}>{r.name}</Link> : <span>{r.name}</span>}
                      {r.discord && <IconBrandDiscord size={16} className="tt-board__discord" aria-label="(played in Discord)" />}
                      {r.you && <span className="tt-board__tag">You</span>}
                    </span>
                  </TableCell>
                  <TableCell className="tt-board__time">{formatTime(r.timeMs)}</TableCell>
                  <TableCell>
                    <span className="tt-board__proof">
                      {r.proofUrl && r.proof !== "none" ? (
                        <a href={r.proofUrl} target="_blank" rel="noopener noreferrer nofollow">
                          {r.proof === "video" ? <IconVideo size={18} aria-hidden="true" /> : <IconCamera size={18} aria-hidden="true" />}
                          {r.proof === "video" ? "Video" : "Screenshot"}
                        </a>
                      ) : <span className="tt-board__none">None</span>}
                      {r.verifiedIn.length > 0 && (
                        <span className="tt-board__verified"><IconCircleCheck size={16} aria-hidden="true" /> Verified in {r.verifiedIn.join(", ")}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="tt-board__date">{dateFmt.format(new Date(r.at))}</TableCell>
                  <TableCell>
                    {r.you ? <IconAction label="Remove your time" icon={IconTrash} variant="danger" onClick={() => void remove(r)} />
                      : signedIn ? <IconAction label={`Report ${r.name}'s time`} icon={IconFlag} onClick={() => void report(r)} /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
      <p className="tt-board__count">{board.total} {board.total === 1 ? "player" : "players"}{board.proofOnly ? " with proof" : ""}</p>
    </div>
  );
}
