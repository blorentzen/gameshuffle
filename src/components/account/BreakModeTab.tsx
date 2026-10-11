"use client";

/**
 * Break mode (GS Pro): start a break, watch it, end it, and set the lineup.
 * The same screen in Streaming ▸ Live games ▸ Break mode (between streams)
 * and the stream page's Live games tab. Chat does the same with !gs brb,
 * !gs back and !gs pull.
 *
 * The lineup and how the break screen shows save themselves (useAutosave);
 * starting and ending are buttons.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminPanel, AdminSection, SaveStatus } from "@/components/account/admin/AdminKit";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { BREAK_GAMES, BREAK_GAME_IDS, DEFAULT_LINEUP, type BreakGameId, type BreakView } from "@/lib/break/types";

interface Settings { lineup: BreakGameId[]; show: "panel" | "full"; championTokens: number }
interface Loaded { ready: boolean; pro: boolean; settings: Settings | null; view: BreakView | null }

/** The order games are listed and played in: the default lineup, then the extras (Stream Bingo). */
const ORDER: BreakGameId[] = [...DEFAULT_LINEUP, ...BREAK_GAME_IDS.filter((g) => !DEFAULT_LINEUP.includes(g))];

/** Games whose questions can be pulled (the luck games have nothing to pull). */
const PULLABLE = new Set<BreakGameId>([
  "higher-lower", "odd-one-out", "closest-guess", "fact-or-fiction", "scramble", "tier-war-live",
  "read-the-room", "zoomed-in", "emoji-puzzle", "trivia-rounds", "chat-brain",
]);
/** Matches CHAMPION_PRIZES in src/lib/break/store.ts. */
const PRIZES = [
  { value: "0", label: "No prize" },
  { value: "50", label: "50 tokens" },
  { value: "100", label: "100 tokens" },
  { value: "250", label: "250 tokens" },
  { value: "500", label: "500 tokens" },
  { value: "1000", label: "1,000 tokens" },
];
const LENGTHS = [
  { value: "0", label: "Until I'm back" },
  { value: "5", label: "About 5 minutes" },
  { value: "10", label: "About 10 minutes" },
  { value: "15", label: "About 15 minutes" },
  { value: "20", label: "About 20 minutes" },
  { value: "30", label: "About 30 minutes" },
];

function phaseLine(v: BreakView): string {
  if (v.endingRequested) return "Finishing this round, then you're back";
  const game = v.game?.name ?? "Break games";
  switch (v.phase) {
    case "intro": return `Up next: ${game}`;
    case "open": return `${game} · round ${v.gameRound} of ${v.gameRounds} · ${v.answering} answer${v.answering === 1 ? "" : "s"} in`;
    case "reveal": return `${game} · round ${v.gameRound} of ${v.gameRounds} · answer showing`;
    case "standings": return `Standings after ${game}`;
  }
}

