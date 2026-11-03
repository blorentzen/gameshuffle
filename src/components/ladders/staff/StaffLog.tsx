"use client";

/** Staff page ▸ Log: every staff action, from Discord, the web or GS Ranked itself, newest first. */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";
import type { StaffTabProps } from "./RankedStaffHub";
import { num, relative, type LogRow } from "./types";

const VIA: Record<LogRow["via"], string> = { discord: "Discord", web: "The web", bot: "GS Ranked" };

const KIND: Record<string, string> = { penalty: "penalty report", reduce: "reduced loss ask", appeal: "appeal", name: "name change", join: "join request" };

/** One log line in words. */
export function logText(l: LogRow): string {
  const d = l.detail as Record<string, unknown>;
  const t = l.table != null ? `table ${num(l.table)}` : "a table";
  const p = l.player ?? "a player";
  switch (l.action) {
    case "verify": return `Verified ${t}${d.screenshot ? " with the screenshot's numbers" : ""}`;
    case "auto_verify": return `${t[0].toUpperCase()}${t.slice(1)} verified on its own`;
    case "send_back": return `Sent back ${t}${typeof d.note === "string" && d.note ? `: ${d.note}` : ""}`;
    case "undo": return `Undid ${t}`;
    case "fix": return `Fixed ${t}'s text`;
    case "penalty": {
      const parts = [d.mmr ? `−${num(Number(d.mmr))}` : null, d.strikes ? `${d.strikes} ${d.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ");
      return `Gave ${p} a penalty${parts ? ` (${parts})` : ""}${typeof d.reason === "string" ? `: ${d.reason}` : ""}`;
    }
    case "penalty_undo": return `Took back ${p}'s penalty`;
    case "break": return `${p} started a break${typeof d.days === "number" ? ` of ${d.days} days` : ""}`;
    case "break_end": return `Ended ${p}'s break`;
    case "request_accept": return `Accepted a ${KIND[String(d.kind)] ?? "request"}${l.player ? ` for ${p}` : ""}`;
    case "request_deny": return `Denied a ${KIND[String(d.kind)] ?? "request"}${l.player ? ` for ${p}` : ""}`;
    case "rename": return `Renamed ${String(d.from ?? "a player")} to ${String(d.to ?? p)}`;
    case "settings": return "Changed the settings";
    case "season_end": return `Ended Season ${String(d.season ?? "")} with a ${d.reset === "soft" ? "soft" : "full"} reset`;
    case "queue_create": return `Added the queue ${String(d.name ?? "")}`;
    case "queue_edit": return `Changed the queue ${String(d.name ?? "")}`;
    case "queue_delete": return `Deleted the queue ${String(d.name ?? "")}`;
    case "room_cancel": return `Canceled room ${num(Number(d.number ?? 0))}`;
    case "join": return `${p} joined the lounge`;
    case "mkc_match": return `${p} started at ${num(Number(d.start ?? 0))}, from ${String(d.from ?? "MKCentral")}`;
    default: return l.action.replace(/_/g, " ");
  }
}

export function StaffLog({ data }: StaffTabProps) {
  return (
    <section className="ranked-staff__panel" aria-labelledby="staff-log">
      <h2 id="staff-log" className="sr-only">Log</h2>
      {data.log.length ? (
        <TableScroll label="Every staff action, newest first">
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Where</TableHead><TableHead>What</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.log.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="ladder-num">{relative(l.at)}</TableCell>
                  <TableCell>{l.actor}</TableCell>
                  <TableCell>{VIA[l.via] ?? l.via}</TableCell>
                  <TableCell>{logText(l)}{l.undone ? " (taken back)" : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      ) : (
        <p className="ladder-muted">Nothing yet. Every action staff take shows here, from Discord or the web.</p>
      )}
    </section>
  );
}
