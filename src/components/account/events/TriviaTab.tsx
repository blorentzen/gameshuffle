"use client";

/**
 * Your events ▸ Events ▸ Trivia (menus and account picks 2026-11-05, 4A): the trivia nights you host and the leagues
 * you run, one row each, beside Tournaments and Game nights. Reads /api/trivia/games and /api/trivia/leagues.
 */

import { useEffect, useState } from "react";
import { Button, EmptyState } from "@empac/cascadeds";
import { useRouter } from "next/navigation";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { StuffGroup, StuffRow, StuffThumb } from "@/components/account/stuff/StuffList";
import "@/styles/account-home.css";

interface Night { id: string; title: string; code: string; status: string; createdAt: string; questions: number }
interface League { id: string; slug: string; title: string; status: string; weeks: number }

const NIGHT_STATUS: Record<string, string> = { draft: "Not started", live: "Live now", done: "Finished", cancelled: "Cancelled" };

export function TriviaTab() {
  const router = useRouter();
  const [nights, setNights] = useState<Night[] | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([
      fetch("/api/trivia/games", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/trivia/leagues", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([g, l]: [{ ok?: boolean; games?: Night[] } | null, { ok?: boolean; leagues?: League[] } | null]) => {
      if (!live) return;
      if (!g?.ok) { setFailed(true); return; }
      setNights(g.games ?? []);
      setLeagues(l?.ok ? l.leagues ?? [] : []);
    });
    return () => { live = false; };
  }, []);

  const host = <Button variant="secondary" size="small" onClick={() => router.push("/trivia")}>Host a trivia night</Button>;

  return (
    <AdminScreen title="Trivia" intro="The trivia nights you host and the leagues you run." actions={host}>
      {failed && <p className="acct-note">Your trivia couldn&apos;t be loaded. Try again in a moment.</p>}
      {!failed && nights === null && <p className="acct-note" role="status">Loading…</p>}
      {nights && nights.length === 0 && leagues.length === 0 && (
        <EmptyState title="No trivia nights yet" description="Teams answer on their phones while the questions show on a TV. Pick a template and you're set." action={host} />
      )}
      <StuffGroup title="Leagues" items={leagues} row={(l) => (
        <StuffRow key={l.id} thumb={<StuffThumb art="originals" seed={l.id} />} title={l.title} href={`/trivia/leagues/${l.slug}`}
          meta={`${l.weeks} weeks · ${l.status === "active" ? "Running" : l.status === "finished" ? "Finished" : "Archived"}`}
          action={{ label: "Manage", href: `/trivia/leagues/${l.slug}/manage` }} />
      )} />
      <StuffGroup title="Trivia nights" items={nights ?? []} page={10} row={(n) => (
        <StuffRow key={n.id} thumb={<StuffThumb art="originals" seed={n.id} />} title={n.title} href={`/trivia/host/${n.id}`}
          meta={`${NIGHT_STATUS[n.status] ?? n.status} · ${n.questions} question${n.questions === 1 ? "" : "s"} · code ${n.code}`}
          action={n.status === "draft" || n.status === "live" ? { label: "Open", href: `/trivia/host/${n.id}` } : undefined} />
      )} />
    </AdminScreen>
  );
}
