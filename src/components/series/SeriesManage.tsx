"use client";

/**
 * Running a team series (staff and admins): Setup, Teams, Nights, Draft, Predictions and Wrap-up, in
 * CascadeDS Tabs with the tab in the address. Everything goes through POST /api/admin/series/[id]; the
 * screen reloads after each change. Setup saves itself (useAutosave); the rest are buttons, since each one
 * does something on the page right away.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Chip, Input, Modal, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, Textarea } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { Select } from "@/components/ui/Select";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { SortableList } from "@/components/ui/SortableList";
import { AdminField, AdminHeader, AdminPanel, AdminSection, AdminTable, SaveStatus } from "@/components/account/admin/AdminKit";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { ROLE_LABEL, TEAM_COLORS, type PlayerRole, type SeriesStatus } from "@/lib/series/rules";
import { seriesTracks } from "@/lib/series/tracks";
import type { NightView, SeriesSettings, SeriesView } from "@/lib/series/view";
import { DraftBoard } from "./SeriesDraftBoard";
import { TeamTag, When } from "./SeriesBits";

interface TeamRaw { id: string; n: number; name: string; tag: string; color: string; look: string | null }
interface PlayerRaw { id: string; team_id: string; user_id: string | null; name: string; role: PlayerRole; hours: number | null; pov: "none" | "sent" | "checked"; pov_note: string | null; reminded_at: string | null; giftUntil: string | null }
interface NightRaw { id: string; n: number; label: string; starts_at: string | null; tournament_id: string | null; host_team_id: string | null; counts: boolean; tournament: { id: string; title: string; status: string } | null }
interface ManageData {
  series: { id: string; slug: string; title: string; tagline: string | null; status: SeriesStatus; championTeamId: string | null; crownedAt: string | null; settings: SeriesSettings; path: string };
  teams: TeamRaw[];
  players: PlayerRaw[];
  nights: NightRaw[];
  view: SeriesView | null;
}

const STAGES: { value: SeriesStatus; label: string }[] = [
  { value: "draft", label: "Draft (staff only)" },
  { value: "announced", label: "Announced (public page)" },
  { value: "live", label: "Live (event week)" },
  { value: "finished", label: "Finished (alumni)" },
];
const COLOR_NAMES = ["Blue", "Purple", "Red", "Pink", "Gold", "Green", "Teal", "Orange"];

/** datetime-local value (the browser's zone) ↔ ISO. */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const dayIn = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

