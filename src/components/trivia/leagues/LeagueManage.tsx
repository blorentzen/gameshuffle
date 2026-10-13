"use client";

/**
 * The host's league page (screens 7 and 8 of the approved mockups): a status
 * bar, then Nights (start tonight's night, results, Undo points, print kit,
 * copy standings), Teams (rename, merge, change captain, remove) and Settings
 * (autosaved). Laid out like the tournament manage page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Modal, Tabs, Textarea } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { AdminRowMenu } from "@/components/account/admin/AdminKit";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { LEAGUE_TEAM_SIZES, LEAGUE_WEEKS, scoringLine } from "@/lib/trivia/leagueRules";
import { TEMPLATES } from "@/lib/trivia/rules";
import type { ManageView } from "@/lib/trivia/leagues";

type Tab = "nights" | "teams" | "settings";
type TeamRow = ManageView["manageTeams"][number];

const ERRORS: Record<string, string> = {
  season_over: "The season is over.",
  name_taken: "Another team already has that name.",
  bad_name: "Team names need at least 2 characters.",
  blocked: "That name can't be used.",
  weeks_played: "The season can't be shorter than the weeks already played.",
  not_in_crew: "Pick someone on the team's crew.",
  same_team: "Pick a different team to merge into.",
};

function fmt(iso: string | null, tz: string | null, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz ?? undefined, ...opts }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso)); }
}

export function LeagueManage({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<ManageView | null>(null);
  const [tab, setTab] = useState<Tab>("nights");
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<{ team: TeamRow; name: string } | null>(null);
  const [merge, setMerge] = useState<{ team: TeamRow; into: string } | null>(null);
  const [captain, setCaptain] = useState<{ team: TeamRow; userId: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/trivia/leagues/${leagueId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setView(d.view as ManageView);
  }, [leagueId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const patch = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    const d = await fetch(`/api/trivia/leagues/${leagueId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "That didn't work. Try again."); return null; }
    void load();
    return d as Record<string, unknown>;
  };

  const startNight = async () => {
    const d = await patch({ action: "start_night" });
    if (d?.gameId) router.push(`/trivia/host/${d.gameId as string}`);
  };

  const undo = async (gameId: string, week: number) => {
    if (!(await confirm({ title: `Take week ${week}'s league points out?`, body: "Its places stop counting in the standings and the week counts as not played. The night's own scores stay.", confirmLabel: "Undo points" }))) return;
    if (await patch({ action: "undo_night", gameId })) toast.success("League points taken out.");
  };

  const remove = async (team: TeamRow) => {
    if (!(await confirm({ title: `Remove ${team.name} from the league?`, body: team.nights ? `Its ${team.nights} night${team.nights === 1 ? "" : "s"} of points come out of the standings too. This can't be undone.` : "It hasn't played a night yet.", confirmLabel: "Remove the team" }))) return;
    if (await patch({ action: "remove", teamId: team.id })) toast.success(`${team.name} removed.`);
  };

  const copyStandings = async () => {
    if (!view) return;
    const lines = [`${view.title} · standings${view.weeksPlayed ? ` after week ${view.weeksPlayed}` : ""}`, ...view.teams.filter((t) => t.nights > 0).map((t) => `${t.rank}. ${t.name} · ${t.points}`), `${window.location.origin}/trivia/leagues/${view.slug}`];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast.success("Copied. Paste it in Discord."); } catch { toast.error("Couldn't copy."); }
  };

  // Settings autosave.
  const [form, setForm] = useState<{ title: string; description: string; weeks: number; teamSize: number; scoring: "place" | "total"; bestOf: number; template: string } | null>(null);
  const [formFor, setFormFor] = useState<string | null>(null);
  if (view && formFor !== view.id) {
    setFormFor(view.id);
    setForm({ title: view.title, description: view.description ?? "", weeks: view.settings.weeks, teamSize: view.settings.teamSize, scoring: view.settings.scoring, bestOf: view.settings.bestOf, template: view.settings.template });
  }
  useAutosave(form, async (f) => {
    if (!f) return false;
    const d = await fetch(`/api/trivia/leagues/${leagueId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", settings: f }) }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't save that."); return false; }
    void load();
    return true;
  }, { ready: !!form });

  const minWeeks = useMemo(() => view?.weeksPlayed ?? 0, [view]);

  if (!view || !form) return <div className="trivia-card"><LoadingLines label="Loading" /></div>;

  const tz = view.next?.timezone ?? null;
  const live = view.nights.find((n) => n.status === "live" || n.status === "draft");
  const tabs: { id: Tab; label: string }[] = [{ id: "nights", label: "Nights" }, { id: "teams", label: `Teams (${view.manageTeams.length})` }, { id: "settings", label: "Settings" }];
  const sheetTitle = encodeURIComponent(`${view.title} · Week ${live?.week ?? view.nextWeek ?? view.settings.weeks}`);

  return (
    <div className="league-manage">
      <div className="trivia-card league-manage__status">
        <div>
          <p className="trivia-label"><Link href="/trivia">Trivia nights</Link> › League</p>
          <h1 className="trivia-h2">{view.title}</h1>
          <div className="trivia-muted league-manage__meta">
            <Badge variant={view.status === "active" ? "warning" : "info"} size="small">{view.status === "active" ? `Week ${Math.min(view.weeksPlayed + 1, view.settings.weeks)} of ${view.settings.weeks}` : view.status === "archived" ? "Archived" : "Season over"}</Badge>{" "}
            {view.next ? `Next: ${fmt(view.next.startsAt, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${view.next.online ? "Online" : view.next.place}` : view.champion ? `Champion: ${view.champion}` : ""}
          </div>
        </div>
        <Link href={`/trivia/leagues/${view.slug}`}><Button variant="ghost" size="small">View page</Button></Link>
      </div>

      <div className="manage-tabs">
        <Tabs variant="underline" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: null }))} />
      </div>

      {tab === "nights" && (
        <div className="trivia-card league-nights">
          {view.nights.map((n) => {
            const isNext = n.status === "not_started" && n.week === view.nextWeek && view.status === "active";
            return (
              <div key={n.week} className="league-night">
                <div>
                  <p className="league-night__title">Week {n.week}{n.date ? ` · ${fmt(n.date, tz, { month: "short", day: "numeric" })}` : ""}</p>
                  <p className="trivia-muted">
                    {n.status === "done" ? `${n.teams} teams${n.winner ? ` · ${n.winner} won` : ""}${n.recorded ? " · points added" : " · no league teams played"}`
                      : n.status === "live" ? `Playing now · code ${n.code}`
                      : n.status === "draft" ? "Being built: open it to edit the rounds and open the room."
                      : isNext ? `${TEMPLATES.find((t) => t.id === view.settings.template)?.label ?? "Bar night"} template, filled from the question pack. Edit the rounds before you open the room.`
                      : "Not played yet"}
                  </p>
                </div>
                <div className="trivia-row">
                  {isNext && <Button variant="primary" size="small" disabled={busy || !!live} onClick={() => void startNight()}>Start tonight&apos;s night</Button>}
                  {(n.status === "live" || n.status === "draft") && n.gameId && <Link href={`/trivia/host/${n.gameId}`}><Button variant="primary" size="small">Open the night</Button></Link>}
                  {n.status === "done" && n.gameId && <Link href={`/trivia/host/${n.gameId}`}><Button variant="secondary" size="small">Results</Button></Link>}
                  {n.status === "done" && n.recorded && n.gameId && <Button variant="ghost" size="small" disabled={busy} onClick={() => void undo(n.gameId!, n.week)}>Undo points</Button>}
                </div>
              </div>
            );
          })}
          <div className="trivia-row league-nights__kit">
            <Link href={`/trivia/answer-sheet?title=${sheetTitle}${live?.code ? `&code=${live.code}` : ""}`}><Button variant="secondary" size="small">Print answer sheets</Button></Link>
            <Link href={`/trivia/leagues/${view.slug}/poster`}><Button variant="secondary" size="small">Print the poster</Button></Link>
            <Button variant="secondary" size="small" onClick={() => void copyStandings()}>Copy standings for Discord</Button>
          </div>
        </div>
      )}

      {tab === "teams" && (
        <div className="trivia-card">
          {view.manageTeams.length === 0 ? (
            <p className="trivia-muted">No teams yet. Captains enter from the league page, or at the door on the night.</p>
          ) : (
            <div className="trivia-league-final__scroll" tabIndex={0} role="region" aria-label="League teams">
              <table className="trivia-league-final__table">
                <thead><tr><th scope="col">Team</th><th scope="col">Captain</th><th scope="col">Crew</th><th scope="col">Nights</th><th scope="col">Points</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {view.manageTeams.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.captain ?? "None"}</td>
                      <td>{t.crew ? <Link href={`/c/${t.crew.slug}`}>Yes</Link> : "No"}</td>
                      <td>{t.nights}</td>
                      <td>{t.points}</td>
                      <td>
                        <AdminRowMenu label={`More for ${t.name}`} items={[
                          { label: "Rename", onClick: () => setRename({ team: t, name: t.name }) },
                          { label: "Merge into another team", onClick: () => setMerge({ team: t, into: view.manageTeams.find((x) => x.id !== t.id)?.id ?? "" }), disabled: view.manageTeams.length < 2 },
                          { label: "Change captain", onClick: () => setCaptain({ team: t, userId: t.captainId ?? t.members[0]?.id ?? "" }), disabled: t.members.length === 0 },
                          { type: "divider" },
                          { label: "Remove from the league", onClick: () => void remove(t) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="trivia-card trivia-form">
          <Input fullWidth floatingLabel="League name" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="trivia-form__row">
            <Select floatingLabel="Season" value={String(form.weeks)} onChange={(v) => { const w = Number(v); setForm({ ...form, weeks: w, bestOf: Math.min(form.bestOf, w) }); }} options={LEAGUE_WEEKS.filter((n) => n >= minWeeks).map((n) => ({ value: String(n), label: `${n} weeks` }))} />
            <Select floatingLabel="Team size" value={String(form.teamSize)} onChange={(v) => setForm({ ...form, teamSize: Number(v) })} options={LEAGUE_TEAM_SIZES.map((n) => ({ value: String(n), label: `Up to ${n}` }))} />
            <Select floatingLabel="Each night" value={form.scoring} onChange={(v) => setForm({ ...form, scoring: v === "total" ? "total" : "place" })} options={[{ value: "place", label: "Points by place" }, { value: "total", label: "Total score" }]} />
          </div>
          <div className="trivia-form__row">
            <Select floatingLabel="Nights that count" value={String(Math.min(form.bestOf, form.weeks))} onChange={(v) => setForm({ ...form, bestOf: Number(v) })} options={Array.from({ length: form.weeks }, (_, i) => form.weeks - i).map((n) => ({ value: String(n), label: n === form.weeks ? "Every night" : `Best ${n} of ${form.weeks}` }))} />
            <Select floatingLabel="Each night starts from" value={form.template} onChange={(v) => setForm({ ...form, template: String(v) })} options={TEMPLATES.map((t) => ({ value: t.id, label: `${t.label} template` }))} />
          </div>
          <p className="trivia-muted">{scoringLine({ ...view.settings, ...form })} Changing how nights score updates the standings straight away.</p>
          <Textarea fullWidth floatingLabel="About the league" value={form.description} maxLength={600} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <p className="trivia-muted">The weekly day, time and place come from the league&apos;s game night series. Change a single week on its game night page.</p>
          <div className="trivia-row">
            <Button variant="ghost" size="small" onClick={async () => {
              const archived = view.status !== "archived";
              if (archived && !(await confirm({ title: "Archive the league?", body: "It comes off lists and stops scheduling nights. The page stays up by link with its standings. You can bring it back.", confirmLabel: "Archive" }))) return;
              if (await patch({ action: "archive", archived })) toast.success(archived ? "League archived." : "League back.");
            }}>{view.status === "archived" ? "Bring the league back" : "Archive the league"}</Button>
          </div>
        </div>
      )}

      <Modal isOpen={!!rename} onClose={() => setRename(null)} title="Rename the team" footer={(
        <div className="trivia-row league-enter__foot">
          <Button variant="ghost" onClick={() => setRename(null)}>Cancel</Button>
          <Button variant="primary" disabled={busy || (rename?.name.trim().length ?? 0) < 2} onClick={async () => { if (rename && await patch({ action: "rename", teamId: rename.team.id, name: rename.name })) { toast.success("Renamed."); setRename(null); } }}>Rename</Button>
        </div>
      )}>
        {rename && <Input fullWidth floatingLabel="Team name" value={rename.name} maxLength={40} onChange={(e) => setRename({ ...rename, name: e.target.value })} />}
      </Modal>

      <Modal isOpen={!!merge} onClose={() => setMerge(null)} title={merge ? `Merge "${merge.team.name}" into another team?` : "Merge teams"} footer={(
        <div className="trivia-row league-enter__foot">
          <Button variant="ghost" onClick={() => setMerge(null)}>Cancel</Button>
          <Button variant="primary" disabled={busy || !merge?.into} onClick={async () => { if (merge && await patch({ action: "merge", fromId: merge.team.id, intoId: merge.into })) { toast.success("Teams merged."); setMerge(null); } }}>Merge teams</Button>
        </div>
      )}>
        {merge && (
          <div className="league-enter">
            <Select floatingLabel="Merge into" value={merge.into} onChange={(v) => setMerge({ ...merge, into: String(v) })} options={view.manageTeams.filter((t) => t.id !== merge.team.id).map((t) => ({ value: t.id, label: t.name }))} />
            <p className="trivia-muted">Its {merge.team.nights} night{merge.team.nights === 1 ? "" : "s"} move over. If both played the same night, the better result stays. This can&apos;t be undone.</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!captain} onClose={() => setCaptain(null)} title="Change captain" footer={(
        <div className="trivia-row league-enter__foot">
          <Button variant="ghost" onClick={() => setCaptain(null)}>Cancel</Button>
          <Button variant="primary" disabled={busy || !captain?.userId} onClick={async () => { if (captain && await patch({ action: "captain", teamId: captain.team.id, userId: captain.userId })) { toast.success("Captain changed."); setCaptain(null); } }}>Make captain</Button>
        </div>
      )}>
        {captain && (
          <div className="league-enter">
            <Select floatingLabel="New captain" value={captain.userId} onChange={(v) => setCaptain({ ...captain, userId: String(v) })} options={captain.team.members.map((m) => ({ value: m.id, label: m.name }))} />
            <p className="trivia-muted">Anyone on the team&apos;s crew. The captain enters the team and gets tonight&apos;s team link.</p>
          </div>
        )}
      </Modal>

      {view.teams.some((t) => t.nights > 0) && (
        <div className="trivia-card">
          <h2 className="trivia-h3">Standings</h2>
          <ol className="trivia-standings">
            {view.teams.filter((t) => t.nights > 0).map((t) => (
              <li key={t.id}><span className="trivia-standings__place">{t.rank}</span><span className="trivia-standings__name">{t.name}</span><span className="trivia-standings__score">{t.points}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
