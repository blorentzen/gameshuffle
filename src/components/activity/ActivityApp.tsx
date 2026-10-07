"use client";

/**
 * GameShuffle inside Discord: the Activity (launched from the App Launcher,
 * the entry point command or a Play button on our posts). One page, never
 * navigated: a reload or redirect inside Discord's frame drops the connection
 * to the Discord client, so the games switch with tabs and every link opens
 * outside Discord.
 *
 * Start-up: the SDK handshake (ready), a Discord authorization code
 * (authorize, scope identify, no prompt after the first time), our sign-in
 * exchange (/api/activity/token: who you are comes from Discord, plus our own
 * session), then authenticate so SDK commands work. The games are the site's
 * own components, wrapped in an OriginalsHost that sends their API calls to
 * /api/activity/* with the session.
 *
 * Opened outside Discord (no frame_id/instance_id in the URL), the page says
 * where to find it instead of starting the SDK, which would throw.
 *
 * Signing up: players without a GameShuffle account get a welcome card once
 * (what a free account adds, "Sign up free with Discord" or "Play without an
 * account") and a "Join free" button in the band. Signing up opens
 * gameshuffle.co/discord/join in the browser; meanwhile the Activity asks
 * /api/activity/refresh every few seconds (and when it's focused again) and
 * swaps in a session naming the new account as soon as it exists.
 *
 * Development only: ?preview=linked or ?preview=guest skips Discord and signs
 * in through /api/activity/dev-session, for layout work on localhost.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Alert, Button, Card, Modal, Tabs } from "@empac/cascadeds";
import { IconBrain, IconCalendarWeek, IconCheck, IconPuzzle } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { DailyShuffle } from "@/components/originals/DailyShuffle";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { OriginalsHostProvider, type OriginalsHost } from "@/components/originals/OriginalsHost";
import { IconField } from "@/components/events/EventHeaderArt";
import { SITE_URL } from "@/lib/seo";

type TabId = "daily" | "weekly" | "brain";
const TAB_IDS: TabId[] = ["daily", "weekly", "brain"];
const TAB_NAMES: Record<TabId, string> = { daily: "The Daily", weekly: "The Weekly", brain: "Chat Brain" };
const TAB_GLYPHS: Record<TabId, typeof IconPuzzle> = { daily: IconPuzzle, weekly: IconCalendarWeek, brain: IconBrain };

/** The site's drifting Tabler glyph field (as on its hero bands), for every navy surface here. */
function Field({ seed, opacity = 0.12 }: { seed: string; opacity?: number }) {
  return <IconField category="originals" seed={seed} opacity={opacity} className="gs-activity__field" />;
}
const asTab = (x: string | null | undefined): TabId | null => (TAB_IDS.includes(x as TabId) ? (x as TabId) : null);

interface Player { id: string; name: string; avatar: string | null; linked: boolean }
type Phase =
  | { kind: "starting" }
  | { kind: "outside" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: string; player: Player; startTab: TabId };

const ERRORS: Record<string, string> = {
  not_configured: "GameShuffle isn't set up for Discord yet. Try again later.",
  bad_code: "Discord didn't sign you in. Try again.",
  discord_unavailable: "Couldn't reach Discord. Try again in a moment.",
};

/** What a free account adds, for the welcome card. Kept to things that are true on the free plan. */
const ACCOUNT_POINTS = [
  "Your Daily streak on your GameShuffle profile, on every device",
  "Play the Weekly and climb the leaderboard",
  "Free randomizers, game night tools and tournaments for your group",
];
const WELCOME_KEY = "gs-activity-welcome-seen";
/** How long to keep checking for a new account after "Sign up free". */
const SIGNUP_WATCH_MS = 10 * 60_000;

function welcomeSeen(): boolean {
  try { return !!localStorage.getItem(WELCOME_KEY); } catch { return false; }
}
function markWelcomeSeen() {
  try { localStorage.setItem(WELCOME_KEY, String(Date.now())); } catch { /* shown again next launch; harmless */ }
}

