"use client";

/**
 * Platform ▸ People ▸ Time trial reports: times people reported from a board or Discord,
 * oldest first. Keep closes the reports; Remove takes the time off every board.
 */

import { useEffect, useState } from "react";
import { Button, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { AdminScreen, AdminTable } from "@/components/account/admin/AdminKit";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { formatTime } from "@/lib/timeTrials/rules";
import { trackPath, ttTrack, TT_GAMES, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import "@/styles/time-trials.css";

type Report = {
  id: string; reason: string | null; at: string; reports: number; name: string;
  time: { id: string; game: TtGame; track: string; cc: TtClass; timeMs: number; proof: "none" | "screenshot" | "video"; proofUrl: string | null; status: "ok" | "removed" };
};

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function PlatformTimeTrialsTab() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/time-trials").then((r) => r.json()).catch(() => ({})).then((j: { reports?: Report[] }) => { if (alive) setReports(j.reports ?? []); });
    return () => { alive = false; };
  }, [reloadKey]);

  async function resolve(r: Report, outcome: "kept" | "removed") {
    if (outcome === "removed" && !(await confirm({ title: `Remove ${r.name}'s time?`, body: "It comes off every board. The player isn't told.", confirmLabel: "Remove time" }))) return;
    const res = await fetch("/api/admin/time-trials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeId: r.time.id, outcome }) });
    if (res.ok) { toast.success(outcome === "removed" ? "Time removed" : "Kept"); load(); }
    else toast.error("That didn't save.");
  }

  return (
    <AdminScreen title="Time trial reports" intro="Times people reported from a board or in Discord. Keep closes the reports; Remove takes the time off every board.">
      {reports === null ? <p>Loading…</p> : reports.length === 0 ? (
        <EmptyState title="Nothing reported" description="Reported times show up here." />
      ) : (
        <AdminTable label="Reported times">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => {
                const t = ttTrack(r.time.game, r.time.track);
                return (
                  <TableRow key={r.time.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{t ? <a href={trackPath(t, r.time.cc)} target="_blank" rel="noopener noreferrer">{t.name}</a> : r.time.track} <span className="tt-muted">{TT_GAMES[r.time.game].short}{TT_GAMES[r.time.game].classes.length > 1 ? ` ${r.time.cc}cc` : ""}</span></TableCell>
                    <TableCell>{formatTime(r.time.timeMs)}{r.time.status === "removed" ? " (removed)" : ""}</TableCell>
                    <TableCell>{r.time.proofUrl ? <a href={r.time.proofUrl} target="_blank" rel="noopener noreferrer nofollow">{r.time.proof === "video" ? "Video" : "Screenshot"}</a> : "None"}</TableCell>
                    <TableCell>{r.reports}{r.reason ? `: ${r.reason}` : ""} <span className="tt-muted">since {when.format(new Date(r.at))}</span></TableCell>
                    <TableCell>
                      <div className="tt-add__actions">
                        <Button size="small" variant="secondary" onClick={() => void resolve(r, "kept")}>Keep</Button>
                        <Button size="small" variant="danger" onClick={() => void resolve(r, "removed")}>Remove</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminScreen>
  );
}
