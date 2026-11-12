"use client";

/**
 * Streaming ▸ Live games ▸ Level queue, and the stream page's Live games tab (levels picks 2026-11-11, GS Pro;
 * approved mockup): viewers send Mario Maker 2 course IDs, Fortnite island codes or Fall Guys share codes with
 * `!add` in chat; the streamer (or a Full-access mod) runs the line from here or with `!level`.
 *
 * Now playing with its code, who sent it and Cleared / Skipped / Gave up; the line with each sender and code; Next,
 * Random, Open or Close the queue; played this stream with each result (changeable); the game (Twitch category
 * first, else the pick here) and the sender's thank-you. Reads /api/levels/queue every 5 seconds while the tab is open.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCopy, IconX } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { IconAction } from "@/components/actions/IconAction";
import { AdminPanel, AdminScreen, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { LEVEL_GAMES, type LevelGame } from "@/lib/levels/games";
import { RESULT_WORD, THANKS_CHOICES, type LevelResult } from "@/lib/levels/rules";
import type { QueueEntryView, QueueView } from "@/lib/levels/types";
import "@/styles/levels.css";

const POLL_MS = 5_000;
const CODE_NAMES: Record<string, string> = {
  "super-mario-maker-2": "Super Mario Maker 2 course IDs", fortnite: "Fortnite island codes", "fall-guys": "Fall Guys share codes", "geometry-dash": "Geometry Dash level IDs",
};
/** The intro names the games this queue takes (Geometry Dash once its tables are there). */
function introFor(games: string[] | undefined): string {
  const names = (games?.length ? games : ["super-mario-maker-2", "fortnite", "fall-guys"]).map((g) => CODE_NAMES[g]).filter(Boolean);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Viewers send levels with !add in your chat: ${list}. You play them in order or at random, and say how each one went.`;
}

async function copy(code: string, game: LevelGame, from: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Copied ${code}`);
    track(EVENTS.levelCodeCopied, { game, from });
  } catch {
    toast.error("Couldn't copy. Select the code and copy it by hand.");
  }
}