/** One SDK per page load: Discord allows a single handshake per frame. */
let sdk: DiscordSDK | null = null;
/** React may run the start-up effect twice in development; both share one sign-in. */
let signIn: Promise<Phase> | null = null;

/** Development only: the preview mode named in the URL, if any. */
function previewMode(): "linked" | "guest" | null {
  if (process.env.NODE_ENV !== "development") return null;
  const p = new URLSearchParams(window.location.search).get("preview");
  return p === "guest" ? "guest" : p ? "linked" : null;
}

async function startPreview(as: "linked" | "guest"): Promise<Phase> {
  const name = new URLSearchParams(window.location.search).get("name");
  const j = (await fetch(`/api/activity/dev-session?as=${as}${name ? `&name=${encodeURIComponent(name)}` : ""}`).then((r) => r.json()).catch(() => null)) as { ok?: boolean; session?: string; user?: Player } | null;
  if (!j?.ok || !j.session || !j.user) return { kind: "error", message: "Preview sign-in failed. Is the dev server using the dev database?" };
  const tab = asTab(new URLSearchParams(window.location.search).get("tab")) ?? "daily";
  return { kind: "ready", session: j.session, player: j.user, startTab: tab };
}

function inDiscord(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.has("frame_id") && q.has("instance_id");
}

