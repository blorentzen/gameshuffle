"use client";

/**
 * The board's Lists (curation picks 7A): lists of up to 20 levels players made, featured ones first, then public ones,
 * plus your own (private ones too). Open one to see its levels in order; its owner can take levels out, rename it,
 * make it private or delete it; staff can feature a public list; a GS Pro streamer can queue the whole list for a
 * level night (through the queue's own rules).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Modal, Switch } from "@empac/cascadeds";
import { IconCopy, IconX } from "@tabler/icons-react";
import { IconAction } from "@/components/actions/IconAction";
import { AdminRowMenu } from "@/components/account/admin/AdminKit";
import { GhostRows } from "@/components/ui/Ghost";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { itemWord, LEVEL_GAMES, type LevelGame } from "@/lib/levels/games";
import { LIST_MAX, LIST_TITLE_MAX } from "@/lib/levels/rules";
import type { BoardExtras, LevelCardView, LevelListView } from "@/lib/levels/types";
import { copyLevelCode } from "./LevelRow";
import { ProWallModal } from "@/components/billing/ProWallModal";

const patch = (id: string, body: Record<string, unknown>) =>
  fetch(`/api/levels/lists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);

export function queuedLine(q: { added: number; held: number; refused: { why: string }[] }): string {
  const parts = [`${q.added} added to your queue`];
  if (q.held) parts.push(`${q.held} held for another game`);
  const why = q.refused.reduce<Record<string, number>>((m, r) => ({ ...m, [r.why]: (m[r.why] ?? 0) + 1 }), {});
  if (why.played) parts.push(`${why.played} already played this stream`);
  if (why.in_line) parts.push(`${why.in_line} already in line`);
  if (why.yours) parts.push(`${why.yours} skipped: one level each player in line`);
  if (why.full) parts.push(`${why.full} skipped: the line is full`);
  return parts.join(", ");
}

function ListLevels({ list, viewer, onCount }: { list: LevelListView; viewer: BoardExtras["viewer"]; onCount: (n: number) => void }) {
  const toast = useToast();
  const [levels, setLevels] = useState<LevelCardView[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/levels/lists/${list.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (live) setLevels((d as { levels?: LevelCardView[] } | null)?.levels ?? []);
    }).catch(() => { if (live) setLevels([]); });
    return () => { live = false; };
  }, [list.id]);
  const takeOut = async (l: LevelCardView) => {
    const r = await patch(list.id, { action: "remove", levelId: l.id });
    if (!r?.ok) { toast.error("That didn't go through. Try again."); return; }
    setLevels((ls) => (ls ?? []).filter((x) => x.id !== l.id));
    onCount(Math.max(0, (levels?.length ?? 1) - 1));
  };
  if (!levels) return <p className="room-tile__note">Loading</p>;
  if (!levels.length) return <p className="room-tile__note">{list.mine ? "Nothing in it yet. Use a level's menu on the board to add it here." : "Nothing in this list yet."}</p>;
  return (
    <ol className="lvl-list-items">
      {levels.map((l) => (
        <li key={l.id}>
          <span className="lvl-list-items__name"><b>{l.title}</b> <span className="lvq-code">{l.code}</span></span>
          <span className="lvl-list-items__acts">
            <IconAction label={`Copy ${l.code}`} icon={IconCopy} onClick={() => void copyLevelCode(l, "list", toast)} />
            {list.mine && viewer.signedIn && <IconAction label={`Take ${l.title} out of the list`} icon={IconX} onClick={() => void takeOut(l)} />}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function LevelLists({ game, viewer, onMine }: {
  game: LevelGame;
  viewer: BoardExtras["viewer"];
  /** The viewer's lists changed (new, renamed, deleted), for "Add to a list". */
  onMine: (lists: { id: string; title: string; count: number }[]) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const g = LEVEL_GAMES[game];
  const [lists, setLists] = useState<LevelListView[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<LevelListView | null>(null);
  const [title, setTitle] = useState("");
  const [pub, setPub] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proWall, setProWall] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/levels/lists?game=${game}`, { cache: "no-store" }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { lists?: LevelListView[] } | null;
    const all = d?.lists ?? [];
    setLists(all);
    onMine(all.filter((l) => l.mine).map((l) => ({ id: l.id, title: l.title, count: l.count })));
  }, [game, onMine]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const update = (id: string, change: Partial<LevelListView>) => setLists((ls) => (ls ?? []).map((l) => (l.id === id ? { ...l, ...change } : l)));
  const act = async (l: LevelListView, body: Record<string, unknown>, done: string, change?: Partial<LevelListView>) => {
    const r = await patch(l.id, body);
    const d = (await r?.json().catch(() => null)) as { line?: string } | null;
    if (!r?.ok) { toast.error(d?.line ?? "That didn't go through. Try again."); return; }
    if (change) update(l.id, change);
    toast.success(done);
  };
  const del = async (l: LevelListView) => {
    if (!(await confirm({ title: `Delete ${l.title}?`, body: "The list goes for good. The levels stay on the board.", confirmLabel: "Delete the list" }))) return;
    const r = await fetch(`/api/levels/lists/${l.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { toast.error("That didn't go through. Try again."); return; }
    toast.success("List deleted");
    void load();
  };
  const queue = async (l: LevelListView) => {
    const r = await fetch(`/api/levels/lists/${l.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue" }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { queued?: { added: number; held: number; refused: { why: string }[] }; error?: string } | null;
    if (d?.error === "pro_required") { setProWall(true); return; }
    if (!r?.ok || !d?.queued) { toast.error("That didn't go through. Try again."); return; }
    track(EVENTS.levelListQueued, { game, added: d.queued.added });
    toast.success(queuedLine(d.queued));
  };
  const save = async () => {
    setBusy(true);
    if (renaming) {
      const r = await patch(renaming.id, { action: "rename", title });
      const d = (await r?.json().catch(() => null)) as { line?: string } | null;
      setBusy(false);
      if (!r?.ok) { toast.error(d?.line ?? "That didn't go through. Try again."); return; }
      if (renaming.public !== pub) await patch(renaming.id, { action: "public", public: pub });
      setRenaming(null);
      toast.success("List saved");
      void load();
      return;
    }
    const r = await fetch("/api/levels/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, title, public: pub }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { line?: string } | null;
    setBusy(false);
    if (!r?.ok) { toast.error(d?.line ?? "That didn't go through. Try again."); return; }
    track(EVENTS.levelListMade, { game });
    setMaking(false);
    toast.success("List made. Add levels from their menu on the board.");
    void load();
  };
  const startMake = () => { setTitle(""); setPub(true); setMaking(true); };
  const startRename = (l: LevelListView) => { setTitle(l.title); setPub(l.public); setRenaming(l); };

  return (
    <div className="lvl-lists">
      {viewer.signedIn && <div><Button variant="secondary" size="small" onClick={startMake} aria-haspopup="dialog">Make a list</Button></div>}
      {lists === null ? <p className="room-tile__note">Loading</p> : lists.length === 0 ? (
        <GhostRows count={3} places={false} notice={<p>No {g.name} lists yet. <b>Make one</b> of up to {LIST_MAX} {itemWord(game)}s: your favorites, a challenge night, a streamer&apos;s set.</p>} />
      ) : (
        <ul className="lvl-lists__list">
          {lists.map((l) => {
            const open = openId === l.id;
            const menu = [
              ...(viewer.signedIn && g.kind === "level" ? [{ label: "Queue this list", onClick: () => void queue(l) }] : []),
              ...(l.mine ? [{ label: "Rename or change who sees it", onClick: () => startRename(l) }] : []),
              ...(viewer.staff && l.public ? [{ label: l.featured ? "Stop featuring it" : "Feature it", onClick: () => void act(l, { action: "feature", on: !l.featured }, l.featured ? "No longer featured" : "Featured", { featured: !l.featured }) }] : []),
              ...(l.mine || viewer.staff ? [{ type: "divider" as const }, { label: "Delete the list", danger: true, onClick: () => void del(l) }] : []),
            ];
            return (
              <li key={l.id} className="lvl-lists__item">
                <div className="lvl-lists__head">
                  <div className="lvl-lists__who">
                    <h3 className="lvl-row__title">{l.title}</h3>
                    <p className="lvl-row__line">
                      {l.by.username ? <Link href={`/u/${l.by.username}`}>{l.by.name}</Link> : l.by.name} · {l.count} {l.count === 1 ? itemWord(game) : `${itemWord(game)}s`}
                    </p>
                    {(l.featured || !l.public) && (
                      <p className="lvl-row__badges">
                        {l.featured && <Badge variant="info" size="small">Featured</Badge>}
                        {!l.public && <Badge variant="default" size="small">Only you</Badge>}
                      </p>
                    )}
                  </div>
                  <div className="lvl-row__acts">
                    <Button size="small" variant="secondary" aria-expanded={open} aria-controls={`lvl-list-${l.id}`} onClick={() => setOpenId(open ? null : l.id)}>{open ? "Close" : "Open"}</Button>
                    {menu.length > 0 && <AdminRowMenu label={`More for ${l.title}`} items={menu} />}
                  </div>
                </div>
                {open && <div id={`lvl-list-${l.id}`}><ListLevels list={l} viewer={viewer} onCount={(n) => update(l.id, { count: n })} /></div>}
              </li>
            );
          })}
        </ul>
      )}
      <ProWallModal isOpen={proWall} onClose={() => setProWall(false)} heading="Add to your queue" title="The level queue is part of GS Pro" from="level-queue">
        <p>Chat sends {itemWord(game)}s in with a command, you play them in order on stream, and the board keeps what you played.</p>
      </ProWallModal>
      <Modal isOpen={making || !!renaming} onClose={() => { setMaking(false); setRenaming(null); }} title={renaming ? "Your list" : "Make a list"} size="small"
        footer={<div className="lvl-share__foot">
          <Button variant="ghost" onClick={() => { setMaking(false); setRenaming(null); }}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !title.trim()}>{renaming ? "Save" : "Make it"}</Button>
        </div>}>
        <div className="lvl-share__body">
          <Input floatingLabel="List name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIST_TITLE_MAX} fullWidth />
          <Switch label="Anyone can see it" checked={pub} onChange={(e) => setPub(e.target.checked)} />
          <p className="lvl-share__note">Up to {LIST_MAX} {itemWord(game)}s. Add them from each one&apos;s menu on the board.</p>
        </div>
      </Modal>
    </div>
  );
}
