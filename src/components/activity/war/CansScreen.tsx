"use client";

/**
 * The War room's Cans tab (cans picks 2026-11-04, 11A): the team's week (how many players can usually race each
 * hour, in this device's time zone, with the best time and Post a can check for it) and your own usual hours (tap
 * the hours you can usually race; saved as you go). Times are kept as UTC half-hours, so a team spread over time
 * zones adds up (src/lib/cans/rules.ts). Reads /api/activity/cans with the Activity session.
 *
 * The hour grid is plain pressed/not-pressed buttons: CascadeDS has no toggle grid (on the CDS fix list, as Stream
 * Bingo's pattern editor).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Chip, Input, Select } from "@empac/cascadeds";
import { IconSend } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { LOCAL_DAYS, TZ_CHOICES, bestHours, hourLabel, hourShort, isTimeZone, localGrid, localPicks, nextLocal } from "@/lib/cans/rules";

type Auth = (init?: RequestInit) => RequestInit;
interface View { teams: { roleId: string; tag: string | null; name: string }[]; team: string | null; mine: number[]; players: { name: string; slots: number[]; you: boolean }[]; canPost: boolean }

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const POST_ERRORS: Record<string, string> = {
  no_channel: "Open the War room in a server channel to post there.",
  no_access: "GameShuffle Competitive can't post in this channel. Give it Send Messages here.",
  bad_time: "That time has gone. Pick another.",
  slow_down: "Slow down a moment, then try again.",
};
const deviceZone = () => {
  try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return isTimeZone(z) ? z : "America/Los_Angeles"; } catch { return "America/Los_Angeles"; }
};
const noop = () => () => {};
const zoneName = (tz: string) => TZ_CHOICES.find((z) => z.value === tz)?.label ?? tz.replace(/_/g, " ");

export function CansScreen({ auth }: { auth: Auth }) {
  const toast = useToast();
  // This device's time zone (read after hydration), unless the viewer picks another.
  const device = useSyncExternalStore(noop, deviceZone, () => "America/Los_Angeles");
  const [picked, setTz] = useState<string | null>(null);
  const tz = picked ?? device;
  const [team, setTeam] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"team" | "mine">("team");
  const [mine, setMine] = useState<Set<string> | null>(null);
  const [vs, setVs] = useState("");
  const [posting, setPosting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/activity/cans${team ? `?team=${team}` : ""}`, auth({ cache: "no-store" })).catch(() => null);
    if (!res) { setError("unavailable"); return; }
    const data = await res.json().catch(() => null);
    if (!res.ok) { setError(data?.error ?? "unavailable"); return; }
    setError(null);
    setView(data as View);
  }, [auth, team]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  // Start the grid at 5 PM, where wars are.
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = 17 * 40 - 40; }, [view, mode]);

  const others = useMemo(() => (view ? view.players.filter((p) => !p.you).map((p) => p.slots) : []), [view]);
  const minePicks = useMemo(() => mine ?? new Set((view ? localPicks(view.mine, tz) : []).map((p) => `${p.day}:${p.hour}`)), [mine, view, tz]);
  // The team's week counts your own hours as you change them.
  const grid = useMemo(() => {
    const g = localGrid(others, tz);
    for (const k of minePicks) { const [d, h] = k.split(":").map(Number); g[d][h]++; }
    return g;
  }, [others, minePicks, tz]);
  const best = bestHours(grid, 1)[0] ?? null;
  const players = (view?.players.filter((p) => !p.you && p.slots.length).length ?? 0) + (minePicks.size ? 1 : 0);
  const top = Math.max(1, ...grid.flat());

  const payload = useMemo(() => (mine && view?.team ? { team: view.team, tz, picks: [...mine].map((k) => { const [day, hour] = k.split(":").map(Number); return { day, hour }; }) } : null), [mine, view, tz]);
  const { status } = useAutosave(payload, async (v) => {
    if (!v) return true;
    const res = await fetch("/api/activity/cans", auth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hours", ...v }) })).catch(() => null);
    return !!res?.ok;
  });

  const toggle = (day: number, hour: number) => {
    const next = new Set(minePicks);
    const k = `${day}:${hour}`;
    if (next.has(k)) next.delete(k); else next.add(k);
    setMine(next);
  };

  const post = async () => {
    if (!best || !view?.team) return;
    setPosting(true);
    const at = nextLocal(best.day, best.hour, tz);
    const res = await fetch("/api/activity/cans", auth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "post", team: view.team, at: at.toISOString(), vs: vs.trim() || undefined }) })).catch(() => null);
    setPosting(false);
    const data = await res?.json().catch(() => null);
    if (res?.ok) { toast.success("Posted in this channel. Everyone answers on the post."); setVs(""); }
    else toast.error(POST_ERRORS[data?.error] ?? "Couldn't post it. Try again in a moment.");
  };

  if (error === "no_server") return <section className="wr-panel"><p className="wr-note">Cans work in a server: open the War room from a server channel.</p></section>;
  if (error === "not_ready") return <section className="wr-panel"><p className="wr-note">Cans aren&apos;t open yet. Try again soon.</p></section>;
  if (error) return <section className="wr-panel"><p className="wr-note">Couldn&apos;t load the team&apos;s hours.</p><div><Button variant="secondary" onClick={() => void load()}>Try again</Button></div></section>;
  if (!view) return <section className="wr-panel"><p className="wr-muted">Loading…</p></section>;
  if (!view.teams.length) {
    return (
      <section className="wr-panel" aria-labelledby="wr-cans">
        <h1 id="wr-cans" className="wr-h">Cans</h1>
        <p className="wr-note">No teams are set up here yet. Someone who manages the server runs <b>/cans setup</b> with the team&apos;s role, then everyone marks their usual hours here.</p>
      </section>
    );
  }

  const zoneOpts = [...(TZ_CHOICES.some((z) => z.value === device) ? [] : [{ value: device, label: zoneName(device) }]), ...TZ_CHOICES];
  return (
    <section className="wr-panel wr-cans" aria-labelledby="wr-cans">
      <h1 id="wr-cans" className="sr-only">Cans</h1>
      <div className="wr-cans__bar">
        {view.teams.length > 1 && (
          <div className="wr-field">
            <label htmlFor="wr-cans-team">Team</label>
            <Select id="wr-cans-team" value={view.team ?? ""} onChange={(v) => { setTeam(String(v)); setMine(null); }} options={view.teams.map((t) => ({ value: t.roleId, label: t.name }))} fullWidth />
          </div>
        )}
        <div className="wr-field">
          <label htmlFor="wr-cans-tz">Times in</label>
          <Select id="wr-cans-tz" value={tz} onChange={(v) => setTz(String(v))} options={zoneOpts.map((z) => ({ value: z.value, label: z.value === device ? `${z.label} (this device)` : z.label }))} fullWidth />
        </div>
      </div>

      <div className="wr-cans__modes" role="group" aria-label="Show">
        <Chip label="The team's week" clickable selected={mode === "team"} onClick={() => setMode("team")} />
        <Chip label="My usual hours" clickable selected={mode === "mine"} onClick={() => setMode("mine")} />
        {mode === "mine" && <span className="wr-help" role="status">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Tap the hours you can usually race."}</span>}
      </div>

      <div className="wr-cans__scroll" ref={scroller} tabIndex={0} role="region" aria-label={mode === "team" ? "How many can race each hour" : "Your usual hours"}>
        <table className="wr-cans__grid">
          <thead><tr><th scope="col"><span className="sr-only">Day</span></th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col">{hourShort(h)}</th>)}</tr></thead>
          <tbody>
            {grid.map((rowCounts, d) => (
              <tr key={d}>
                <th scope="row">{LOCAL_DAYS[d]}</th>
                {rowCounts.map((n, h) => {
                  if (mode === "mine") {
                    const on = minePicks.has(`${d}:${h}`);
                    return <td key={h}><button type="button" className={`wr-cans__cell wr-cans__cell--pick${on ? " is-on" : ""}`} aria-pressed={on} aria-label={`${DAY_NAMES[d]} ${hourLabel(h)}`} onClick={() => toggle(d, h)} /></td>;
                  }
                  const isBest = !!best && best.day === d && best.hour === h;
                  return (
                    <td key={h}>
                      {/* The table's day and hour headers say which hour; the cell says how many. */}
                      <span className={`wr-cans__cell${n ? "" : " wr-cans__cell--zero"}${isBest ? " is-best" : ""}`} style={{ ["--n" as string]: String(n / top) }}>{n || <span className="sr-only">0</span>}{isBest && <span className="sr-only"> (best)</span>}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === "team" && (
        players ? (
          <div className="wr-cans__best">
            {best ? <p className="wr-note"><b>Best this week:</b> {DAY_NAMES[best.day]} {hourLabel(best.hour)}, {best.count} of {players} can.</p> : <p className="wr-note">Nobody shares an hour yet.</p>}
            {best && view.canPost && (
              <form className="wr-cans__post" onSubmit={(e) => { e.preventDefault(); void post(); }}>
                <div className="wr-field">
                  <label htmlFor="wr-cans-vs">Against (optional)</label>
                  <Input id="wr-cans-vs" value={vs} onChange={(e) => setVs(e.target.value)} maxLength={12} placeholder="Their tag" />
                </div>
                <Button type="submit" variant="primary" iconBefore={IconSend} loading={posting}>{`Post a can check for ${LOCAL_DAYS[best.day]} ${hourLabel(best.hour)}`}</Button>
              </form>
            )}
            <p className="wr-help">{players} {players === 1 ? "player has" : "players have"} marked their hours. Each person sees this week in their own time zone.</p>
          </div>
        ) : (
          <p className="wr-note">Nobody has marked their hours yet. Pick My usual hours and tap the hours you can usually race.</p>
        )
      )}
    </section>
  );
}
