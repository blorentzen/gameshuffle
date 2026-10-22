"use client";

/** Events by day of the week in the viewer's own time zone, each on its night's day (GS Pro part of How they play). */

import { useMemo, useSyncExternalStore } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";
import { byWeekday } from "@/lib/lounge/season";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// The viewer's time zone is only known in the browser: render after hydration so the server's zone never shows.
const noop = () => () => {};
const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : n < 0 ? `−${Math.abs(Math.round(n))}` : "0");

export function DayOfWeek({ events }: { events: { at: string; delta: number }[] }) {
  const rows = useMemo(() => byWeekday(events, (ms) => new Date(ms).getDay()), [events]);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <p className="lounge-empty">Working out your time zone…</p>;
  if (!rows.length) return <p className="lounge-empty">No events this season.</p>;
  return (
    <TableScroll label="Day of the week table">
      <Table>
        <TableHeader><TableRow><TableHead>Night</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Average MMR</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.day}>
              <TableCell>{DAYS[r.day]}</TableCell>
              <TableCell align="right">{r.events}</TableCell>
              <TableCell align="right"><span className={r.average >= 0 ? "lounge-up" : "lounge-down"}>{signed(r.average)}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
