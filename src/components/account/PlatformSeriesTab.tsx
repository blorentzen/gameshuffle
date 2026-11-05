"use client";

/**
 * Platform ▸ Events ▸ Series: GameShuffle's team series (the GS Summer Series). Lists them with their stage
 * and size, and makes a new one (in draft, with a Kickoff and a Final). Each is run from its own page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconPlus, IconTrophy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { AdminField, AdminScreen, AdminTable } from "@/components/account/admin/AdminKit";
import { seriesPath } from "@/lib/series/view";
import "@/styles/series.css";

interface Row { id: string; slug: string; title: string; status: "draft" | "announced" | "live" | "finished"; teams: number; players: number; created_at: string }
const STAGE: Record<Row["status"], { label: string; variant: "default" | "info" | "success" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  announced: { label: "Announced", variant: "info" },
  live: { label: "Live", variant: "success" },
  finished: { label: "Finished", variant: "default" },
};

export function PlatformSeriesTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("GS Summer Series");
  const [slug, setSlug] = useState("summer-series");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/series", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((j: { series?: Row[]; error?: string } | null) => {
        if (!alive) return;
        if (j?.error === "not_ready") setNotReady(true);
        setRows(j?.series ?? []);
      });
    return () => { alive = false; };
  }, []);

  const create = async () => {
    const res = await fetch("/api/admin/series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, slug }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { slug?: string; error?: string } | null;
    if (!res?.ok || !j?.slug) { toast.error(j?.error ?? "Couldn't make the series."); return; }
    toast.success("Series made");
    window.location.href = `/series/${j.slug}/manage`;
  };

  return (
    <AdminScreen
      title="Series"
      intro="GameShuffle's own team events: teams of a competitive player and a creator, a track draft, nights run as official tournaments, predictions on every player's stream."
      actions={<Button variant="primary" iconBefore={IconPlus} onClick={() => setOpen(true)} disabled={notReady}>New series</Button>}
    >
      {notReady && <p role="alert">Series need the latest database update (series-m1).</p>}
      {rows && !rows.length && !notReady && (
        <EmptyState variant="subtle" icon={<IconTrophy size={40} stroke={1.4} />} title="No series yet" description="Make one, then add its teams, players and nights." />
      )}
      {rows && rows.length > 0 && (
        <AdminTable label="Series">
          <Table>
            <TableHeader><TableRow><TableHead>Series</TableHead><TableHead>Stage</TableHead><TableHead align="right">Teams</TableHead><TableHead align="right">Players</TableHead><TableHead>Page</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/series/${r.slug}/manage`}>{r.title}</Link></TableCell>
                  <TableCell><Badge size="small" variant={STAGE[r.status].variant}>{STAGE[r.status].label}</Badge></TableCell>
                  <TableCell align="right">{r.teams}</TableCell>
                  <TableCell align="right">{r.players}</TableCell>
                  <TableCell><Link href={seriesPath(r.slug)}>gameshuffle.co{seriesPath(r.slug)}</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="New series" primaryAction={{ label: "Make it", onClick: create }} secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}>
          <div className="ss-form">
            <AdminField label="Name">{(id) => <Input id={id} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />}</AdminField>
            <AdminField label="Address" helper="summer-series gets gameshuffle.co/summer-series; anything else is /series/<address>.">{(id, d) => <Input id={id} aria-describedby={d} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />}</AdminField>
          </div>
        </Modal>
      )}
    </AdminScreen>
  );
}
