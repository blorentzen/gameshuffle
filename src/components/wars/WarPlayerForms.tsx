"use client";

/**
 * A team's players on the Teams page (overrides picks 2026-11-09): add them one at a time or paste a list
 * ("Jalen = peep/Sxyd [us]", one a line), or change one player's line. In-game name → the name and flag war tables
 * show; anything left out stays as the game shows it. For a team linked to MKCentral, a player there without a line
 * gets one tied to them (`preset`): their in-game name, with MKCentral's name and country filled in to change.
 */

import { useRef, useState } from "react";
import { Alert, Button, Input, Modal, Tabs, Textarea } from "@empac/cascadeds";
import { AdminField } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { readRosterLines } from "@/lib/wars/cards";
import { cleanFlagText, type TeamPlayerView, type TeamView, type TeamsView } from "@/lib/wars/teamView";
import { errorText, teamsApi, type WithView } from "./teamsApi";

const FLAG_HELP = "A country code like us or gb, or one of this server's /flag codes. Optional.";
const SHOWN_HELP = "Leave it blank to show the in-game name.";
const ERRORS: Record<string, string> = {
  no_name: "Type the player's in-game name.",
  bad_name: "Type the player's in-game name.",
  bad_flag: "That isn't a flag code. Use letters like us, or gb_eng for England.",
  no_lines: "No players found. Put one player on each line.",
};

const teamLabel = (t: TeamView) => t.name ?? t.tags[0];
const counted = (added: number, changed: number) => [added && `${added} added`, changed && `${changed} changed`].filter(Boolean).join(", ") || "Nothing new to add";

/** An MKCentral player to give a line: their MKCentral name, and the name and flag tables would show for them now. */
export interface PlayerPreset { mkcPlayerId: number; name: string; shown: string; flag: string | null }

