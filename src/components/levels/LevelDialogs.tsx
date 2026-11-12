"use client";

/**
 * The board's windows (curation picks, all as recommended): report a level (wrong game, offensive, spam; three
 * reports hide it until staff look), a staff pin with its one-line note, and adding a level to one of your lists
 * (or a new one).
 */

import { useState } from "react";
import { Button, Input, Modal, Radio, RadioGroup, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { itemWord } from "@/lib/levels/games";
import { LEVEL_REPORTS, LIST_TITLE_MAX, PICK_NOTE_MAX, type LevelReportId } from "@/lib/levels/rules";
import type { LevelCardView } from "@/lib/levels/types";

export async function levelPost(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const r = await fetch(`/api/levels/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = (await r?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: !!r?.ok, data };
}

export function ReportDialog({ level, onClose }: { level: LevelCardView | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<LevelReportId>("wrong_game");
  const [busy, setBusy] = useState(false);
  if (!level) return null;
  const send = async () => {
    setBusy(true);
    const r = await levelPost(level.id, { action: "report", reason });
    setBusy(false);
    if (r.ok) { toast.success("Thanks. Staff will take a look."); onClose(); }
    else toast.error(r.data?.error === "rate_limited" ? "That's a lot of reports for one day. Try again tomorrow." : "That didn't go through. Try again.");
  };
  return (
    <Modal isOpen onClose={onClose} title={`Report ${level.title}`} size="small"
      footer={<div className="lvl-share__foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void send()} disabled={busy}>Send the report</Button>
      </div>}>
      <div className="lvl-share__body">
        <RadioGroup name="lvl-report" label={`What's wrong with this ${itemWord(level.game)}?`} value={reason} onChange={(v) => setReason(v as LevelReportId)}>
          {LEVEL_REPORTS.map((r) => <Radio key={r.id} value={r.id} label={r.label} />)}
        </RadioGroup>
        <p className="lvl-share__note">Staff read every report. When a few players report the same {itemWord(level.game)}, it comes off the board until they&apos;ve looked.</p>
      </div>
    </Modal>
  );
}

export function PinDialog({ level, onClose, onSaved }: { level: LevelCardView | null; onClose: () => void; onSaved: (l: LevelCardView) => void }) {
  const toast = useToast();
  const [note, setNote] = useState(level?.curation?.pick ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!level) return null;
  const pinned = !!level.curation?.pick;
  const save = async (unpin = false) => {
    setBusy(true);
    setProblem(null);
    const r = await levelPost(level.id, unpin ? { action: "unpin" } : { action: "pin", note });
    setBusy(false);
    if (!r.ok) { setProblem((r.data?.line as string | undefined) ?? "That didn't go through. Try again."); return; }
    toast.success(unpin ? "Pin taken off" : pinned ? "Note saved" : "Pinned as a GameShuffle pick");
    onSaved(r.data?.level as LevelCardView);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={pinned ? "GameShuffle pick" : "Pin as a GameShuffle pick"} size="small"
      footer={<div className="lvl-share__foot">
        {pinned && <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>Take the pin off</Button>}
        <Button variant="primary" onClick={() => void save()} disabled={busy}>{pinned ? "Save the note" : "Pin it"}</Button>
      </div>}>
      <div className="lvl-share__body">
        <p className="lvl-share__note">Picks show first on the board and on the space&apos;s Now tab, up to six for each game.</p>
        <Input floatingLabel="Why it's a pick (one line)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={PICK_NOTE_MAX} fullWidth />
        {problem && <p className="lvl-share__problem" role="alert">{problem}</p>}
      </div>
    </Modal>
  );
}

export function AddToListDialog({ level, lists, onClose, onListsChange }: {
  level: LevelCardView | null;
  lists: { id: string; title: string; count: number }[];
  onClose: () => void;
  onListsChange: (lists: { id: string; title: string; count: number }[]) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [pub, setPub] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!level) return null;

  const add = async (listId: string, name: string) => {
    setBusy(listId);
    setProblem(null);
    const r = await fetch(`/api/levels/lists/${listId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", levelId: level.id }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { line?: string } | null;
    setBusy(null);
    if (!r?.ok) { setProblem(d?.line ?? "That didn't go through. Try again."); return; }
    onListsChange(lists.map((l) => (l.id === listId ? { ...l, count: l.count + 1 } : l)));
    toast.success(`Added to ${name}`);
    onClose();
  };
  const make = async () => {
    setBusy("new");
    setProblem(null);
    const r = await fetch("/api/levels/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: level.game, title, public: pub }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { list?: { id: string; title: string }; line?: string } | null;
    if (!r?.ok || !d?.list) { setBusy(null); setProblem(d?.line ?? "That didn't go through. Try again."); return; }
    const made = { id: d.list.id, title: d.list.title, count: 0 };
    onListsChange([made, ...lists]);
    setTitle("");
    await add(made.id, made.title);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Add ${level.title} to a list`} size="small">
      <div className="lvl-share__body">
        {lists.length > 0 && (
          <ul className="lvl-lists-pick" aria-label="Your lists">
            {lists.map((l) => (
              <li key={l.id}>
                <span><b>{l.title}</b> <span className="lvl-row__line">{l.count} {l.count === 1 ? "level" : "levels"}</span></span>
                <Button size="small" variant="secondary" onClick={() => void add(l.id, l.title)} disabled={busy !== null}>Add</Button>
              </li>
            ))}
          </ul>
        )}
        <fieldset className="lvl-share__tags">
          <legend>{lists.length ? "Or make a new list" : "Make a list"}</legend>
          <Input floatingLabel="List name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIST_TITLE_MAX} fullWidth />
          <Switch label="Anyone can see it" checked={pub} onChange={(e) => setPub(e.target.checked)} />
          <div><Button variant="primary" size="small" onClick={() => void make()} disabled={busy !== null || !title.trim()}>Make it and add</Button></div>
        </fieldset>
        {problem && <p className="lvl-share__problem" role="alert">{problem}</p>}
      </div>
    </Modal>
  );
}
