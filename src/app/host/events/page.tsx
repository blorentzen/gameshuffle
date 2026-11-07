/**
 * /host/events: every event you run in one list (journeys picks 2026-11-06, 7A), tournaments, game nights and trivia
 * nights together, narrowed by kind (`?kind=`) and grouped by stage: running, coming up, drafts, needing attention,
 * finished, archived. Each row opens where you run it. Replaces Account ▸ Your events' three event tabs.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { hostHome, type HostEvent, type HostKind, type HostStage } from "@/lib/host/home";
import { hostViewer } from "@/lib/host/server";
import { HostEventRow, HostHeader, KIND, StartSomething } from "@/components/host/HostParts";
import { HostKinds } from "@/components/host/HostKinds";

export const metadata: Metadata = { title: "Events · Host", robots: { index: false, follow: false } };

const GROUPS: { stage: HostStage; label: string; note?: string; action?: string }[] = [
  { stage: "running", label: "Running now", action: "Run it" },
  { stage: "stuck", label: "Still marked as running", note: "Their date passed days ago. Enter the last results or finish them.", action: "Finish" },
  { stage: "coming", label: "Coming up" },
  { stage: "draft", label: "Drafts", note: "Only you and your co-organizers can see these.", action: "Continue" },
  { stage: "stale", label: "Didn't start", note: "Their date passed before they started. Pick a new date or archive them." },
  { stage: "finished", label: "Finished", action: "Results" },
  { stage: "archived", label: "Archived and cancelled", action: "Open" },
];
const FINISHED_SHOWN = 10;

const byDate = (dir: 1 | -1) => (a: HostEvent, b: HostEvent) => dir * ((a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0));

export default async function HostEventsPage({ searchParams }: { searchParams: Promise<{ kind?: string; all?: string }> }) {
  const sp = await searchParams;
  const { userId, tz } = await hostViewer("/host/events");
  const home = await hostHome(userId);
  const kind = (["tournament", "night", "trivia"] as HostKind[]).find((k) => k === sp.kind) ?? null;
  const events = home.events.filter((e) => !kind || e.kind === kind);
  const counts = { all: home.events.length, tournament: 0, night: 0, trivia: 0 } as Record<"all" | HostKind, number>;
  for (const e of home.events) counts[e.kind] += 1;
  const kindQ = kind ? `kind=${kind}&` : "";

  return (
    <div className="hub-page studio-page host-page">
      <HostHeader />
      <HostKinds active={kind} counts={counts} />
      {events.length === 0 ? (
        <p className="hub-panel__empty">No {kind ? KIND[kind].label.toLowerCase() + "s" : "events"} yet.</p>
      ) : GROUPS.map((g) => {
        let rows = events.filter((e) => e.stage === g.stage).sort(byDate(g.stage === "coming" || g.stage === "draft" ? 1 : -1));
        if (!rows.length) return null;
        const total = rows.length;
        const cut = g.stage === "finished" && sp.all !== "1" && total > FINISHED_SHOWN;
        if (cut) rows = rows.slice(0, FINISHED_SHOWN);
        const id = `host-ev-${g.stage}`;
        return (
          <section key={g.stage} className="host-group" aria-labelledby={id}>
            <h2 id={id} className="hub-panel__title">{g.label} <span className="hub-page__group-count">{total}</span></h2>
            {g.note && <p className="host-group__note">{g.note}</p>}
            <ul className="hub-rows">{rows.map((e) => <HostEventRow key={`${e.kind}-${e.id}`} e={e} tz={tz} action={g.action ?? "Manage"} />)}</ul>
            {cut && <Link className="hub-panel__link" href={`/host/events?${kindQ}all=1`}>Show all {total}</Link>}
          </section>
        );
      })}
      <StartSomething />
    </div>
  );
}
