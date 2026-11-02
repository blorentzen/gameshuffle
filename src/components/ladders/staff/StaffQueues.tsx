"use client";

/**
 * Staff page ▸ Settings ▸ Queues (lounge system picks 2A to 4A): a lounge's queue channels. Each is always open (a
 * room the moment it's full) or rush hour at set Pacific times, with an MMR range and the formats a room votes on.
 * Saving posts or updates the queue's card in its Discord channel. Admins change them; updaters see them.
 */

import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Modal, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { Select } from "@/components/ui/Select";
import { formatLabel } from "@/lib/ladders/types";
import type { StaffTabProps } from "./RankedStaffHub";
import { ModalButtons } from "./StaffPeople";
import type { HubData } from "./types";

type QueueRow = NonNullable<HubData["queues"]>[number];
const FORMATS = [1, 2, 3, 4, 6];

export function StaffQueues({ data, act, reload, ladderId }: StaffTabProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<QueueRow | "new" | null>(null);
  const admin = data.you.role === "admin";
  if (data.queues === null) return <p className="ladder-muted">Queues need a database update before they can be set up.</p>;
  const post = async (q: QueueRow) => {
    const res = await act({ action: "queue_post", id: q.id });
    if (res.ok) toast.success(`${q.name}'s card is posted.`);
    else toast.error(res.error === "no_channel" ? "Pick a channel for this queue first." : res.error === "no_access" ? "The bot can't post in that channel. Give GameShuffle Competitive Send Messages there." : "That didn't work. Try again.");
  };
  const remove = async (q: QueueRow) => {
    if (!(await confirm({ title: `Delete ${q.name}?`, body: "Its card comes down and everyone waiting leaves the queue. Rooms already made stay.", confirmLabel: "Delete the queue" }))) return;
    const res = await act({ action: "queue_delete", id: q.id });
    if (res.ok) { toast.success(`${q.name} is deleted.`); reload(); } else toast.error("That didn't work. Try again.");
  };
  return (
    <>
      {data.queues.length ? (
        <ul className="ranked-staff__list">
          {data.queues.map((q) => (
            <li key={q.id} className="ranked-staff__row">
              <div className="ranked-staff__row-main">
                <span className="ranked-staff__row-title">{q.name}{q.active ? "" : " (closed)"}</span>
                <span className="ladder-muted">{q.mode === "rush" ? `Rush hour at ${q.rushTimes.join(", ")} Pacific` : "Always open"} · {q.range} · {data.ladder.kind === "knockout" ? "Knockout Tour" : q.formats.map(formatLabel).join(", ")}</span>
                <span className="ladder-muted">{q.channelId ? (q.messageId ? "Card posted" : "Card not posted yet") : "No channel yet"} · {q.waiting} waiting</span>
              </div>
              {admin && (
                <div className="ranked-staff__row-acts">
                  <Button size="small" variant="secondary" onClick={() => setEditing(q)}>Edit</Button>
                  <Button size="small" variant="ghost" onClick={() => post(q)}>Post the card</Button>
                  <Button size="small" variant="ghost" onClick={() => remove(q)}>Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ladder-muted">No queues yet. This lounge takes tables from rooms it makes elsewhere until it has one.</p>
      )}
      {admin && <div className="ranked-staff__bar"><Button variant="secondary" onClick={() => setEditing("new")}>Add a queue</Button></div>}
      {editing && <QueueForm queue={editing === "new" ? null : editing} knockout={data.ladder.kind === "knockout"} ladderId={ladderId} act={act} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />}
    </>
  );
}

function QueueForm({ queue, knockout, ladderId, act, onClose }: { queue: QueueRow | null; knockout: boolean; ladderId: string; act: StaffTabProps["act"]; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [name, setName] = useState(queue?.name ?? "");
  const [channelId, setChannelId] = useState(queue?.channelId ?? "");
  const [mode, setMode] = useState<"open" | "rush">(queue?.mode ?? "open");
  const [minMmr, setMin] = useState(queue?.minMmr != null ? String(queue.minMmr) : "");
  const [maxMmr, setMax] = useState(queue?.maxMmr != null ? String(queue.maxMmr) : "");
  const [formats, setFormats] = useState<number[]>(queue?.formats ?? FORMATS);
  const [times, setTimes] = useState(queue?.rushTimes.join(", ") ?? "");
  const [closeMinutes, setClose] = useState(String(queue?.closeMinutes ?? 5));
  const [lowest, setLowest] = useState(queue?.lowest ?? false);
  const [active, setActive] = useState(queue?.active ?? true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ranked/${ladderId}/staff?channels=1`, { cache: "no-store" }).then((r) => r.json()).then((j: { channels?: { id: string; name: string }[] }) => { if (alive) setChannels(j.channels ?? []); }).catch(() => { if (alive) setChannels([]); });
    return () => { alive = false; };
  }, [ladderId]);

  const save = async () => {
    setBusy(true);
    const res = await act({
      action: "queue_save", ...(queue ? { id: queue.id } : {}),
      queue: {
        name, channelId: channelId || null, mode, minMmr: minMmr === "" ? null : Number(minMmr), maxMmr: maxMmr === "" ? null : Number(maxMmr), formats,
        rushTimes: times.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean).map((t) => (/^\d:\d{2}$/.test(t) ? `0${t}` : t)), closeMinutes: Number(closeMinutes) || 0, lowest, active,
      },
    });
    setBusy(false);
    if (res.ok) { toast.success(queue ? "Queue saved." : "Queue added."); onClose(true); }
    else toast.error(res.error === "no_times" ? "A rush hour queue needs its times, like 20:00, 22:00." : "That didn't save. Try again.");
  };
  const toggle = (f: number, on: boolean) => setFormats((cur) => (on ? [...new Set([...cur, f])].sort((a, b) => a - b) : cur.filter((x) => x !== f)));
  return (
    <Modal isOpen size="large" onClose={() => onClose(false)} title={queue ? `Edit ${queue.name}` : "Add a queue"} footer={<ModalButtons label={queue ? "Save" : "Add the queue"} onClick={save} busy={busy} disabled={!name.trim() || (!knockout && !formats.length)} onCancel={() => onClose(false)} />}>
      <div className="ranked-form">
        <div className="ranked-form__pair">
          <Input floatingLabel="Name, like Tier A" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Select floatingLabel="Channel for its card" value={channelId} onChange={(v) => setChannelId(String(v))} options={[{ value: "", label: channels === null ? "Loading the channels…" : "No channel yet" }, ...(channels ?? []).map((c) => ({ value: c.id, label: `#${c.name}` }))]} />
        </div>
        <Select floatingLabel="How rooms are made" value={mode} onChange={(v) => setMode(v === "rush" ? "rush" : "open")} options={[{ value: "open", label: "Always open: a room the moment it's full" }, { value: "rush", label: "Rush hour: sorted by MMR at set times" }]} />
        {mode === "rush" && (
          <div className="ranked-form__pair">
            <Input floatingLabel="Times, Pacific, like 20:00, 22:00" value={times} maxLength={80} onChange={(e) => setTimes(e.target.value)} />
            <Input floatingLabel="Joining closes (minutes before)" type="number" min={0} max={120} value={closeMinutes} onChange={(e) => setClose(e.target.value)} />
          </div>
        )}
        <div className="ranked-form__pair">
          <Input floatingLabel="Lowest MMR (optional)" type="number" min={0} max={30000} value={minMmr} onChange={(e) => setMin(e.target.value)} />
          <Input floatingLabel="Highest MMR (optional)" type="number" min={0} max={30000} value={maxMmr} onChange={(e) => setMax(e.target.value)} />
        </div>
        {!knockout && (
          <fieldset className="ranked-formats">
            <legend>Formats a room votes on</legend>
            {FORMATS.map((f) => <Checkbox key={f} label={formatLabel(f)} checked={formats.includes(f)} onChange={(e) => toggle(f, e.target.checked)} />)}
          </fieldset>
        )}
        <Switch label="Players still placing join here" helperText="Turn it on for the lowest tier. Players still placing can't join other queues." checked={lowest} onChange={(e) => setLowest(e.target.checked)} />
        <Switch label="Open" helperText="A closed queue keeps its card but takes nobody new." checked={active} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Modal>
  );
}
