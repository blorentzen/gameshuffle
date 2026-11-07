"use client";

/**
 * Review access for one person (picks 2026-11-05, 2A): Reviewer and/or Updater in one window, the updater's modes
 * ticked under it. Opened from a player's page (Review access) and the review page's Team tab. Staff and admins give
 * anything; reviewers give and take away updater modes only (the Reviewer box is locked for them). Saving tells the
 * person what they now check (a notification and an email).
 */

import { useEffect, useState } from "react";
import { Button, Checkbox, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { Granter, TeamPerson } from "@/lib/timeTrials/team";
import type { Mode } from "@/lib/timeTrials/updaters";
import { TT_GAMES, TT_GAME_ORDER } from "@/lib/timeTrials/tracks";
import { ITEMS } from "@/lib/timeTrials/categories";

const MODES: Mode[] = TT_GAME_ORDER.flatMap((game) => ITEMS.map((i) => ({ game, items: i.id })));
const key = (m: Mode) => `${m.game}|${m.items}`;
const modeName = (m: Mode) => `${TT_GAMES[m.game].label}, ${ITEMS.find((i) => i.id === m.items)!.label.toLowerCase()}`;

const ERRORS: Record<string, string> = {
  not_allowed: "Only staff and time trial reviewers can change access.",
  self: "You can't change your own access.",
  no_user: "That account wasn't found.",
  staff: "Staff and admins check everything already.",
  staff_only: "Only staff can make someone a reviewer.",
  not_ready: "Updaters need a database update first.",
};

type Loaded = { person: TeamPerson; granter: Granter; self: boolean };

/** Render it only while open (`{open && <TtAccessWindow … />}`), so each opening starts fresh. */
export function TtAccessWindow({ userId, name, onClose, onSaved }: {
  userId: string;
  /** Shown while the window loads. */
  name: string;
  onClose: () => void;
  onSaved?: (p: TeamPerson) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [reviewer, setReviewer] = useState(false);
  const [updater, setUpdater] = useState(false);
  const [modes, setModes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    void fetch(`/api/time-trials/review?access=${encodeURIComponent(userId)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((j: (Loaded & { ok?: boolean }) | null) => {
      if (!live) return;
      if (!j?.ok) { setFailed(true); return; }
      setData(j);
      setReviewer(j.person.reviewer);
      setUpdater(j.person.modes.length > 0);
      setModes(new Set(j.person.modes.map(key)));
    });
    return () => { live = false; };
  }, [userId]);

  const person = data?.person;
  const locked = !data || data.self || person!.staff;
  const picked = updater ? MODES.filter((m) => modes.has(key(m))) : [];
  const changed = !!person && (reviewer !== person.reviewer || picked.map(key).join() !== person.modes.map(key).join());
  const toggle = (m: Mode, on: boolean) => setModes((s) => { const n = new Set(s); if (on) n.add(key(m)); else n.delete(key(m)); return n; });

  async function save() {
    if (!person) return;
    setSaving(true);
    const j = (await fetch("/api/time-trials/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "access", userId: person.userId, reviewer, modes: picked }) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; error?: string; person?: TeamPerson; changed?: boolean };
    setSaving(false);
    if (!j.ok || !j.person) { toast.error(ERRORS[j.error ?? ""] ?? "That didn't save. Try again."); return; }
    toast.success(j.changed ? `Saved. ${j.person.name} was told what they check.` : "Nothing changed.");
    onSaved?.(j.person);
    onClose();
  }

  const title = `Review access for ${person?.name ?? name}`;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="small"
      className="tt-access"
      footer={locked ? <Button variant="secondary" onClick={onClose}>Close</Button> : (
        <div className="tt-access__actions">
          <Button variant="primary" loading={saving} disabled={!changed || (updater && picked.length === 0)} onClick={() => void save()}>Save</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      )}
    >
      {failed ? <p className="tt-note">That account couldn&apos;t be loaded.</p>
        : !data ? <p className="tt-note" role="status">Loading…</p>
        : data.self ? <p className="tt-note">You can&apos;t change your own access.</p>
        : person!.staff ? <p className="tt-note">{person!.name} is staff, so they check everything already.</p>
        : (
          <div className="tt-access__body">
            <Checkbox
              label="Reviewer"
              helperText={data.granter === "staff" ? "Checks everything: clips, reports, name claims and imported proof, every game." : "Checks everything. Only staff can make reviewers."}
              checked={reviewer}
              disabled={data.granter !== "staff"}
              onChange={(e) => setReviewer(e.target.checked)}
            />
            <Checkbox
              label="Updater"
              helperText="Checks one game and items, and gets that list every Monday."
              checked={updater}
              onChange={(e) => setUpdater(e.target.checked)}
            />
            {updater && (
              <fieldset className="tt-access__modes">
                <legend className="sr-only">Modes {person!.name} checks</legend>
                {MODES.map((m) => (
                  <Checkbox
                    key={key(m)}
                    label={modeName(m)}
                    helperText={m.game === "mk8dx" && m.items === "shrooms" ? "Also settles name claims" : undefined}
                    checked={modes.has(key(m))}
                    onChange={(e) => toggle(m, e.target.checked)}
                  />
                ))}
                {picked.length === 0 && <p className="tt-muted">Tick at least one.</p>}
              </fieldset>
            )}
            <p className="tt-muted">Saving sends {person!.name} a notification and an email saying what they check.</p>
          </div>
        )}
    </Modal>
  );
}