async function start(clientId: string): Promise<Phase> {
  sdk ??= new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
  const res = await fetch("/api/activity/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, instanceId: sdk.instanceId }) });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; accessToken?: string; session?: string; user?: Player; startTab?: string | null } | null;
  if (!j?.ok || !j.accessToken || !j.session || !j.user) return { kind: "error", message: ERRORS[j?.error ?? ""] ?? ERRORS.discord_unavailable };
  await sdk.commands.authenticate({ access_token: j.accessToken });
  // A Play button's choice, else a shared link's (custom_id), else today's Daily.
  return { kind: "ready", session: j.session, player: j.user, startTab: asTab(j.startTab) ?? asTab(sdk.customId) ?? "daily" };
}

/** The Activity twin of a site API path. */
function activityPath(path: string): string {
  return path
    .replace(/^\/api\/chat-brain(?=[/?]|$)/, "/api/activity/brain")
    .replace(/^\/api\/(daily|weekly)(?=[/?]|$)/, "/api/activity/$1");
}

function avatarUrl(p: Player): string | null {
  return p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64` : null;
}

export function ActivityApp({ clientId }: { clientId: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [tab, setTab] = useState<TabId>("daily");
  const toast = useToast();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  /** When "Sign up free" was tapped; null when we're not watching for a new account. */
  const [signupSince, setSignupSince] = useState<number | null>(null);

  const run = useCallback(() => {
    const preview = previewMode();
    if (preview) {
      void startPreview(preview).then((p) => {
        if (p.kind === "ready") { setTab(p.startTab); if (!p.player.linked && !welcomeSeen()) setWelcomeOpen(true); }
        setPhase(p);
      });
      return;
    }
    if (!inDiscord()) { setPhase({ kind: "outside" }); return; }
    if (!clientId) { setPhase({ kind: "error", message: ERRORS.not_configured }); return; }
    signIn ??= start(clientId).catch((err: unknown) => {
      console.error("[activity] start failed:", err);
      return { kind: "error", message: ERRORS.discord_unavailable } as Phase;
    });
    void signIn.then((p) => {
      if (p.kind === "error") signIn = null; // Try again starts a fresh sign-in.
      if (p.kind === "ready") { setTab(p.startTab); if (!p.player.linked && !welcomeSeen()) setWelcomeOpen(true); }
      setPhase(p);
    });
  }, [clientId]);

  useEffect(() => {
    // Deferred a tick so the first paint (the "Starting" card) never waits on it.
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [run]);

  const session = phase.kind === "ready" ? phase.session : null;

  /** Opens sign-up in the browser and starts watching for the new account. */
  const startSignup = useCallback(() => {
    const path = "/discord/join?src=discord-activity";
    if (sdk) void sdk.commands.openExternalLink({ url: `${SITE_URL}${path}` }).catch(() => {});
    else window.open(`${SITE_URL}${path}`, "_blank", "noopener"); // preview on localhost
    markWelcomeSeen();
    setWelcomeOpen(false);
    setSignupSince(Date.now());
  }, []);

  // Watching for the new account: every few seconds, and as soon as the
  // Activity is looked at again (coming back from the browser).
  useEffect(() => {
    if (!signupSince || !session) return;
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      if (Date.now() - signupSince > SIGNUP_WATCH_MS) { setSignupSince(null); return; }
      const r = await fetch("/api/activity/refresh", { method: "POST", headers: { Authorization: `Bearer ${session}` } }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { linked?: boolean; session?: string | null } | null;
      if (stopped || !j?.linked) return;
      stopped = true;
      setSignupSince(null);
      setPhase((prev) => (prev.kind === "ready" ? { ...prev, session: j.session ?? prev.session, player: { ...prev.player, linked: true } } : prev));
      toast.success("You're signed up. Your Daily streak is on your GameShuffle profile, and the Weekly is open.");
    };
    const timer = setInterval(() => void check(), 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [signupSince, session, toast]);

  const host = useMemo<OriginalsHost | null>(() => {
    if (!session) return null;
    return {
      api: (path, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${session}`);
        return fetch(activityPath(path), { ...init, headers });
      },
      activity: {
        openSite: (path) => {
          if (sdk) void sdk.commands.openExternalLink({ url: `${SITE_URL}${path}` }).catch(() => {});
          else window.open(`${SITE_URL}${path}`, "_blank", "noopener"); // preview on localhost
        },
        share: async (message) => {
          try {
            const r = await sdk?.commands.shareLink({ message, custom_id: "daily" });
            return !!r?.success;
          } catch {
            return false;
          }
        },
        showTab: (t) => { setTab(t); window.scrollTo({ top: 0 }); },
        signUp: startSignup,
      },
    };
  }, [session, startSignup]);

  if (phase.kind === "outside") return <OutsideDiscord />;

  if (phase.kind !== "ready" || !host) {
    return (
      <main className="gs-activity gs-activity--center">
        <Field seed="activity-start" opacity={0.09} />
        <Card variant="outlined" padding="large" className="gs-activity__card">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <img src="/images/fg/logos/gameshuffle-primary.svg" alt="GameShuffle" className="gs-activity__logo" width={180} height={32} />
          {phase.kind === "error" ? (
            <>
              <Alert variant="error">{phase.message}</Alert>
              <Button variant="primary" onClick={() => { setPhase({ kind: "starting" }); run(); }}>Try again</Button>
            </>
          ) : (
            <p className="gs-activity__muted" role="status">Signing you in with Discord…</p>
          )}
        </Card>
      </main>
    );
  }

  const { player } = phase;
  const avatar = avatarUrl(player);
  const PipGlyph = TAB_GLYPHS[tab];
  return (
    <OriginalsHostProvider host={host}>
      <div className="gs-activity">
        {/* Discord's corner window (picture in picture) is too small to play in: just say what's open. */}
        <div className="gs-activity__pip">
          <Field seed="activity-corner" opacity={0.14} />
          <span className="gs-activity__pip-glyph" aria-hidden><PipGlyph size={30} stroke={1.75} /></span>
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <img src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" className="gs-activity__logo" width={120} height={21} />
          <span>{TAB_NAMES[tab]}</span>
        </div>
        <div className="gs-activity__full">
          {/* The site's brand band: navy aurora, white logo, who's playing. */}
          <header className="gs-activity__band">
            <Field seed="activity-band" opacity={0.1} />
            <div className="gs-activity__inner gs-activity__bar">
              <h1 className="gs-activity__brand">
                {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
                <img src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" className="gs-activity__logo" width={120} height={21} />
              </h1>
              <span className="gs-activity__account">
              {!player.linked && <Button variant="primary" size="small" onClick={startSignup}>Join free</Button>}
              <span className="gs-activity__player">
                {/* eslint-disable-next-line @next/next/no-img-element -- Discord's avatar CDN */}
                {avatar && <img src={avatar} alt="" className="gs-activity__avatar" width={24} height={24} />}
                <span className="gs-activity__name">{player.name}</span>
              </span>
              </span>
            </div>
          </header>
          {signupSince && (
            <p className="gs-activity__inner gs-activity__watching" role="status">Finish signing up in your browser. GameShuffle picks it up here by itself.</p>
          )}
          <main className="gs-activity__inner gs-activity__body">
          <Tabs
            variant="underline"
            size="small"
            fullWidth
            activeTab={tab}
            onChange={(id) => setTab(asTab(id) ?? "daily")}
            className="gs-activity__tabs"
            tabs={[
              { id: "daily", label: "Daily", icon: <IconPuzzle size={16} />, content: <DailyShuffle /> },
              {
                id: "weekly", label: "Weekly", icon: <IconCalendarWeek size={16} />,
                content: (
                  <>
                    {!player.linked && <LinkNote onOpen={startSignup} />}
                    <WeeklyChallenge />
                  </>
                ),
              },
              {
                id: "brain", label: "Chat Brain", icon: <IconBrain size={16} />,
                content: (
                  <div className="gs-activity__brain">
                    <ChatBrainAsk source="activity" eyebrow="Chat Brain" title="Say the first thing that comes to mind" headingLevel="h2" />
                    <p className="gs-activity__muted">Once enough people answer a question, the top answers become a board you can play on GameShuffle.</p>
                  </div>
                ),
              },
            ]}
          />
          </main>
        </div>
      </div>
      <Modal
        isOpen={welcomeOpen}
        onClose={() => { markWelcomeSeen(); setWelcomeOpen(false); }}
        title="Welcome to GameShuffle"
        size="small"
        className="gs-activity__welcome-modal"
        primaryAction={{ label: "Sign up free with Discord", onClick: startSignup }}
        secondaryAction={{ label: "Play without an account", onClick: () => { markWelcomeSeen(); setWelcomeOpen(false); } }}
      >
        <div className="gs-activity__welcome">
          <p>Play the Daily, the Weekly and Chat Brain right here. A free GameShuffle account adds:</p>
          <ul>
            {ACCOUNT_POINTS.map((pt) => <li key={pt}><IconCheck size={16} stroke={2.2} aria-hidden /> {pt}</li>)}
          </ul>
          <p className="gs-activity__muted">It uses the Discord account you&apos;re playing with: nothing to fill in, and anything you play here comes with you.</p>
        </div>
      </Modal>
    </OriginalsHostProvider>
  );
}

