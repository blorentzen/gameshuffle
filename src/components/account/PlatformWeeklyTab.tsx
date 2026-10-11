"use client";

/**
 * Platform admin ▸ Originals ▸ Weekly Challenge (staff/admin). This week and next week: usually
 * a survey (the oldest family-safe question in the Chat Brain queue, picked
 * automatically), a Tier War when the queue is empty; plus the game-night
 * mission. Swap the question (any waiting Chat Brain draft), the Tier War topic
 * or the mission. Next week any time; this week only before anyone plays.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminPanel } from "@/components/account/admin/AdminKit";

const KEEP = "keep";
const weekStart = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const WEEK_STATUS: Record<string, string> = { open: "open", revealing: "revealing results", revealed: "results out", closed: "closed" };

interface WeekInfo {
  week: string; number: number; status: string; topicId: string; title: string; items: string[];
  agendaCardId: string; agendaTitle: string; players: number; swapped: boolean; kind: "tier" | "survey"; promptId: string | null;
}
interface Data { ready: boolean; weeks?: WeekInfo[]; topics?: { id: string; label: string }[]; agendas?: { id: string; title: string; text: string }[]; questions?: { id: string; text: string }[] }

const ERRORS: Record<string, string> = {
  has_entries: "Someone has already played this week, so its topic and mission are locked.",
  not_open: "That week is already closed.",
  not_draft: "That question is no longer waiting in the Chat Brain queue.",
  bad_topic: "That topic can't be used.",
  bad_agenda: "That mission can't be used (it has to fit any game).",
};

function WeekCard({ w, data, onSaved }: { w: WeekInfo; data: Data; onSaved: (w: WeekInfo) => void }) {
  const toast = useToast();
  const [topic, setTopic] = useState(w.topicId);
  const [agenda, setAgenda] = useState(w.agendaCardId);
  // CDS Select treats "" as no choice and hides its label, so "keep" stands in.
  const [question, setQuestion] = useState(KEEP);
  const [busy, setBusy] = useState(false);
  const swap = question !== KEEP ? question : null;
  const dirty = !!swap || topic !== w.topicId || agenda !== w.agendaCardId;

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/weekly", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(swap ? { week: w.week, promptId: swap, agendaCardId: agenda } : { week: w.week, topicId: w.kind === "tier" ? topic : undefined, agendaCardId: agenda }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { onSaved(d.week); toast.success("Weekly Challenge updated"); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't update the week.");
  };

  return (
    <AdminPanel>
      <div className="poll-head">
        <h3 className="admin-panel__title">Week {w.number} · starts {weekStart(w.week)}</h3>
        <Badge variant={w.swapped ? "info" : "default"} size="small">{w.swapped ? "Picked by staff" : "Picked automatically"}</Badge>
      </div>
      <p className="dbot-muted">{w.players} {w.players === 1 ? "player" : "players"} so far · {WEEK_STATUS[w.status] ?? w.status}</p>
      {w.kind === "survey" ? <p><strong>Survey:</strong> {w.title}</p> : <p><strong>Tier War:</strong> {w.title}: {w.items.join(", ")}</p>}
      <p><strong>Game-night mission:</strong> {w.agendaTitle}</p>
      <div className="poll-form">
        <Select floatingLabel={w.kind === "survey" ? "Swap the survey question" : "Make it a survey"} value={question} onChange={(v) => setQuestion(String(v))}
          options={[{ value: KEEP, label: (data.questions ?? []).length ? "Keep as is" : "No drafts waiting on the Chat Brain tab" }, ...(data.questions ?? []).map((q) => ({ value: q.id, label: q.text }))]} />
        {w.kind === "tier" && (
          <Select floatingLabel="Tier War topic" value={topic} onChange={(v) => setTopic(String(v))}
            options={(data.topics ?? []).map((t) => ({ value: t.id, label: t.label }))} />
        )}
        <Select floatingLabel="Game-night mission" value={agenda} onChange={(v) => setAgenda(String(v))}
          options={(data.agendas ?? []).map((a) => ({ value: a.id, label: `${a.title}: ${a.text}` }))} />
        <div><Button variant="primary" size="small" disabled={busy || !dirty} onClick={() => void save()}>Save week {w.number}</Button></div>
      </div>
    </AdminPanel>
  );
}

export function PlatformWeeklyTab() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setData(d?.ok ? d : { ready: false }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const header = (
    <AdminHeader
      title="Weekly Challenge"
      intro="Each week is a survey: the oldest family-safe draft on the Chat Brain tab is picked automatically, or a Tier War when there are none. Swap the question, topic or game-night mission here. Next week can change any time; this week only until someone plays it."
    />
  );
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading" /></div>;
  return (
    <div className="account-card admin-screen">
      {header}
      {!data.ready ? (
        <Alert variant="info" title="Not set up yet">The Weekly Challenge&apos;s tables aren&apos;t on this database yet.</Alert>
      ) : (
        (data.weeks ?? []).map((w, i) => (
          <WeekCard key={`${w.week}-${w.topicId}-${w.agendaCardId}`} w={w} data={data}
            onSaved={(nw) => setData((d) => d && ({ ...d, weeks: d.weeks!.map((x, j) => (j === i ? nw : x)) }))} />
        ))
      )}
    </div>
  );
}
