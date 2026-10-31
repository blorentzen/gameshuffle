"use client";

/** Events by time of night in the viewer's own time zone (GS Pro part of How they play). */

import { useMemo, useSyncExternalStore } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";

const BUCKETS = [
  { label: "Before 7pm", test: (h: number) => h >= 6 && h < 19 },
  { label: "7 to 10pm", test: (h: number) => h >= 19 && h < 22 },
  { label: "After 10pm", test: (h: number) => h >= 22 || h < 6 },
];
// The viewer's time zone is only known in the browser: render after hydration so the server's zone never shows.
const noop = () => () => {};
const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : n < 0 ? `−${Math.abs(Math.round(n))}` : "0");

export function TimeOfNight({ events }: { events: { at: string; delta: number }[] }) {
  const rows = useMemo(() => BUCKETS.map((b) => {
    const list = events.filter((e) => b.test(new Date(e.at).getHours()));
    return { label: b.label, n: list.length, avg: list.length ? list.reduce((s, e) => s + e.delta, 0) / list.length : 0 };
  }).filter((r) => r.n > 0), [events]);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <p className="lounge-empty">Working out your time zone…</p>;
  if (!rows.length) return <p className="lounge-empty">No events this season.</p>;
  return (
    <TableScroll label="Time of night table">
      <Table>
        <TableHeader><TableRow><TableHead>Time</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Average MMR</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell align="right">{r.n}</TableCell>
              <TableCell align="right"><span className={r.avg >= 0 ? "lounge-up" : "lounge-down"}>{signed(r.avg)}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
