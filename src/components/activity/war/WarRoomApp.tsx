"use client";

/**
 * The War room: GameShuffle Competitive's Discord Activity (picks 2026-11-01,
 * https://claude.ai/artifact/LKB8iApfE2Tqg1yhivbj53, all as recommended). A team in a call scores its war together:
 * everyone taps the place they finished, the race goes in at six different places, and the war card in the channel
 * moves down as it does for the card's own buttons (the same store, src/lib/wars/room.ts).
 *
 * Signs in like GameShuffle's Activity (one SDK handshake per frame, authorize then our session), but as GameShuffle
 * Competitive (`app: "comp"`). Polls /api/activity/war every 1.5 seconds while it's on screen.
 * Development only: /discord/activity?app=comp&preview=guest&name=Sam&guild=<id>&channel=<id> signs in without Discord.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Button, Card, Input } from "@empac/cascadeds";
import { IconSearch, IconSwords } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { SITE_URL } from "@/lib/seo";
import type { RoomStart, RoomState, RoomWarChoice } from "@/lib/wars/room";
import { WarScreen } from "./WarScreen";
import { TeamMark } from "./bits";
import { warSdk } from "./sdk";
import "@/styles/war-room.css";

type Phase =
  | { kind: "starting" }
  | { kind: "outside" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: string; name: string };

const POLL_MS = 1500;
const ERRORS: Record<string, string> = {
  not_configured: "The War room isn't set up yet. Try again later.",
  bad_code: "Discord didn't let us sign you in. Close the War room and open it again.",
  discord_unavailable: "Couldn't reach Discord just now. Close the War room and open it again.",
};

let signIn: Promise<Phase> | null = null;

function previewParams(): URLSearchParams | null {
  if (process.env.NODE_ENV !== "development") return null;
  const q = new URLSearchParams(window.location.search);
  return q.get("preview") ? q : null;
}

async function startPreview(q: URLSearchParams): Promise<Phase> {
  const pass = new URLSearchParams({ as: "guest", app: "comp" });
  for (const k of ["name", "guild", "channel", "room"]) if (q.get(k)) pass.set(k, q.get(k)!);
  const j = (await fetch(`/api/activity/dev-session?${pass}`).then((r) => r.json()).catch(() => null)) as { ok?: boolean; session?: string; user?: { name: string } } | null;
  if (!j?.ok || !j.session || !j.user) return { kind: "error", message: "Preview sign-in failed. Is the dev server using the dev database?" };
  return { kind: "ready", session: j.session, name: j.user.name };
}

async function start(clientId: string): Promise<Phase> {
  warSdk.current ??= new DiscordSDK(clientId);
  const sdk = warSdk.current;
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
  const res = await fetch("/api/activity/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, instanceId: sdk.instanceId, app: "comp" }) });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; accessToken?: string; session?: string; user?: { name: string } } | null;
  if (!j?.ok || !j.accessToken || !j.session || !j.user) return { kind: "error", message: ERRORS[j?.error ?? ""] ?? ERRORS.discord_unavailable };
  await sdk.commands.authenticate({ access_token: j.accessToken });
  return { kind: "ready", session: j.session, name: j.user.name };
}

const inDiscord = () => { const q = new URLSearchParams(window.location.search); return q.has("frame_id") && q.has("instance_id"); };

export function WarRoomApp({ clientId }: { clientId: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });

  // The War room is the competitive app's dark world in every theme.
  useEffect(() => {
    const html = document.documentElement;
    const before = { theme: html.getAttribute("data-theme"), dark: html.classList.contains("dark") };
    html.setAttribute("data-theme", "dark");
    html.classList.add("dark");
    return () => { if (before.theme) html.setAttribute("data-theme", before.theme); if (!before.dark) html.classList.remove("dark"); };
  }, []);

  const run = useCallback(() => {
    const preview = previewParams();
    if (preview) { void startPreview(preview).then(setPhase); return; }
    if (!inDiscord()) { setPhase({ kind: "outside" }); return; }
    if (!clientId) { setPhase({ kind: "error", message: ERRORS.not_configured }); return; }
    signIn ??= start(clientId).catch((err: unknown) => { console.error("[war-room] start failed:", err); return { kind: "error", message: ERRORS.discord_unavailable } as Phase; });
    void signIn.then((p) => { if (p.kind === "error") signIn = null; setPhase(p); });
  }, [clientId]);

  useEffect(() => { const t = setTimeout(run, 0); return () => clearTimeout(t); }, [run]);

  return (
    <main className="wr-app">
      <header className="wr-top">
        <span className="wr-top__mark" aria-hidden="true"><IconSwords size={18} stroke={2} /></span>
        <span className="wr-top__name">War room</span>
        <span className="wr-top__by">GameShuffle Competitive</span>
      </header>
      {phase.kind === "starting" && <p className="wr-note" role="status">Signing you in…</p>}
      {phase.kind === "outside" && (
        <Card variant="outlined" padding="large" className="wr-card">
          <h1 className="wr-h">The War room runs inside Discord</h1>
          <p className="wr-muted">Open it from the War room button on a war card, or from the apps in a voice call, in a server with GameShuffle Competitive.</p>
          <p className="wr-muted">Or see what the war tools do: <a href={`${SITE_URL}/mario-kart-discord-bot`}>GameShuffle Competitive</a>.</p>
        </Card>
      )}
      {phase.kind === "error" && (
        <Card variant="outlined" padding="large" className="wr-card">
          <p role="alert">{phase.message}</p>
          <Button variant="secondary" onClick={() => { setPhase({ kind: "starting" }); run(); }}>Try again</Button>
        </Card>
      )}
      {phase.kind === "ready" && <Room session={phase.session} />}
    </main>
  );
}

function Room({ session }: { session: string }) {
  const toast = useToast();
  const [state, setState] = useState<RoomState | null>(null);
  const [failed, setFailed] = useState(false);
  /** "Start a war" pressed on the list of live wars. */
  const [starting, setStarting] = useState(false);
  const warId = state?.kind === "war" ? state.view.id : null;
  const warRef = useRef<string | null>(null);
  useEffect(() => { warRef.current = warId; }, [warId]);
  const auth = useCallback((init: RequestInit = {}) => ({ ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session}`, "Content-Type": "application/json" } }), [session]);

  const load = useCallback(async () => {
    const hint = warRef.current;
    const res = await fetch(`/api/activity/war${hint ? `?war=${hint}` : ""}`, auth({ cache: "no-store" })).catch(() => null);
    if (!res?.ok) { setFailed(true); return; }
    setFailed(false);
    setState((await res.json()) as RoomState);
  }, [auth]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [load]);

  /** Runs an action; the answer is the room's new state. */
  const act = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch("/api/activity/war", auth({ method: "POST", body: JSON.stringify(body) })).catch(() => null);
    const j = (await res?.json().catch(() => null)) as (RoomState & { note?: string | null }) | { error: string; message?: string } | null;
    if (!res?.ok || !j || "error" in j) {
      toast.error((j && "message" in j && j.message) || "That didn't go through. Try again.");
      void load();
      return false;
    }
    if ("note" in j && j.note) toast.info(j.note);
    setState(j);
    return true;
  }, [auth, load, toast]);

  if (!state) return <p className="wr-note" role="status">{failed ? "Can't reach GameShuffle right now. Trying again…" : "Finding your war…"}</p>;
  if (state.kind === "nowhere") {
    return <Card variant="outlined" padding="large" className="wr-card"><p>The War room works in a server&apos;s channel or voice call, where GameShuffle Competitive keeps the war.</p></Card>;
  }
  if (state.kind === "pick" && starting) return <StartWar start={state.start} auth={auth} act={act} onBack={() => setStarting(false)} />;
  if (state.kind === "pick") return <PickWar wars={state.wars} onPick={(id) => { warRef.current = id; void act({ action: "pick", war: id }); }} onStart={() => setStarting(true)} />;
  if (state.kind === "none") return <StartWar start={state.start} auth={auth} act={act} />;
  return <WarScreen view={state.view} act={act} failed={failed} />;
}

function PickWar({ wars, onPick, onStart }: { wars: RoomWarChoice[]; onPick: (id: string) => void; onStart: () => void }) {
  return (
    <section className="wr-panel" aria-labelledby="wr-pick">
      <h1 id="wr-pick" className="wr-h">Live wars in this server</h1>
      <ul className="wr-list">
        {wars.map((w) => (
          <li key={w.id}>
            <button type="button" className="wr-warrow" onClick={() => onPick(w.id)}>
              <span className="wr-warrow__marks"><TeamMark team={w.us} size="sm" /><TeamMark team={w.them} size="sm" /></span>
              <span className="wr-warrow__tx"><b>{w.us.name || w.us.tag} vs {w.them.name || w.them.tag}</b><span>{w.channel ? `#${w.channel} · ` : ""}race {Math.min(w.played + 1, w.racesTotal)} of {w.racesTotal} · {w.diff > 0 ? `+${w.diff}` : w.diff < 0 ? w.diff : "level"}</span></span>
              <span className="wr-warrow__go">Open</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="wr-row"><Button variant="secondary" onClick={onStart}>Start a war</Button></div>
    </section>
  );
}