export function WarAddPlayers({ guild, team, preset, onClose, onView }: { guild: string; team: TeamView; preset?: PlayerPreset; onClose: () => void; onView: (v: TeamsView | null) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState("one");
  const [ingame, setIngame] = useState("");
  const [shown, setShown] = useState(preset?.shown ?? "");
  const [flag, setFlag] = useState(preset?.flag ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  const read = readRosterLines(text);
  const flagBad = !!flag.trim() && !cleanFlagText(flag);

  const addOne = async () => {
    setError(null);
    if (!ingame.trim()) { setError(ERRORS.no_name); return; }
    if (flagBad) { setError(ERRORS.bad_flag); return; }
    setBusy(true);
    const res = await teamsApi<WithView & { added: number; changed: number }>("/api/war/teams/players", "POST", { guild, teamId: team.id, ingame, shown, flag, ...(preset ? { mkcPlayerId: preset.mkcPlayerId } : {}) });
    setBusy(false);
    if (!res.ok) { setError(errorText(res.error, ERRORS)); return; }
    onView(res.data.view);
    toast.success(res.data.added ? `${ingame.trim()} added to ${teamLabel(team)}` : res.data.changed ? `${ingame.trim()} changed` : `${ingame.trim()} is already listed that way`);
    if (preset) { onClose(); return; }
    // Ready for the next player.
    setIngame(""); setShown(""); setFlag("");
    first.current?.focus();
  };

  const addList = async () => {
    setError(null);
    if (!read.length) { setError(ERRORS.no_lines); return; }
    setBusy(true);
    const res = await teamsApi<WithView & { added: number; changed: number }>("/api/war/teams/players", "POST", { guild, teamId: team.id, text });
    setBusy(false);
    if (!res.ok) { setError(errorText(res.error, ERRORS)); return; }
    onView(res.data.view);
    toast.success(`${teamLabel(team)}: ${counted(res.data.added, res.data.changed)}`);
    onClose();
  };

  const one = (
    <form className="admin-form wt-form wt-form--tab" onSubmit={(e) => { e.preventDefault(); void addOne(); }}>
      <AdminField label="In-game name" helper="As the results screen shows it.">
        {(id, d) => <Input ref={first} id={id} aria-describedby={d} value={ingame} onChange={(e) => setIngame(e.target.value)} maxLength={32} placeholder={preset ? undefined : "Jalen"} fullWidth autoComplete="off" />}
      </AdminField>
      <AdminField label="Name on tables" helper={preset ? "From MKCentral. Change it if you like; blank shows the in-game name." : SHOWN_HELP}>
        {(id, d) => <Input id={id} aria-describedby={d} value={shown} onChange={(e) => setShown(e.target.value)} maxLength={32} placeholder="peep/Sxyd" fullWidth autoComplete="off" />}
      </AdminField>
      <AdminField label="Flag" helper={preset ? `From MKCentral. ${FLAG_HELP}` : FLAG_HELP} error={flagBad ? ERRORS.bad_flag : null}>
        {(id, d) => <Input id={id} aria-describedby={d} value={flag} onChange={(e) => setFlag(e.target.value)} maxLength={16} placeholder="us" variant={flagBad ? "error" : "default"} aria-invalid={flagBad || undefined} autoComplete="off" />}
      </AdminField>
      <div><Button type="submit" variant="primary" loading={busy} disabled={busy}>{preset ? "Add to the list" : "Add player"}</Button></div>
    </form>
  );

  if (preset) {
    return (
      <Modal
        isOpen
        onClose={busy ? () => {} : onClose}
        title={`Add ${preset.name}'s in-game name`}
        size="medium"
        footer={<div className="admin-chatbot-modal-actions"><Button variant="tertiary" onClick={onClose} disabled={busy}>Cancel</Button></div>}
      >
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
        <p className="wt-form__intro">{preset.name} is on {teamLabel(team)}&apos;s MKCentral team. Type the name the results screen shows for them, and this server&apos;s tables show the name and flag below for it.</p>
        {one}
      </Modal>
    );
  }

  const list = (
    <form className="admin-form wt-form wt-form--tab" onSubmit={(e) => { e.preventDefault(); void addList(); }}>
      <AdminField label="Players, one a line" helper="The in-game name, then = and the name for tables, then a flag code in brackets. Leave out any part you don't need.">
        {(id, d) => <Textarea id={id} aria-describedby={d} value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={4000} placeholder={"Jalen = peep/Sxyd [us]\nnsn [jp]\nRiley = Ri"} fullWidth spellCheck={false} />}
      </AdminField>
      <p className="wt-count" aria-live="polite">{text.trim() ? (read.length === 1 ? "1 player read" : `${read.length} players read`) : ""}</p>
      <div><Button type="submit" variant="primary" loading={busy} disabled={busy || !read.length}>{read.length > 1 ? `Add ${read.length} players` : "Add player"}</Button></div>
    </form>
  );

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={`Add players to ${teamLabel(team)}`}
      size="medium"
      footer={<div className="admin-chatbot-modal-actions"><Button variant="tertiary" onClick={onClose} disabled={busy}>Done</Button></div>}
    >
      {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
      <Tabs
        className="wt-tabs"
        variant="underline"
        activeTab={tab}
        onChange={(t) => { setTab(t); setError(null); }}
        tabs={[{ id: "one", label: "One player", content: one }, { id: "list", label: "Paste a list", content: list }]}
      />
    </Modal>
  );
}

export function WarEditPlayer({ guild, team, player, onClose, onView }: { guild: string; team: TeamView; player: TeamPlayerView; onClose: () => void; onView: (v: TeamsView | null) => void }) {
  const toast = useToast();
  const [ingame, setIngame] = useState(player.ingame);
  const [shown, setShown] = useState(player.line.shown ?? "");
  const [flag, setFlag] = useState(player.line.flag ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flagBad = !!flag.trim() && !cleanFlagText(flag);

  const save = async () => {
    setError(null);
    if (!ingame.trim()) { setError(ERRORS.bad_name); return; }
    if (flagBad) { setError(ERRORS.bad_flag); return; }
    setBusy(true);
    const res = await teamsApi<WithView>("/api/war/teams/players", "PATCH", { guild, id: player.id, ingame, shown, flag });
    setBusy(false);
    if (!res.ok) { setError(errorText(res.error, { ...ERRORS, taken: `${teamLabel(team)} already lists ${ingame.trim()}.` })); return; }
    onView(res.data.view);
    toast.success(`${ingame.trim()} saved`);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={`Edit ${player.ingame}`}
      size="small"
      footer={
        <div className="admin-chatbot-modal-actions">
          <Button variant="tertiary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={busy}>Save player</Button>
        </div>
      }
    >
      <form className="admin-form wt-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
        {player.setBy === "themselves" && <p className="admin-field__help">{player.ingame} set up their own card. Fill in a name or flag here and this server&apos;s tables show your line instead of their card; leave both blank to use their card.</p>}
        <AdminField label="In-game name">
          {(id) => <Input id={id} value={ingame} onChange={(e) => setIngame(e.target.value)} maxLength={32} fullWidth autoComplete="off" />}
        </AdminField>
        <AdminField label="Name on tables" helper={SHOWN_HELP}>
          {(id, d) => <Input id={id} aria-describedby={d} value={shown} onChange={(e) => setShown(e.target.value)} maxLength={32} fullWidth autoComplete="off" />}
        </AdminField>
        <AdminField label="Flag" helper={FLAG_HELP} error={flagBad ? ERRORS.bad_flag : null}>
          {(id, d) => <Input id={id} aria-describedby={d} value={flag} onChange={(e) => setFlag(e.target.value)} maxLength={16} variant={flagBad ? "error" : "default"} aria-invalid={flagBad || undefined} autoComplete="off" />}
        </AdminField>
      </form>
    </Modal>
  );
}