export function LevelQueueTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<QueueView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/levels/queue", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as QueueView) : null;
    if (d) setView(d);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (key: string, body: Record<string, unknown>, done?: string): Promise<boolean> => {
    setBusy(key);
    const r = await fetch("/api/levels/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      const e = (await r?.json().catch(() => null)) as { error?: string } | null;
      toast.error(e?.error === "pro_required" ? "The level queue is part of GS Pro." : "That didn't go through. Try again.");
      return false;
    }
    setView((await r.json()) as QueueView);
    if (done) toast.success(done);
    return true;
  };

  const INTRO = introFor(view?.games);
  if (!loaded) return <AdminScreen title="Level queue" intro={INTRO}><LoadingLines label="Loading" /></AdminScreen>;
  if (!view?.ready) {
    return (
      <AdminScreen title="Level queue" intro={INTRO}>
        <Alert variant="info">The level queue isn&apos;t switched on here yet. It shows up once it is.</Alert>
      </AdminScreen>
    );
  }
  if (!view.pro) {
    return (
      <AdminScreen title="Level queue" intro={INTRO}>
        <ProTrialPrompt title="The level queue is part of GS Pro" from="level-queue">
          <p>Viewers send their levels with !add, you play them in order or at random, and the overlay shows what&apos;s up next.</p>
        </ProTrialPrompt>
      </AdminScreen>
    );
  }

  const g = LEVEL_GAMES[view.game];
  const open = view.status === "open";
  const now = view.now;
  const ended = (result: LevelResult | null, via: string) => track(EVENTS.levelPlayed, { game: view.game, result: result ?? "none", via });

  const next = async (mode: "next" | "random") => {
    if (await act(mode, { action: mode })) {
      if (now) ended(null, mode);
    }
  };
  const result = async (r: LevelResult) => {
    if (!now) return;
    if (await act(`result-${r}`, { action: "result", id: now.id, result: r }, `${RESULT_WORD[r]}: ${now.code}`)) ended(r, "result");
  };
  const toggle = async () => {
    if (await act("toggle", { action: open ? "close" : "open" }, open ? "Queue closed" : "Queue open")) {
      if (!open) track(EVENTS.levelQueueOpened, { game: view.game });
    }
  };
  const clearLine = async () => {
    if (!(await confirm({ title: "Clear the line?", body: `Takes out the ${view.line.length} ${view.line.length === 1 ? "level" : "levels"} waiting. The one being played stays.`, confirmLabel: "Clear the line" }))) return;
    await act("clear", { action: "clear" }, "Line cleared");
  };

  return (
    <AdminScreen
      title="Level queue"
      intro={INTRO}
      actions={<Button size="small" variant={open ? "secondary" : "primary"} onClick={() => void toggle()} disabled={busy !== null}>{open ? "Close the queue" : "Open the queue"}</Button>}
    >
      {!view.twitch && (
        <Alert variant="info">Connect Twitch on <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link>: viewers send levels from your chat.</Alert>
      )}

      <AdminPanel className="lvq">
        <div className="lvq__head">
          <h2 className="lvq__title">Level queue <Badge variant={open ? "success" : "default"} size="small">{open ? "Open" : "Closed"}</Badge></h2>
          <p className="lvq__meta">{g.name} · {view.line.length} in line</p>
        </div>

        <div className={`lvq-now${now ? "" : " lvq-now--empty"}`} aria-live="polite">
          <p className="lvq-now__kicker">Now playing</p>
          {now ? (
            <>
              <div className="lvq-now__code-row">
                <span className="lvq-code lvq-code--big">{now.code}</span>
                <IconAction label={`Copy ${now.code}`} icon={IconCopy} onClick={() => void copy(now.code, view.game, "now", toast)} />
              </div>
              <p className="lvq-now__from">from <b>{now.from}</b>{now.title ? <> · <i>{now.title}</i></> : null}</p>
              <div className="lvq-now__results" role="group" aria-label="How it went">
                <Button size="small" variant="primary" className="lvq-cleared" onClick={() => void result("cleared")} disabled={busy !== null}>Cleared</Button>
                <Button size="small" variant="secondary" onClick={() => void result("skipped")} disabled={busy !== null}>Skipped</Button>
                <Button size="small" variant="secondary" onClick={() => void result("gave_up")} disabled={busy !== null}>Gave up</Button>
              </div>
            </>
          ) : (
            <p className="lvq-now__none">
              {view.line.length ? "Nothing playing. Next brings up the first level in line." : open ? `Nothing in line yet. Viewers type !add and their ${g.codeWord} in chat.` : "Open the queue and viewers can send levels with !add."}
            </p>
          )}
        </div>

        {view.line.length > 0 && (
          <ol className="lvq-line" aria-label="Levels in line">
            {view.line.map((e, i) => (
              <li key={e.id} className="lvq-line__row">
                <span className="lvq-line__place">{i + 1}.</span>
                <span className="lvq-line__face" aria-hidden="true">{e.from.slice(0, 1).toUpperCase()}</span>
                <span className="lvq-line__who">{e.from}</span>
                <span className="lvq-code">{e.code}</span>
                {e.title && <span className="lvq-line__title">{e.title}</span>}
                <IconAction label={`Take ${e.from}'s level out`} icon={IconX} onClick={() => void act(`rm-${e.id}`, { action: "remove", id: e.id }, `Took ${e.from}'s level out`)} disabled={busy !== null} />
              </li>
            ))}
          </ol>
        )}

        <div className="lvq__actions">
          <Button variant="primary" onClick={() => void next("next")} disabled={busy !== null || (!view.line.length && !now)}>Next</Button>
          <Button variant="secondary" onClick={() => void next("random")} disabled={busy !== null || !view.line.length}>Random</Button>
          {view.line.length > 0 && <Button variant="ghost" onClick={() => void clearLine()} disabled={busy !== null}>Clear the line</Button>}
        </div>
        {view.held > 0 && (
          <p className="lvq__note">{view.held} {view.held === 1 ? "level waits" : "levels wait"} for another game. {view.held === 1 ? "It comes" : "They come"} back when that game is on stream.</p>
        )}
      </AdminPanel>

      <AdminSection title="Played this stream">
        {view.played.length === 0 ? (
          <p className="lvq__note">Levels you play show here with how each one went. A level played this stream can&apos;t be sent again.</p>
        ) : (
          <AdminTable label="Played this stream">
            <Table variant="striped" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>How it went</TableHead>
                  {view.thanks > 0 && <TableHead align="right">Thank-you</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.played.map((e) => <PlayedRow key={e.id} e={e} thanks={view.thanks > 0} busy={busy !== null}
                  onResult={(r) => void act(`pr-${e.id}`, { action: "result", id: e.id, result: r }, "Saved")} />)}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>

      <AdminSection title="Settings">
        <div className="lvq-settings">
          <p className="lvq__note">
            {view.onStream
              ? <>On stream now: <b>{LEVEL_GAMES[view.onStream].name}</b>, from your Twitch category. The queue takes its codes.</>
              : <>{view.category ? <>Your Twitch category is {view.category}, not one of the three, so</> : <>When your Twitch category isn&apos;t one of the three,</>} the queue takes codes for the game you pick here.</>}
          </p>
          <div className="admin-form-grid">
            <Select
              floatingLabel="Game"
              value={view.picked}
              options={(view.games ?? [view.picked]).map((id) => ({ value: id, label: LEVEL_GAMES[id].name }))}
              onChange={(v) => void act("game", { action: "settings", game: v as string }, "Saved")}
            />
          </div>
          <div className="lvq-switch">
            <Switch
              label="Thank the sender with tokens when you play their level"
              aria-describedby="lvq-thanks-help"
              checked={view.thanks > 0}
              onChange={(e) => void act("thanks", { action: "settings", thanks: e.target.checked ? 10 : 0 }, "Saved")}
              disabled={busy !== null}
            />
            {/* Our own line, not the Switch's helper text: CDS draws that at 12px (CascadeDS fix list). */}
            <p id="lvq-thanks-help" className="lvq__note">From your monthly token allowance, when you clear or give up on their level. Never for a skip, and never for likes or favorites.</p>
          </div>
          {view.thanks > 0 && (
            <div className="admin-form-grid">
              <Select
                floatingLabel="Thank-you"
                value={String(view.thanks)}
                options={[...new Set([...THANKS_CHOICES, view.thanks])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n} tokens` }))}
                onChange={(v) => void act("thanks", { action: "settings", thanks: Number(v) }, "Saved")}
              />
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection title="In chat and on stream">
        <ul className="lvq-help">
          <li>Viewers: <code>!add {g.shape}</code>, <code>!position</code>, <code>!remove</code>. One level each in line.</li>
          <li>You and your mods: <code>!level next</code>, <code>!level random</code>, <code>!level skip</code>, <code>!level open</code>, <code>!level close</code>, <code>!level clear</code>.</li>
          <li>On your overlay: turn on the <Link href="/account/streaming?tab=overlay-layout">Level queue piece</Link> under Apps.</li>
          <li>Players share their best levels on each game&apos;s Levels board: <Link href={`/games/${g.space}?tab=levels`}>{g.name} levels</Link>.</li>
        </ul>
      </AdminSection>
    </AdminScreen>
  );
}

function PlayedRow({ e, thanks, busy, onResult }: { e: QueueEntryView; thanks: boolean; busy: boolean; onResult: (r: LevelResult) => void }) {
  return (
    <TableRow>
      <TableCell><span className="lvq-code">{e.code}</span>{e.title && <span className="admin-table__sub">{e.title}</span>}</TableCell>
      <TableCell>{e.from}</TableCell>
      <TableCell>
        <Select
          floatingLabel={`How ${e.code} went`}
          className="lvq-result-select"
          value={e.result ?? ""}
          options={[{ value: "", label: "No result yet" }, ...(["cleared", "skipped", "gave_up"] as const).map((r) => ({ value: r, label: RESULT_WORD[r] }))]}
          onChange={(v) => { if (v) onResult(v as LevelResult); }}
          disabled={busy}
        />
      </TableCell>
      {thanks && <TableCell align="right" className="admin-num">{e.thanked ? `${e.thanked} tokens` : "None"}</TableCell>}
    </TableRow>
  );
}