type Team = { tag: string; name: string | null; logo: string | null; from?: string };

function StartWar({ start, auth, act, onBack }: { start: RoomStart; auth: (init?: RequestInit) => RequestInit; act: (b: Record<string, unknown>) => Promise<boolean>; onBack?: () => void }) {
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [vs, setVs] = useState<Team | null>(null);
  const [us, setUs] = useState(start.us?.tag ?? "");
  const [game, setGame] = useState(start.game);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/activity/war?teams=${encodeURIComponent(q)}&game=${game}`, auth({ cache: "no-store" })).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { teams?: Team[] } | null;
      setTeams(j?.teams ?? []);
    }, q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [q, game, auth]);

  const typed = q.trim().slice(0, 12);
  const go = async () => {
    const tag = vs?.tag ?? typed;
    if (!tag) return;
    setBusy(true);
    await act({ action: "start", vs: tag, us, game });
    setBusy(false);
  };

  return (
    <section className="wr-panel" aria-labelledby="wr-start">
      <h1 id="wr-start" className="wr-h">Start a war</h1>
      <div className="wr-field">
        <label htmlFor="wr-vs">Who you&apos;re playing</label>
        <Input id="wr-vs" iconBefore={IconSearch} value={q} onChange={(e) => { setQ(e.target.value); setVs(null); }} placeholder="Search teams or type a tag" fullWidth autoComplete="off" />
        <div className="wr-teams" role="group" aria-label="Teams">
          {teams.map((t) => (
            <button key={t.tag} type="button" aria-pressed={vs?.tag === t.tag} className="wr-team" onClick={() => setVs(t)}>
              <TeamMark team={t} size="sm" /><b>{t.name || t.tag}</b><span className="wr-muted">{t.tag}{t.from ? ` · ${t.from}` : ""}</span>
            </button>
          ))}
          {typed && !teams.some((t) => t.tag.toLowerCase() === typed.toLowerCase()) && (
            <button type="button" aria-pressed={vs?.tag === typed} className="wr-team" onClick={() => setVs({ tag: typed, name: null, logo: null })}>
              <TeamMark team={{ tag: typed, logo: null }} size="sm" /><b>{typed}</b><span className="wr-muted">As typed</span>
            </button>
          )}
        </div>
      </div>
      <div className="wr-field">
        <label htmlFor="wr-us">Your team&apos;s tag</label>
        <Input id="wr-us" value={us} onChange={(e) => setUs(e.target.value.slice(0, 12))} placeholder="KC" fullWidth autoComplete="off" />
        {start.us && <span className="wr-help">Remembered from {start.channel ? `#${start.channel}` : "this channel"}.</span>}
      </div>
      <div className="wr-field" role="group" aria-labelledby="wr-game-l">
        <span id="wr-game-l" className="wr-label">Game</span>
        <div className="wr-row">
          <Button variant={game === "mkworld" ? "primary" : "secondary"} aria-pressed={game === "mkworld"} onClick={() => setGame("mkworld")}>Mario Kart World</Button>
          <Button variant={game === "mk8dx" ? "primary" : "secondary"} aria-pressed={game === "mk8dx"} onClick={() => setGame("mk8dx")}>Mario Kart 8 Deluxe</Button>
        </div>
      </div>
      <p className="wr-help">The card goes in {start.channel ? `#${start.channel}` : "this channel"}, so everyone outside the call sees the score too.</p>
      <div className="wr-row">
        <Button variant="primary" loading={busy} disabled={!(vs?.tag || typed) || !us.trim()} onClick={go}>Start the war</Button>
        {onBack && <Button variant="ghost" onClick={onBack}>Back to the live wars</Button>}
      </div>
    </section>
  );
}
