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
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { Alert, Button, Card, Tabs } from "@empac/cascadeds";
import { IconBrain, IconCalendarWeek, IconPuzzle } from "@tabler/icons-react";
import { DailyShuffle } from "@/components/originals/DailyShuffle";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { OriginalsHostProvider, type OriginalsHost } from "@/components/originals/OriginalsHost";
import { SITE_URL } from "@/lib/seo";

type TabId = "daily" | "weekly" | "brain";
const TAB_IDS: TabId[] = ["daily", "weekly", "brain"];
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

/** One SDK per page load: Discord allows a single handshake per frame. */
let sdk: DiscordSDK | null = null;
/** React may run the start-up effect twice in development; both share one sign-in. */
let signIn: Promise<Phase> | null = null;

function inDiscord(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.has("frame_id") && q.has("instance_id");
}

async function start(clientId: string): Promise<Phase> {
  sdk ??= new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
  const res = await fetch("/api/activity/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
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

  const run = useCallback(() => {
    if (!inDiscord()) { setPhase({ kind: "outside" }); return; }
    if (!clientId) { setPhase({ kind: "error", message: ERRORS.not_configured }); return; }
    signIn ??= start(clientId).catch((err: unknown) => {
      console.error("[activity] start failed:", err);
      return { kind: "error", message: ERRORS.discord_unavailable } as Phase;
    });
    void signIn.then((p) => {
      if (p.kind === "error") signIn = null; // Try again starts a fresh sign-in.
      if (p.kind === "ready") setTab(p.startTab);
      setPhase(p);
    });
  }, [clientId]);

  useEffect(() => {
    // Deferred a tick so the first paint (the "Starting" card) never waits on it.
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [run]);

  const session = phase.kind === "ready" ? phase.session : null;
  const host = useMemo<OriginalsHost | null>(() => {
    if (!session) return null;
    return {
      api: (path, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${session}`);
        return fetch(activityPath(path), { ...init, headers });
      },
      activity: {
        openSite: (path) => { void sdk?.commands.openExternalLink({ url: `${SITE_URL}${path}` }).catch(() => {}); },
        share: async (message) => {
          try {
            const r = await sdk?.commands.shareLink({ message, custom_id: "daily" });
            return !!r?.success;
          } catch {
            return false;
          }
        },
      },
    };
  }, [session]);

  if (phase.kind === "outside") return <OutsideDiscord />;

  if (phase.kind !== "ready" || !host) {
    return (
      <main className="gs-activity gs-activity--center">
        <Card variant="outlined" padding="large" className="gs-activity__card">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <img src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" className="gs-activity__logo" width={180} height={32} />
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
  return (
    <OriginalsHostProvider host={host}>
      <main className="gs-activity">
        <header className="gs-activity__head">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <img src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" className="gs-activity__logo" width={150} height={27} />
          <span className="gs-activity__player">
            {/* eslint-disable-next-line @next/next/no-img-element -- Discord's avatar CDN */}
            {avatar && <img src={avatar} alt="" className="gs-activity__avatar" width={28} height={28} />}
            <span className="gs-activity__name">{player.name}</span>
          </span>
        </header>
        {!player.linked && (
          <p className="gs-activity__note">
            Your Daily streak is saved to your Discord account. To put it on your GameShuffle profile and play the Weekly,{" "}
            <button type="button" className="gs-activity__link" onClick={() => host.activity?.openSite("/login?redirect=/account%3Ftab%3Dprofile")}>sign in to GameShuffle with Discord</button>.
          </p>
        )}
        <Tabs
          variant="pills"
          fullWidth
          activeTab={tab}
          onChange={(id) => setTab(asTab(id) ?? "daily")}
          className="gs-activity__tabs"
          tabs={[
            { id: "daily", label: "Daily", icon: <IconPuzzle size={16} />, content: <DailyShuffle /> },
            { id: "weekly", label: "Weekly", icon: <IconCalendarWeek size={16} />, content: <WeeklyChallenge /> },
            {
              id: "brain", label: "Chat Brain", icon: <IconBrain size={16} />,
              content: (
                <div className="gs-activity__brain">
                  <ChatBrainAsk source="activity" eyebrow="Chat Brain" title="Say the first thing that comes to mind" />
                  <p className="gs-activity__muted">Once enough people answer a question, the top answers become a board you can play on GameShuffle.</p>
                </div>
              ),
            },
          ]}
        />
      </main>
    </OriginalsHostProvider>
  );
}

function OutsideDiscord() {
  return (
    <main className="gs-activity gs-activity--center">
      <Card variant="outlined" padding="large" className="gs-activity__card">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
        <img src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" className="gs-activity__logo" width={180} height={32} />
        <h1 className="gs-activity__title">GameShuffle for Discord</h1>
        <p className="gs-activity__muted">This page runs inside Discord. Open GameShuffle from the App Launcher in any server or DM to play the Daily, the Weekly and Chat Brain with your friends.</p>
        <p className="gs-activity__muted">Or play them on the site: <a href={`${SITE_URL}/daily`}>the Daily</a>, <a href={`${SITE_URL}/weekly`}>the Weekly</a> and <a href={`${SITE_URL}/chat-brain`}>Chat Brain</a>.</p>
      </Card>
    </main>
  );
}