/** For players with no GameShuffle account yet: the Weekly needs one, and it puts their streak on their profile. */
function LinkNote({ onOpen }: { onOpen: () => void }) {
  return (
    <p className="gs-activity__note">
      The Weekly counts on your GameShuffle account. <button type="button" className="gs-activity__link" onClick={onOpen}>Sign up free with Discord</button> (or sign in) and come back: it opens here by itself, and your Daily streak comes with you.
    </p>
  );
}

function OutsideDiscord() {
  return (
    <main className="gs-activity gs-activity--center">
      <Field seed="activity-outside" opacity={0.09} />
      <Card variant="outlined" padding="large" className="gs-activity__card">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
        <img src="/images/fg/logos/gameshuffle-primary.svg" alt="GameShuffle" className="gs-activity__logo" width={180} height={32} />
        <h1 className="gs-activity__title">GameShuffle for Discord</h1>
        <p className="gs-activity__muted">This page runs inside Discord. Open GameShuffle from the App Launcher in any server or DM to play the Daily, the Weekly and Chat Brain with your friends.</p>
        <p className="gs-activity__muted">Or play them on the site: <a href={`${SITE_URL}/daily`}>the Daily</a>, <a href={`${SITE_URL}/weekly`}>the Weekly</a> and <a href={`${SITE_URL}/chat-brain`}>Chat Brain</a>.</p>
      </Card>
    </main>
  );
}