async function fetchManage(id: string): Promise<ManageData | null> {
  const res = await fetch(`/api/admin/series/${id}`, { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as ManageData | null) : null;
}

export function SeriesManage({ id, initialTab }: { id: string; initialTab: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<ManageData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(initialTab);

  const load = useCallback(async () => {
    const d = await fetchManage(id);
    if (d) setData(d); else setFailed(true);
  }, [id]);
  useEffect(() => {
    let alive = true;
    fetchManage(id).then((d) => { if (!alive) return; if (d) setData(d); else setFailed(true); });
    return () => { alive = false; };
  }, [id]);
  // While a draft runs or a night is live, keep the console fresh.
  const busy = !!data?.view?.nights.some((n) => n.state === "live" || n.draft?.status === "running" || n.draft?.status === "paused");
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 3000);
    return () => window.clearInterval(t);
  }, [busy, load]);

  const act = useCallback(async (body: Record<string, unknown>, done?: string): Promise<Record<string, unknown> | null> => {
    const res = await fetch(`/api/admin/series/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res?.ok || !j?.ok) { toast.error((j?.error as string) ?? "Couldn't do that. Try again."); await load(); return null; }
    if (done) toast.success(done);
    await load();
    return j;
  }, [id, load, toast]);

  const select = (t: string) => {
    setTab(t);
    const sp = new URLSearchParams(window.location.search);
    if (t === "setup") sp.delete("tab"); else sp.set("tab", t);
    const q = sp.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };

  if (failed) return <p role="alert">Couldn&rsquo;t load this series. Reload the page.</p>;
  if (!data) return <p className="ss-muted">Loading the series…</p>;
  const { series } = data;

  const tabs = [
    { id: "setup", label: "Setup", content: <SetupTab data={data} act={act} /> },
    { id: "teams", label: "Teams", content: <TeamsTab data={data} act={act} confirm={confirm} /> },
    { id: "nights", label: "Nights", content: <NightsTab data={data} act={act} confirm={confirm} /> },
    { id: "draft", label: "Draft", content: <DraftTab data={data} act={act} confirm={confirm} reload={load} /> },
    { id: "predictions", label: "Predictions", content: <PredictionsTab data={data} act={act} confirm={confirm} /> },
    { id: "wrap", label: "Wrap-up", content: <WrapTab data={data} act={act} confirm={confirm} /> },
  ];

  return (
    <div className="account-card admin-screen ss-manage">
      <AdminHeader
        title={series.title}
        intro="Staff only. The public page updates as you go."
        actions={<ArrowLink href={series.path}>Open the page</ArrowLink>}
      />
      <div className="ss-manage__stage">
        <AdminField label="Stage" helper="Announced makes the page public. Live turns on the overlay piece and predictions.">
          {(fid, desc) => (
            <Select id={fid} aria-describedby={desc} value={series.status} options={STAGES} onChange={(v) => { const s = Array.isArray(v) ? v[0] : v; if (s && s !== series.status) void act({ action: "update", status: s }, "Stage saved"); }} />
          )}
        </AdminField>
      </div>
      <Tabs tabs={tabs} variant="underline" activeTab={tabs.some((t) => t.id === tab) ? tab : "setup"} onChange={select} />
    </div>
  );
}

type Act = (body: Record<string, unknown>, done?: string) => Promise<Record<string, unknown> | null>;
type Confirm = ReturnType<typeof useConfirm>;

// ── Setup ─────────────────────────────────────────────────────────────────────────────────────────

const CUPS = (() => {
  const out: { cup: string; ids: string[]; bcp: boolean }[] = [];
  seriesTracks().forEach((t, i) => {
    const last = out[out.length - 1];
    if (last && last.cup === t.cup) last.ids.push(t.id);
    else out.push({ cup: t.cup, ids: [t.id], bcp: i >= 48 });
  });
  return out;
})();

function SetupTab({ data, act }: { data: ManageData; act: Act }) {
  const s = data.series;
  const [form, setForm] = useState(() => ({
    title: s.title, tagline: s.tagline ?? "", rules: s.settings.rules, faq: s.settings.faq,
    discordUrl: s.settings.discordUrl ?? "", povGuideUrl: s.settings.povGuideUrl ?? "", povDueAt: s.settings.povDueAt ? s.settings.povDueAt.slice(0, 10) : "",
    bank: s.settings.bank, target: s.settings.target, turnSeconds: s.settings.turnSeconds,
    lineCompetitive: s.settings.lines.competitive == null ? "" : String(s.settings.lines.competitive),
    lineCreator: s.settings.lines.creator == null ? "" : String(s.settings.lines.creator),
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const { status } = useAutosave(form, async (f) => {
    const r = await act({
      action: "update", title: f.title, tagline: f.tagline || null,
      settings: {
        rules: f.rules, faq: f.faq.filter((x) => x.q.trim() && x.a.trim()), discordUrl: f.discordUrl || null, povGuideUrl: f.povGuideUrl || null,
        povDueAt: f.povDueAt ? new Date(`${f.povDueAt}T12:00:00`).toISOString() : null, bank: f.bank, target: Number(f.target), turnSeconds: Number(f.turnSeconds),
        lines: { competitive: f.lineCompetitive === "" ? null : Number(f.lineCompetitive), creator: f.lineCreator === "" ? null : Number(f.lineCreator) },
      },
    });
    return !!r;
  }, { toast: false });
  const [slug, setSlug] = useState(s.slug);
  const bank = new Set(form.bank);
  const toggleCup = (ids: string[], on: boolean) => set("bank", seriesTracks().map((t) => t.id).filter((x) => (ids.includes(x) ? on : bank.has(x))));

  return (
    <div className="ss-manage__tab">
      <p className="ss-manage__save"><SaveStatus status={status} /></p>
      <AdminSection title="The page">
        <div className="ss-form">
          <AdminField label="Name">{(fid) => <Input id={fid} value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} />}</AdminField>
          <AdminField label="One line under the name">{(fid) => <Input id={fid} value={form.tagline} maxLength={200} onChange={(e) => set("tagline", e.target.value)} />}</AdminField>
          <AdminField label="Address" helper={`gameshuffle.co${s.slug === "summer-series" ? "/summer-series" : `/series/${slug}`}. Lowercase letters, numbers and dashes.`}>
            {(fid, desc) => (
              <div className="ss-inline">
                <Input id={fid} aria-describedby={desc} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
                <Button variant="secondary" disabled={slug === s.slug} onClick={() => act({ action: "update", slug }, "Address changed")}>Change address</Button>
              </div>
            )}
          </AdminField>
          <AdminField label="Discord link for questions">{(fid) => <Input id={fid} type="url" placeholder="https://discord.gg/…" value={form.discordUrl} onChange={(e) => set("discordUrl", e.target.value)} />}</AdminField>
        </div>
      </AdminSection>
      <AdminSection title="Rules" intro="Shown on the Rules tab. Leave a blank line between paragraphs.">
        <AdminField label="Rules">{(fid) => <Textarea id={fid} rows={10} value={form.rules} onChange={(e) => set("rules", e.target.value)} fullWidth />}</AdminField>
      </AdminSection>
      <AdminSection title="FAQ" actions={<Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => set("faq", [...form.faq, { q: "", a: "" }])}>Add a question</Button>}>
        <ol className="ss-faqedit">
          {form.faq.map((f, i) => (
            <li key={i}>
              <AdminField label={`Question ${i + 1}`}>{(fid) => <Input id={fid} value={f.q} onChange={(e) => set("faq", form.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />}</AdminField>
              <AdminField label="Answer">{(fid) => <Textarea id={fid} rows={3} value={f.a} onChange={(e) => set("faq", form.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} fullWidth />}</AdminField>
              <Button variant="ghost" size="small" iconBefore={IconTrash} onClick={() => set("faq", form.faq.filter((_, j) => j !== i))}>Remove</Button>
            </li>
          ))}
        </ol>
      </AdminSection>
      <AdminSection title="Track draft" intro="The bank teams draft from, how many tracks the pool ends with, and each turn's clock. A night's draft copies these when it's set up.">
        <div className="ss-form ss-form--row">
          <AdminField label="Tracks left at the end">{(fid) => <Input id={fid} type="number" min={1} max={95} value={String(form.target)} onChange={(e) => set("target", Number(e.target.value))} />}</AdminField>
          <AdminField label="Seconds a turn">{(fid) => <Input id={fid} type="number" min={15} max={600} value={String(form.turnSeconds)} onChange={(e) => set("turnSeconds", Number(e.target.value))} />}</AdminField>
        </div>
        <p className="ss-muted ss-small">{form.bank.length} tracks in the bank: {Math.max(0, form.bank.length - form.target)} turns, {data.teams.length ? `${(Math.max(0, form.bank.length - form.target) / data.teams.length).toFixed(1).replace(/\.0$/, "")} a team` : "add teams to see turns per team"}.</p>
        <div className="ss-bank">
          {[false, true].map((bcp) => (
            <fieldset key={String(bcp)} className="ss-bank__group">
              <legend>{bcp ? "Booster Course Pass" : "Base game"}</legend>
              {CUPS.filter((c) => c.bcp === bcp).map((c) => (
                <Checkbox key={c.cup} label={`${c.cup} Cup`} checked={c.ids.every((x) => bank.has(x))} onChange={(e) => toggleCup(c.ids, e.target.checked)} />
              ))}
            </fieldset>
          ))}
        </div>
      </AdminSection>
      <AdminSection title="Predictions" intro="Over or under lines for each role's points. Leave empty to work one out from the scoring table.">
        <div className="ss-form ss-form--row">
          <AdminField label="Competitive players' line">{(fid) => <Input id={fid} type="number" step={0.5} value={form.lineCompetitive} onChange={(e) => set("lineCompetitive", e.target.value)} />}</AdminField>
          <AdminField label="Creators' line">{(fid) => <Input id={fid} type="number" step={0.5} value={form.lineCreator} onChange={(e) => set("lineCreator", e.target.value)} />}</AdminField>
        </div>
      </AdminSection>
      <AdminSection title="POV videos" intro="Each player records their POV for the series video and uploads it outside GameShuffle.">
        <div className="ss-form ss-form--row">
          <AdminField label="Recording guide link">{(fid) => <Input id={fid} type="url" value={form.povGuideUrl} onChange={(e) => set("povGuideUrl", e.target.value)} />}</AdminField>
          <AdminField label="Due by">{(fid) => <Input id={fid} type="date" value={form.povDueAt} onChange={(e) => set("povDueAt", e.target.value)} />}</AdminField>
        </div>
      </AdminSection>
    </div>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────────────────────────

function TeamModal({ team, onClose, act, used }: { team: TeamRaw | "new"; onClose: () => void; act: Act; used: number }) {
  const isNew = team === "new";
  const [name, setName] = useState(isNew ? "" : team.name);
  const [tag, setTag] = useState(isNew ? "" : team.tag);
  const [look, setLook] = useState(isNew ? "" : team.look ?? "");
  const [color, setColor] = useState(isNew ? TEAM_COLORS[used % TEAM_COLORS.length] : team.color);
  const save = async () => { if (await act({ action: "team.save", id: isNew ? undefined : team.id, name, tag, look, color }, isNew ? "Team added" : "Team saved")) onClose(); };
  return (
    <Modal isOpen onClose={onClose} title={isNew ? "Add a team" : `Edit ${team.name}`} primaryAction={{ label: isNew ? "Add team" : "Save", onClick: save }} secondaryAction={{ label: "Cancel", onClick: onClose }}>
      <div className="ss-form">
        <AdminField label="Team name">{(fid) => <Input id={fid} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</AdminField>
        <AdminField label="Tag" helper="One to four letters, shown at the start of the players' names.">{(fid, d) => <Input id={fid} aria-describedby={d} value={tag} maxLength={4} onChange={(e) => setTag(e.target.value.toUpperCase())} />}</AdminField>
        <AdminField label="Color">{(fid) => <Select id={fid} value={color} options={TEAM_COLORS.map((c, i) => ({ value: c, label: COLOR_NAMES[i] }))} onChange={(v) => setColor(Array.isArray(v) ? v[0] : v)} />}</AdminField>
        <AdminField label="How they race" helper="Their color and character, like Blue Yoshis.">{(fid, d) => <Input id={fid} aria-describedby={d} value={look} maxLength={60} onChange={(e) => setLook(e.target.value)} />}</AdminField>
      </div>
    </Modal>
  );
}

function PlayerModal({ player, teams, teamId, onClose, act }: { player: PlayerRaw | "new"; teams: TeamRaw[]; teamId: string; onClose: () => void; act: Act }) {
  const isNew = player === "new";
  const [team, setTeam] = useState(isNew ? teamId : player.team_id);
  const [role, setRole] = useState<PlayerRole>(isNew ? "competitive" : player.role);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState(isNew ? "" : player.name);
  const [hours, setHours] = useState(isNew || player.hours == null ? "" : String(player.hours));
  const save = async () => {
    if (await act({ action: "player.save", id: isNew ? undefined : player.id, teamId: team, role, handle: handle || null, name: name || null, hours: hours === "" ? null : Number(hours) }, isNew ? "Player added" : "Player saved")) onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={isNew ? "Add a player" : `Edit ${player.name}`} primaryAction={{ label: isNew ? "Add player" : "Save", onClick: save }} secondaryAction={{ label: "Cancel", onClick: onClose }}>
      <div className="ss-form">
        <AdminField label={isNew ? "GameShuffle username or Twitch name" : "Change their account (username or Twitch name)"} helper="Their card fills in from their account.">{(fid, d) => <Input id={fid} aria-describedby={d} value={handle} placeholder="@username" onChange={(e) => setHandle(e.target.value)} />}</AdminField>
        <AdminField label="Name on the page" helper={isNew ? "Leave empty to use their display name. Someone without an account needs a name here." : undefined}>{(fid, d) => <Input id={fid} aria-describedby={d} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</AdminField>
        <AdminField label="Team">{(fid) => <Select id={fid} value={team} options={teams.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setTeam(Array.isArray(v) ? v[0] : v)} />}</AdminField>
        <AdminField label="Role">{(fid) => <Select id={fid} value={role} options={[{ value: "competitive", label: "Competitive" }, { value: "creator", label: "Creator" }]} onChange={(v) => setRole((Array.isArray(v) ? v[0] : v) as PlayerRole)} />}</AdminField>
        <AdminField label="Hours played (their count)">{(fid) => <Input id={fid} type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />}</AdminField>
      </div>
    </Modal>
  );
}

function TeamsTab({ data, act, confirm }: { data: ManageData; act: Act; confirm: Confirm }) {
  const toast = useToast();
  const [teamEdit, setTeamEdit] = useState<TeamRaw | "new" | null>(null);
  const [playerEdit, setPlayerEdit] = useState<{ player: PlayerRaw | "new"; teamId: string } | null>(null);
  const [until, setUntil] = useState(dayIn(30));
  const view = data.view;
  const giftCount = data.players.filter((p) => p.giftUntil).length;
  return (
    <div className="ss-manage__tab">
      <AdminSection title="Teams" actions={<Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setTeamEdit("new")} disabled={data.teams.length >= 12}>Add a team</Button>}>
        {!data.teams.length && <p className="ss-muted">No teams yet.</p>}
        <div className="ss-manage__teams">
          {data.teams.map((t) => {
            const players = data.players.filter((p) => p.team_id === t.id);
            const vt = view?.teams.find((x) => x.id === t.id);
            return (
              <AdminPanel key={t.id} className="ss-manage__team">
                <div className="ss-manage__teamhead">
                  {vt && <TeamTag team={vt} />}
                  <b>{t.name}</b>
                  <span className="ss-muted ss-small">{t.look}</span>
                  <span className="ss-manage__teamacts">
                    <Button variant="ghost" size="small" onClick={() => setTeamEdit(t)}>Edit</Button>
                    <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: `Remove ${t.name}?`, body: "Its players come off the series too.", confirmLabel: "Remove team" })) void act({ action: "team.remove", teamId: t.id }, "Team removed"); }}>Remove</Button>
                  </span>
                </div>
                <ul className="ss-manage__players">
                  {players.map((p) => (
                    <li key={p.id}>
                      <span><b>{p.name}</b> <Badge size="small" variant={p.role === "competitive" ? "info" : "warning"}>{ROLE_LABEL[p.role]}</Badge>{!p.user_id && <span className="ss-muted ss-small"> · no account</span>}{p.giftUntil && <span className="ss-muted ss-small"> · GS Pro to <When iso={p.giftUntil} /></span>}</span>
                      <span>
                        <Button variant="ghost" size="small" onClick={() => setPlayerEdit({ player: p, teamId: t.id })}>Edit</Button>
                        <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: `Take ${p.name} off the series?`, confirmLabel: "Remove player" })) void act({ action: "player.remove", playerId: p.id }, "Player removed"); }}>Remove</Button>
                      </span>
                    </li>
                  ))}
                </ul>
                {players.length < 2 && <Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setPlayerEdit({ player: "new", teamId: t.id })}>Add a player</Button>}
              </AdminPanel>
            );
          })}
        </div>
      </AdminSection>
      <AdminSection title="GS Pro for the players" intro="The Twitch tools need GS Pro. This gives every player with an account GS Pro until the date; it ends on its own. Players who already pay keep their plan.">
        <div className="ss-inline">
          <AdminField label="Until">{(fid) => <Input id={fid} type="date" value={until} min={dayIn(1)} onChange={(e) => setUntil(e.target.value)} />}</AdminField>
          <Button variant="secondary" onClick={async () => { const r = await act({ action: "gift", who: "players", until: new Date(`${until}T23:59:00`).toISOString() }); if (r) toast.success(`GS Pro given to ${r.given} ${r.given === 1 ? "player" : "players"}${r.skipped ? ` (${r.skipped} without an account)` : ""}`); }}>Give GS Pro</Button>
          {giftCount > 0 && <Button variant="ghost" onClick={async () => { if (await confirm({ title: "End the players' GS Pro now?", body: "Players without a plan of their own go back to Free.", confirmLabel: "End it" })) void act({ action: "gift.end", who: "players" }, "Ended"); }}>End it now</Button>}
        </div>
        <p className="ss-muted ss-small">{giftCount} of {data.players.length} players have GS Pro from GameShuffle.</p>
      </AdminSection>
      {teamEdit && <TeamModal team={teamEdit} used={data.teams.length} onClose={() => setTeamEdit(null)} act={act} />}
      {playerEdit && <PlayerModal player={playerEdit.player} teamId={playerEdit.teamId} teams={data.teams} onClose={() => setPlayerEdit(null)} act={act} />}
    </div>
  );
}

// ── Nights ────────────────────────────────────────────────────────────────────────────────────────

function NightRow({ n, data, act, confirm }: { n: NightRaw; data: ManageData; act: Act; confirm: Confirm }) {
  const [label, setLabel] = useState(n.label);
  const [when, setWhen] = useState(toLocal(n.starts_at));
  const v = data.view?.nights.find((x) => x.id === n.id);
  return (
    <AdminPanel className="ss-manage__night">
      <div className="ss-form ss-form--row">
        <AdminField label="Name">{(fid) => <Input id={fid} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== n.label && act({ action: "night.save", id: n.id, label }, "Saved")} />}</AdminField>
        <AdminField label="Starts (your time)">{(fid) => <Input id={fid} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} onBlur={() => fromLocal(when) !== n.starts_at && act({ action: "night.save", id: n.id, startsAt: fromLocal(when) }, "Saved")} />}</AdminField>
        <AdminField label="Hosting the room">{(fid) => <Select id={fid} value={n.host_team_id ?? ""} options={[{ value: "", label: "Not set" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(val) => act({ action: "night.save", id: n.id, hostTeamId: (Array.isArray(val) ? val[0] : val) || null }, "Saved")} />}</AdminField>
      </div>
      <Switch label="Counts toward the champions" checked={n.counts} onChange={(e) => act({ action: "night.save", id: n.id, counts: e.target.checked }, "Saved")} />
      <div className="ss-inline">
        {n.tournament ? (
          <>
            <ArrowLink href={`/tournament/${n.tournament.id}/manage`}>Enter races on the tournament</ArrowLink>
            <span className="ss-muted ss-small">{v ? `${v.racesDone} of ${v.racesTotal} races in` : ""}</span>
            <Button variant="ghost" size="small" onClick={() => act({ action: "night.sync", nightId: n.id }, "Players brought up to date")}>Add new players to it</Button>
          </>
        ) : (
          <Button variant="secondary" size="small" onClick={() => act({ action: "night.tournament", nightId: n.id }, "Tournament made")} disabled={data.teams.length < 2}>Make the tournament</Button>
        )}
        {!n.tournament && <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: `Remove the ${n.label}?`, confirmLabel: "Remove night" })) void act({ action: "night.remove", nightId: n.id }, "Night removed"); }}>Remove</Button>}
      </div>
    </AdminPanel>
  );
}

function NightsTab({ data, act, confirm }: { data: ManageData; act: Act; confirm: Confirm }) {
  return (
    <div className="ss-manage__tab">
      <AdminSection title="Nights" intro="Each night is an official GameShuffle tournament: a points race of 12 in teams of two, with every player already in on their team. Enter each race's places on the tournament's manage page; the series page, overlays and predictions follow." actions={<Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => act({ action: "night.save", label: `Night ${data.nights.length + 1}` }, "Night added")}>Add a night</Button>}>
        {data.nights.map((n) => <NightRow key={`${n.id}-${n.label}-${n.starts_at}`} n={n} data={data} act={act} confirm={confirm} />)}
      </AdminSection>
    </div>
  );
}

// ── Draft ─────────────────────────────────────────────────────────────────────────────────────────

function DraftTab({ data, act, confirm, reload }: { data: ManageData; act: Act; confirm: Confirm; reload: () => void }) {
  const view = data.view;
  const [nightId, setNightId] = useState<string | null>(null);
  const nights = view?.nights ?? [];
  const night: NightView | null = nights.find((n) => n.id === nightId) ?? nights.find((n) => n.draft?.status === "running" || n.draft?.status === "paused") ?? nights.find((n) => n.state !== "done") ?? nights[0] ?? null;
  const [order, setOrder] = useState<string[] | null>(null);
  const d = night?.draft ?? null;
  const shownOrder = order ?? d?.order ?? [];
  const teamOf = (tid: string) => view?.teams.find((t) => t.id === tid) ?? null;
  const fromNights = nights.filter((n) => n.id !== night?.id && n.racesDone > 0);
  if (!view || !night) return <div className="ss-manage__tab"><p className="ss-muted">Add a night first.</p></div>;
  const run = (action: string, done: string, extra: Record<string, unknown> = {}) => act({ action, nightId: night.id, ...extra }, done).then(() => setOrder(null));

  return (
    <div className="ss-manage__tab">
      {nights.length > 1 && (
        <div className="ss-nightpick" role="group" aria-label="Which night's draft">
          {nights.map((n) => <Chip key={n.id} label={n.label} clickable selected={n.id === night.id} onClick={() => { setNightId(n.id); setOrder(null); }} />)}
        </div>
      )}
      <AdminSection title={`${night.label} draft`} intro={!d ? "Set it up to copy the bank, pool size and clock from Setup." : d.status === "setup" ? "Set the order: roll it on stream, take it from another night's results (last place first), or drag it. Then start." : d.status === "done" ? "Done. The pool is on the page's Tracks tab." : "Running. The team on the clock picks on their phone; you can lock in for them below."}>
        <div className="ss-inline">
          {!d && <Button variant="primary" onClick={() => run("draft.setup", "Draft set up")}>Set up the draft</Button>}
          {d?.status === "setup" && (
            <>
              <Button variant="secondary" onClick={() => run("draft.roll", "Order rolled")}>Roll the order</Button>
              {fromNights.map((n) => <Button key={n.id} variant="secondary" onClick={() => run("draft.fromNight", "Order set", { fromNightId: n.id })}>Order from the {n.label}</Button>)}
              <Button variant="primary" onClick={() => run("draft.start", "Draft started")} disabled={shownOrder.length !== view.teams.length}>Start the draft</Button>
              <Button variant="ghost" onClick={() => run("draft.setup", "Set up again")}>Copy Setup again</Button>
            </>
          )}
          {d?.status === "running" && <Button variant="secondary" onClick={() => run("draft.pause", "Paused")}>Pause</Button>}
          {d?.status === "paused" && <Button variant="primary" onClick={() => run("draft.resume", "Back on")}>Resume</Button>}
          {d && d.turns.length > 0 && <Button variant="secondary" onClick={async () => { if (await confirm({ title: "Take back the last turn?", body: "That team goes back on the clock with a full clock.", confirmLabel: "Take it back" })) void run("draft.undo", "Last turn taken back"); }}>Undo last turn</Button>}
          {d && d.status !== "setup" && <Button variant="ghost" onClick={async () => { if (await confirm({ title: "Reset the draft?", body: "Every turn is cleared. The order stays.", confirmLabel: "Reset" })) void run("draft.reset", "Draft reset"); }}>Reset</Button>}
        </div>
        {d?.status === "setup" && shownOrder.length > 0 && (
          <SortableList
            items={shownOrder}
            getId={(x) => x}
            handleLabel={(x) => `Move ${teamOf(x)?.name ?? "team"}`}
            onReorder={(next) => { setOrder(next); void act({ action: "draft.order", nightId: night.id, order: next }, "Order saved"); }}
            className="ss-manage__order"
          >
            {(tid, handle, i) => {
              const t = teamOf(tid);
              return <div className="ss-manage__orderrow">{handle}<span className="ss-num">{i + 1}</span>{t && <TeamTag team={t} size="sm" />}<span>{t?.name}</span></div>;
            }}
          </SortableList>
        )}
      </AdminSection>
      {d && <DraftBoard slug={data.series.slug} night={night} teams={view.teams} myTeamId={null} staff skew={0} onChanged={reload} />}
    </div>
  );
}

// ── Predictions ───────────────────────────────────────────────────────────────────────────────────

function PredictionsTab({ data, act, confirm }: { data: ManageData; act: Act; confirm: Confirm }) {
  const view = data.view;
  if (!view) return null;
  return (
    <div className="ss-manage__tab">
      <p className="ss-muted">Each night has one set of predictions, shown on every player&rsquo;s live page and the event page. They lock when the first race goes in and pay out when the last does. On GameShuffle it&rsquo;s &ldquo;predict&rdquo;, never &ldquo;bet&rdquo;.</p>
      {view.nights.map((n) => {
        const list = view.predictions.filter((p) => p.nightId === n.id);
        const open = list.filter((p) => p.status === "open").length, locked = list.filter((p) => p.status === "locked").length;
        const pot = list.reduce((s, p) => s + p.pot, 0);
        return (
          <AdminSection key={n.id} title={n.label} intro={list.length ? `${list.length} predictions · ${open} open · ${locked} locked · ${pot.toLocaleString("en-US")} tokens in` : "None yet."}>
            <div className="ss-inline">
              <Button variant={list.length ? "secondary" : "primary"} onClick={() => act({ action: "predictions.open", nightId: n.id }, "Predictions made")}>{list.length ? "Add any that are missing" : "Open predictions"}</Button>
              {open > 0 && <Button variant="secondary" onClick={() => act({ action: "predictions.lock", nightId: n.id }, "Locked")}>Lock now</Button>}
              {locked > 0 && n.racesDone === 0 && <Button variant="secondary" onClick={() => act({ action: "predictions.reopen", nightId: n.id }, "Open again")}>Open again</Button>}
              {open + locked > 0 && <Button variant="ghost" onClick={async () => { if (await confirm({ title: `Cancel the ${n.label}'s predictions?`, body: "Every token goes back to whoever put it in.", confirmLabel: "Cancel predictions" })) void act({ action: "predictions.cancel", nightId: n.id }, "Cancelled, tokens back"); }}>Cancel and give tokens back</Button>}
            </div>
            {list.length > 0 && (
              <AdminTable label={`${n.label} predictions`}>
                <Table>
                  <TableHeader><TableRow><TableHead>Question</TableHead><TableHead>Status</TableHead><TableHead align="right">Tokens</TableHead><TableHead align="right">People</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {list.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.question}</TableCell>
                        <TableCell>{p.status === "settled" ? `Settled: ${(p.result ?? []).map((k) => p.options.find((o) => o.key === k)?.label ?? k).join(", ")}` : p.status === "open" ? "Open" : p.status === "locked" ? "Locked" : "Cancelled"}</TableCell>
                        <TableCell align="right" className="ss-num">{p.pot.toLocaleString("en-US")}</TableCell>
                        <TableCell align="right" className="ss-num">{p.picks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AdminTable>
            )}
          </AdminSection>
        );
      })}
    </div>
  );
}

