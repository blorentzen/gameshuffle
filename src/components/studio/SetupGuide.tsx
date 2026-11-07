"use client";

/**
 * The Studio's guided setup (journeys picks 2026-11-06, 11A): one step per screen, and each step ticks itself when it
 * works (the overlay when OBS opens its link, the bot when it can post in chat), checked every few seconds while the
 * page is open (`/api/studio/setup`). Any step can wait; Studio Home shows how far you got.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBrandDiscord, IconBrandTwitch, IconCheck, IconDeviceTv, IconLayoutDashboard, IconMessageCircle, type Icon } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { NewSessionButton } from "@/components/hub/NewSessionButton";
import { OverlayLinkCopy } from "@/components/studio/OverlayLinkCopy";
import type { SetupStep } from "@/lib/streaming/setup";

type StepId = SetupStep["id"];
const ORDER: StepId[] = ["twitch", "bot", "overlay", "stream", "discord"];
const LOOK: Record<StepId, { short: string; icon: Icon; tone: "violet" | "blue" | "magenta" | "teal" }> = {
  twitch: { short: "Twitch", icon: IconBrandTwitch, tone: "violet" },
  bot: { short: "Chat bot", icon: IconMessageCircle, tone: "blue" },
  overlay: { short: "Overlay", icon: IconLayoutDashboard, tone: "magenta" },
  stream: { short: "Test stream", icon: IconDeviceTv, tone: "teal" },
  discord: { short: "Discord", icon: IconBrandDiscord, tone: "blue" },
};

function Body({ id }: { id: StepId }) {
  switch (id) {
    case "twitch":
      return (
        <>
          <p className="studio-guide__lede">GameShuffle opens a stream here when you go live, follows the game you&apos;re playing and runs your chat commands.</p>
          <a className="studio-guide__go" href="/api/twitch/auth/start">Connect Twitch</a>
        </>
      );
    case "bot":
      return (
        <>
          <p className="studio-guide__lede">The GameShuffle bot answers commands and posts rolls in your chat. Twitch only shows its messages once it&apos;s a moderator.</p>
          <ol className="studio-guide__steps">
            <li>In your Twitch chat, type <code>/mod gameshuffle_bot</code>.</li>
            <li>Send a test message from <Link href="/hub/setup/twitch">Setup ▸ Twitch</Link>; this step ticks when the bot can post.</li>
          </ol>
        </>
      );
    case "overlay":
      return (
        <>
          <p className="studio-guide__lede">One browser source shows every tool: rolls, polls, bingo, the wheel.</p>
          <ol className="studio-guide__steps">
            <li>In OBS or Streamlabs, add a <b>Browser</b> source to your scene.</li>
            <li>Paste your overlay link and set it to <b>1920 × 1080</b>.</li>
            <li>Keep it above your game in the sources list.</li>
          </ol>
          <OverlayLinkCopy primary />
        </>
      );
    case "stream":
      return (
        <>
          <p className="studio-guide__lede">A practice stream works like a real one: chat can join, roll and vote, and it never ends on its own.</p>
          <div><NewSessionButton defaultTest /></div>
        </>
      );
    case "discord":
      return (
        <>
          <p className="studio-guide__lede">The bot posts when you go live, runs polls and rolls in your server, and works on one server with a free account.</p>
          <a className="studio-guide__go" href="/api/discord/bot/install/start">Add to Discord</a>
        </>
      );
  }
}

const WAITING: Record<StepId, string> = {
  twitch: "Waiting for Twitch to connect.",
  bot: "Waiting for the bot to post in your chat.",
  overlay: "Waiting for OBS to open the link. This ticks itself once it does.",
  stream: "Waiting for your first stream to start.",
  discord: "Waiting for the bot to join a server.",
};

export function SetupGuide({ initial, start }: { initial: SetupStep[]; start: StepId | null }) {
  const [steps, setSteps] = useState(initial);
  const firstOpen = ORDER.find((id) => !initial.find((s) => s.id === id)?.done) ?? "twitch";
  const [at, setAt] = useState<StepId>(start && ORDER.includes(start) ? start : firstOpen);

  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.hidden) return;
      fetch("/api/studio/setup", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (alive && b?.steps) setSteps(b.steps as SetupStep[]); }).catch(() => {});
    };
    const t = window.setInterval(check, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const done = (id: StepId) => !!steps.find((s) => s.id === id)?.done;
  const i = ORDER.indexOf(at);
  const go = (id: StepId) => { setAt(id); window.history.replaceState(null, "", `/hub/setup?step=${id}`); };
  const allDone = ORDER.every(done);
  const look = LOOK[at];

  return (
    <section className="studio-guide" aria-labelledby="studio-guide-title">
      <ol className="studio-dots" aria-label="Setup steps">
        {ORDER.map((id, k) => (
          <li key={id} className={`${done(id) ? "is-done" : ""}${id === at ? " is-now" : ""}`}>
            <button type="button" onClick={() => go(id)} aria-current={id === at ? "step" : undefined}>
              <i aria-hidden="true">{done(id) ? <IconCheck size={14} stroke={3} /> : k + 1}</i>
              {LOOK[id].short}<span className="sr-only">{done(id) ? " (done)" : ""}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="studio-guide__card">
        <div className="studio-guide__head">
          <IconTile icon={look.icon} tone={look.tone} />
          <h2 id="studio-guide-title">{steps.find((s) => s.id === at)?.label ?? look.short}</h2>
        </div>
        <Body id={at} />
        <p className={`studio-guide__status${done(at) ? " is-done" : ""}`} role="status">
          {done(at) ? <><IconCheck size={18} stroke={2.5} aria-hidden="true" />Done.</> : <><span className="studio-guide__spin" aria-hidden="true" />{WAITING[at]}</>}
        </p>
        <div className="studio-guide__nav">
          {i > 0 ? <Button variant="ghost" onClick={() => go(ORDER[i - 1])}>Back</Button> : <span />}
          {i < ORDER.length - 1
            ? <Button variant={done(at) ? "primary" : "secondary"} onClick={() => go(ORDER[i + 1])}>{done(at) ? "Next" : "Do this later"}</Button>
            : <Link href="/hub" className="studio-guide__home">{allDone ? "You're set: back to the Studio" : "Back to the Studio"}</Link>}
        </div>
      </div>
    </section>
  );
}
