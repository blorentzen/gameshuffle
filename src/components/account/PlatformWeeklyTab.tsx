"use client";

/**
 * Platform ▸ Weekly Challenge (staff/admin). This week and next week's picks
 * (the automatic Tier War topic and shared agenda), with a swap for each.
 * Next week can change any time; this week only before anyone has played it.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface WeekInfo {
  week: string; number: number; status: string; topicId: string; title: string; items: string[];
  agendaCardId: string; agendaTitle: string; players: number; swapped: boolean;
}
interface Data { ready: boolean; weeks?: WeekInfo[]; topics?: { id: string; label: string }[]; agendas?: { id: string; title: string; text: string }[] }

const ERRORS: Record<string, string> = {
  has_entries: "Someone has already played this week, so its topic and mission are locked.",
  not_open: "That week is already closed.",
  bad_topic: "That topic can't be used.",
  bad_agenda: "That mission can't be used (it has to fit any game).",
};

function WeekCard({ w, data, onSaved }: { w: WeekInfo; data: Data; onSaved: (w: WeekInfo) => void }) {
  const toast = useToast();
  const [topic, setTopic] = useState(w.topicId);
  const [agenda, setAgenda] = useState(w.agendaCardId);
  const [busy, setBusy] = useState(false);
  const dirty = topic !== w.topicId || agenda !== w.agendaCardId;

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/weekly", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: w.week, topicId: topic, agendaCardId: agenda }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { onSaved(d.week); toast.success("Weekly Challenge updated"); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't update the week.");
  };

  return (
    <div className="account-card">
      <div className="poll-head">
        <h3 className="account-card__title">Week {w.number} · starts {w.week}</h3>
        <Badge variant={w.swapped ? "warning" : "default"} size="small">{w.swapped ? "Swapped by staff" : "Automatic pick"}</Badge>
      </div>
      <p className="dbot-muted">{w.players} {w.players === 1 ? "player" : "players"} so far · {w.status}</p>
      <p><strong>Tier War:</strong> {w.title}: {w.items.join(", ")}</p>
      <p><strong>Game-night mission:</strong> {w.agendaTitle}</p>
      <div className="poll-form">
        <Select floatingLabel="Tier War topic" value={topic} onChange={(v) => setTopic(String(v))}
          options={(data.topics ?? []).map((t) => ({ value: t.id, label: t.label }))} />
        <Select floatingLabel="Game-night mission" value={agenda} onChange={(v) => setAgenda(String(v))}
          options={(data.agendas ?? []).map((a) => ({ value: a.id, label: `${a.title}: ${a.text}` }))} />
        <div><Button variant="primary" size="small" disabled={busy || !dirty} onClick={() => void save()}>Save this week</Button></div>
      </div>
    </div>
  );
}

export function PlatformWeeklyTab() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setData(d?.ok ? d : { ready: false }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return <div className="account-card"><p>Loading…</p></div>;
  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Weekly Challenge</h2>
      <p className="account-tab__intro">
        Each week picks its Tier War topic and game-night mission automatically. Swap either one here. Next week can change any time; this week only until someone plays it.
      </p>
      {!data.ready ? (
        <Alert variant="info" title="Needs the database update">Apply weekly-challenge-m1.sql to turn this on.</Alert>
      ) : (
        (data.weeks ?? []).map((w, i) => (
          <WeekCard key={`${w.week}-${w.topicId}-${w.agendaCardId}`} w={w} data={data}
            onSaved={(nw) => setData((d) => d && ({ ...d, weeks: d.weeks!.map((x, j) => (j === i ? nw : x)) }))} />
        ))
      )}
    </div>
  );
}