// ── Wrap-up ───────────────────────────────────────────────────────────────────────────────────────

function WrapTab({ data, act, confirm }: { data: ManageData; act: Act; confirm: Confirm }) {
  const toast = useToast();
  const view = data.view;
  const leader = view?.awards.leader ?? null;
  const [champ, setChamp] = useState(data.series.championTeamId ?? leader ?? "");
  const [champUntil, setChampUntil] = useState(dayIn(365));
  const [clip, setClip] = useState({ title: "", url: "", playerId: "" });
  const playerName = (pid: string | null) => data.players.find((p) => p.id === pid)?.name ?? null;
  const champTeam = data.teams.find((t) => t.id === data.series.championTeamId);
  const povLeft = data.players.filter((p) => p.pov === "none").length;
  const plays = useMemo(() => view?.plays ?? [], [view]);
  return (
    <div className="ss-manage__tab">
      <AdminSection title="Champions" intro={leader ? `The results point to ${data.teams.find((t) => t.id === leader)?.name}.` : "Once every counted night is done, the results point to a team here (unless two share first)."}>
        <div className="ss-inline">
          <AdminField label="Champions">{(fid) => <Select id={fid} value={champ} options={[{ value: "", label: "Pick a team" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => setChamp(Array.isArray(v) ? v[0] : v)} />}</AdminField>
          <Button variant="primary" disabled={!champ || champ === data.series.championTeamId} onClick={() => act({ action: "crown", teamId: champ }, "Champions crowned")}>Crown them</Button>
          {data.series.championTeamId && <Button variant="ghost" onClick={async () => { if (await confirm({ title: "Take the title back?", confirmLabel: "Take it back" })) void act({ action: "crown", teamId: null }, "Title taken back"); }}>Take it back</Button>}
        </div>
        {champTeam && (
          <div className="ss-inline">
            <AdminField label={`GS Pro for ${champTeam.name} until`}>{(fid) => <Input id={fid} type="date" value={champUntil} onChange={(e) => setChampUntil(e.target.value)} />}</AdminField>
            <Button variant="secondary" onClick={() => act({ action: "gift", who: "champions", until: new Date(`${champUntil}T23:59:00`).toISOString() }, "GS Pro given")}>Give the champions GS Pro</Button>
          </div>
        )}
      </AdminSection>
      <AdminSection title="Best play" intro="Up to 12 clips. Viewers vote on the page, one vote per account.">
        <div className="ss-form ss-form--row">
          <AdminField label="Title">{(fid) => <Input id={fid} value={clip.title} maxLength={80} onChange={(e) => setClip({ ...clip, title: e.target.value })} />}</AdminField>
          <AdminField label="Clip link">{(fid) => <Input id={fid} type="url" placeholder="https://clips.twitch.tv/…" value={clip.url} onChange={(e) => setClip({ ...clip, url: e.target.value })} />}</AdminField>
          <AdminField label="Player">{(fid) => <Select id={fid} value={clip.playerId} options={[{ value: "", label: "Nobody in particular" }, ...data.players.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => setClip({ ...clip, playerId: Array.isArray(v) ? v[0] : v })} />}</AdminField>
        </div>
        <div><Button variant="secondary" onClick={async () => { if (await act({ action: "play.add", title: clip.title, url: clip.url, playerId: clip.playerId || null }, "Clip added")) setClip({ title: "", url: "", playerId: "" }); }}>Add the clip</Button></div>
        {plays.length > 0 && (
          <ul className="ss-plays">
            {plays.map((p) => (
              <li key={p.id} className="ss-play">
                <div><ArrowLink href={p.url} external>{p.title}</ArrowLink><span className="ss-muted ss-small">{playerName(p.playerId) ? `${playerName(p.playerId)} · ` : ""}{p.votes} votes</span></div>
                <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: `Remove "${p.title}"?`, body: "Its votes go too.", confirmLabel: "Remove clip" })) void act({ action: "play.remove", playId: p.id }, "Clip removed"); }}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
      <AdminSection title="POV recordings" intro={`${povLeft} of ${data.players.length} still to hand in.`} actions={<Button variant="secondary" size="small" disabled={!povLeft} onClick={async () => { const r = await act({ action: "pov.remind" }); if (r) toast.success(r.sent ? `Reminded ${r.sent}` : "Nobody to remind right now (each player gets one a day at most)"); }}>Remind the rest</Button>}>
        <AdminTable label="POV recordings">
          <Table>
            <TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Recording</TableHead><TableHead>Reminded</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.players.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <Select aria-label={`${p.name}'s recording`} value={p.pov} options={[{ value: "none", label: "Not yet" }, { value: "sent", label: "They sent it" }, { value: "checked", label: "We have it" }]} onChange={(v) => act({ action: "pov.set", playerId: p.id, pov: Array.isArray(v) ? v[0] : v }, "Saved")} />
                  </TableCell>
                  <TableCell>{p.reminded_at ? <When iso={p.reminded_at} /> : <span className="ss-muted">No</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      </AdminSection>
      <p className="ss-small"><Link href={data.series.path}>See the page as viewers do</Link></p>
    </div>
  );
}
