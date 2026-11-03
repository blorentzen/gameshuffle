"use client";

/**
 * Comms ▸ Reminders: the web side of `/gs-remind` (name, web and docs pick 8A). The reminders the account's Discord
 * set in servers with GameShuffle, soonest first, each with Cancel.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@empac/cascadeds";
import { IconAlarm } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";

interface Reminder { id: string; message: string; at: string; server: string | null }

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function CommsReminders() {
  const toast = useToast();
  const [state, setState] = useState<{ discord: boolean; reminders: Reminder[] } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/reminders", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) setState({ discord: !!j.discord, reminders: j.reminders ?? [] }); }).catch(() => { if (alive) setState({ discord: true, reminders: [] }); });
    return () => { alive = false; };
  }, [version]);

  const cancel = async (r: Reminder) => {
    const res = await fetch(`/api/account/reminders?id=${r.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Reminder canceled."); reload(); } else toast.error("That reminder already went off.");
  };

  if (!state) return <p className="comms-reminders__note" role="status">Loading…</p>;
  if (!state.discord) {
    return <p className="comms-reminders__note">Connect Discord to see the reminders you set with <code>/gs-remind</code>. <Link href="/account?tab=security">Connect Discord</Link></p>;
  }
  if (!state.reminders.length) {
    // CDS EmptyState titles are always h3 (a CascadeDS gap): the hidden h2 keeps the heading order.
    return <><h2 className="sr-only">Reminders</h2><EmptyState variant="subtle" icon={<IconAlarm size={28} aria-hidden />} title="No reminders coming up" description="Set one in a server with GameShuffle: /gs-remind in:2h message:Start the tournament. It shows here until it goes off." /></>;
  }
  return (
    <>
    <h2 className="sr-only">Reminders</h2>
    <ul className="comms-reminders">
      {state.reminders.map((r) => (
        <li key={r.id} className="comms-reminders__row">
          <div className="comms-reminders__main">
            <span className="comms-reminders__text">{r.message}</span>
            <span className="comms-reminders__meta">{when(r.at)}{r.server ? ` · ${r.server}` : ""}</span>
          </div>
          <Button size="small" variant="ghost" onClick={() => cancel(r)}>Cancel</Button>
        </li>
      ))}
    </ul>
    </>
  );
}