export function BreakModeTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [minutes, setMinutes] = useState("0");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/break", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as Loaded) : null;
    if (!body) return;
    setData(body);
    setSettings((cur) => cur ?? body.settings);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load of server data, set when the fetch answers
  useEffect(() => { void load(); }, [load]);
  // Follow a running break.
  const running = data?.view?.status === "running";
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(iv);
  }, [running, load]);

  const { status } = useAutosave(settings, async (s) => {
    if (!s) return false;
    const res = await fetch("/api/break", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) }).catch(() => null);
    return !!res?.ok;
  }, { ready: !!settings });

  const start = async () => {
    if (!settings) return;
    setBusy("start");
    const res = await fetch("/api/break", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lineup: settings.lineup, minutes: Number(minutes) || null }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const err = ((await res?.json().catch(() => null)) as { error?: string } | null)?.error;
      toast.error(err === "already_running" ? "A break is already running." : "Couldn't start the break. Try again in a moment.");
      return;
    }
    toast.success("Break started. Chat's playing.");
    void load();
  };

  const act = async (action: "end" | "end_now" | "pull") => {
    if (action === "pull") {
      const ok = await confirm({ title: "Pull this question?", body: "It's skipped now and kept off every channel until staff review it.", confirmLabel: "Pull question" });
      if (!ok) return;
    }
    setBusy(action);
    const res = await fetch("/api/break", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { toast.error("That didn't go through. Try again."); return; }
    if (action === "pull") toast.success("Pulled. On to the next round.");
    void load();
  };

  if (!data) return <LoadingLines label="Loading break mode" />;
  if (!data.ready) {
    return <Alert variant="info" title="Break mode is almost here">It isn&apos;t switched on for GameShuffle yet. Check back soon.</Alert>;
  }
  if (!data.pro) {
    return (
      <ProTrialPrompt title="Break mode is part of GS Pro" from="break-mode">
        Step away and GameShuffle keeps chat playing: quick games on your overlay, points, and a break champion when you&apos;re back.
      </ProTrialPrompt>
    );
  }

  const view = data.view;
  const lineup = settings?.lineup ?? [];
  const toggle = (id: BreakGameId, on: boolean) => {
    if (!settings) return;
    const next = on ? ORDER.filter((g) => g === id || settings.lineup.includes(g)) : settings.lineup.filter((g) => g !== id);
    if (!next.length) { toast.warning("Keep at least one game in the lineup."); return; }
    setSettings({ ...settings, lineup: next });
  };

  return (
    <div className="break-tab">
      {running && view ? (
        <AdminSection title="On a break" intro={phaseLine(view)}>
          <AdminPanel className="break-tab__live">
            {view.round && <p className="break-tab__prompt">{view.round.prompt}</p>}
            {view.reveal && <p className="break-tab__reveal">{view.reveal.text}</p>}
            <div className="break-tab__stats">
              <span><b>{view.players}</b> scored so far</span>
              {view.handicap && <span>Chat&apos;s handicap: {view.handicap}</span>}
            </div>
            {view.leaders.length > 0 && (
              <ol className="break-tab__leaders" aria-label="This break's leaders">
                {view.leaders.map((l, i) => <li key={i}><span>{l.name}</span><b>{l.points}</b></li>)}
              </ol>
            )}
            <div className="break-tab__actions">
              <Button variant="primary" size="small" loading={busy === "end"} disabled={!!busy || view.endingRequested} onClick={() => void act("end")}>
                {view.endingRequested ? "Ending after this round" : "Finish the round and end"}
              </Button>
              <Button variant="secondary" size="small" loading={busy === "end_now"} disabled={!!busy} onClick={() => void act("end_now")}>End now</Button>
              {view.game && PULLABLE.has(view.game.id) && (view.phase === "open" || view.phase === "reveal") && (
                <Button variant="ghost" size="small" loading={busy === "pull"} disabled={!!busy} onClick={() => void act("pull")}>Pull this question</Button>
              )}
            </div>
          </AdminPanel>
        </AdminSection>
      ) : (
        <AdminSection title="Take a break" intro="GameShuffle runs your lineup on the overlay and chat plays by typing. Or type !gs brb in chat.">
          <div className="break-tab__start">
            <Select id="break-length" options={LENGTHS} value={minutes} onChange={(v) => setMinutes(String(v))} floatingLabel="How long" />
            <Button variant="primary" loading={busy === "start"} disabled={!!busy || !lineup.length} onClick={() => void start()}>Start break</Button>
          </div>
          <p className="break-tab__note">The length only sets &ldquo;back in about&hellip;&rdquo; on screen. The break keeps going until you type <code>!gs back</code> or end it here.</p>
        </AdminSection>
      )}

      <AdminSection title="Lineup" intro="Games play in this order and loop until you're back." actions={<SaveStatus status={status} />}>
        <ul className="break-tab__games">
          {ORDER.map((id) => (
            <li key={id}>
              <Checkbox
                id={`break-game-${id}`}
                checked={lineup.includes(id)}
                onChange={(e) => toggle(id, e.target.checked)}
                label={BREAK_GAMES[id].name}
                helperText={`${BREAK_GAMES[id].blurb} ${BREAK_GAMES[id].howTo}.`}
              />
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Break screen" intro="How the break looks on your overlay.">
        <Select
          id="break-show"
          options={[
            { value: "panel", label: "A piece you place on your own BRB scene" },
            { value: "full", label: "Full screen, for when you don't have a BRB scene" },
          ]}
          value={settings?.show ?? "panel"}
          onChange={(v) => settings && setSettings({ ...settings, show: v === "full" ? "full" : "panel" })}
          floatingLabel="Show the break as"
          fullWidth
        />
        <p className="break-tab__note">Move and size the piece in Streaming ▸ Overlay ▸ Layout (it&apos;s under Apps as Break screen).</p>
      </AdminSection>

      <AdminSection title="Champion's prize" intro="Tokens for whoever has the most points when you're back, from your monthly token allowance. A tie splits it.">
        <Select
          id="break-prize"
          options={PRIZES}
          value={String(settings?.championTokens ?? 0)}
          onChange={(v) => settings && setSettings({ ...settings, championTokens: Number(v) || 0 })}
          floatingLabel="Prize"
        />
      </AdminSection>
    </div>
  );
}
