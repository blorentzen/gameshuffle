"use client";

/**
 * A game space's thing of the day and of the week (spaces round three, 2026-11-06), at the top of its Now tab: the
 * day's pick on the space's own art (Combo of the day, Fighter of the day, Party of the day) with a one-tap check-in,
 * the count and faces of who's done it, your streak and Share; under it the week's challenge, ticked off a step at
 * a time. A cup week (Mario Kart) is left to the time trial tile below, which has its tracks and standings, so the Cup
 * shows once. Check-ins pay GameShuffle tokens (src/lib/spaces/challenges.ts). Signed out, the button goes to sign-up and
 * says what an account adds. Pokémon has no day of its own here (its dailies are the Dex and the Duel), so it shows
 * the week alone.
 */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconCheck, IconFlag, IconPokeball, IconShare, IconStopwatch, IconSwords, IconTrophy } from "@tabler/icons-react";
import { IconField, type ArtCategory } from "@/components/events/EventHeaderArt";
import { UserAvatar } from "@/components/UserAvatar";
import { GhostFaces } from "@/components/ui/Ghost";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { PartArt } from "@/components/rolls/RollCard";
import { useToast } from "@/components/toast/ToastProvider";
import { JoinSheet, useThen } from "@/components/games/JoinSheet";
import { getImagePath } from "@/lib/images";
import type { ChallengeView, DayView, WeekView } from "@/lib/spaces/challenges";
import "@/styles/space-today.css";

const FIELD: Record<string, ArtCategory> = { "mario-kart-8-deluxe": "compete", "mario-kart-world": "compete", smash: "heroes", "mario-party": "minigame", pokemon: "dex" };

const tokenText = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "token" : "tokens"}`;

export function SpaceToday({ space, spaceName, initial, signedIn, accent }: {
  space: string;
  spaceName: string;
  initial: ChallengeView;
  signedIn: boolean;
  /** The space's color, for the day's art. */
  accent: string;
}) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const back = `/games/${space}`;
  const join = `/signup?redirect=${encodeURIComponent(back)}`;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/games/${space}/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { window.location.assign(join); return null; }
      if (!r.ok && r.status !== 409) { toast.error(r.status === 429 ? "That's a lot of taps. Give it a minute." : "That didn't save. Try again."); return null; }
      return d as { tokens: number; streak: number; done: boolean; progress: number[] };
    } catch { toast.error("That didn't save. Try again."); return null; }
    finally { setBusy(false); }
  }

  async function checkInDay() {
    const d = await post({ kind: "day" });
    if (!d || !view.day) return;
    setView((v) => v.day ? { ...v, day: { ...v.day, mine: true, count: v.day.mine ? v.day.count : v.day.count + 1, streak: d.streak || v.day.streak } } : v);
    if (d.tokens > 0) toast.success(`Checked in. +${tokenText(d.tokens)}${d.streak > 1 ? `, ${d.streak} days in a row` : ""}.`);
  }

  // Back from the sign-up sheet with ?then=checkin: finish the check-in they tapped (journeys 4A).
  useThen("checkin", signedIn, () => { if (view.day && !view.day.mine) void checkInDay(); });

  async function step(i: number) {
    const d = await post({ kind: "week", step: i });
    if (!d || !view.week) return;
    setView((v) => v.week ? { ...v, week: { ...v.week, progress: d.progress, done: d.done, count: d.done && !v.week.done ? v.week.count + 1 : v.week.count, steps: v.week.steps.map((s, k) => ({ ...s, done: d.progress.includes(k) })) } } : v);
    if (d.done && d.tokens > 0) toast.success(`${view.week.title} done. +${tokenText(d.tokens)}.`);
  }

  async function share(day: DayView) {
    const parts = day.challenge.roll.slots.map((s) => s.name).join(" · ");
    const text = `${day.title} in ${spaceName}: ${parts}. ${day.challenge.type === "combo" ? "Can you win a race with it?" : day.challenge.type === "fighter" ? "Can you win with it?" : "Who's in tonight?"}`;
    const url = `${window.location.origin}${back}`;
    try {
      if (navigator.share) { await navigator.share({ title: day.title, text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Copied. Paste it anywhere.");
    } catch { /* the share sheet was closed */ }
  }

  if (!view.ready || (!view.day && !view.week)) return null;
  const field = FIELD[space] ?? "mixed";
  const week = view.week && view.week.challenge.type !== "cup" ? view.week : null;

  return (
    <>
      {view.day ? (
        <section className="space-today" style={{ "--today": accent } as React.CSSProperties} aria-labelledby="sp-today-title">
          <IconField category={field} seed={`${space}-${view.day.period}`} opacity={0.08} className="space-today__field" />
          <DayArt day={view.day} />
          <div className="space-today__body">
            <span className="space-today__eyebrow">{view.day.title}</span>
            <h2 id="sp-today-title" className="space-today__title">{view.day.challenge.roll.slots[0]?.name}</h2>
            <DayParts day={view.day} />
            <p className="space-today__line">{view.day.line}</p>
            <div className="space-today__stats">
              {view.day.count > 0 ? <span><b>{view.day.count.toLocaleString("en-US")}</b> {view.day.did}</span> : <span className="space-today__first"><GhostFaces dark /> Be the first today</span>}
              {view.day.faces.length > 0 && (
                <span className="space-today__faces" aria-hidden="true">{view.day.faces.map((f) => <UserAvatar key={f.id} user={f.avatar} size={28} />)}</span>
              )}
              {signedIn && view.day.streak > 0 && <span>Your streak <b>{view.day.streak}</b></span>}
            </div>
            <div className="space-today__actions">
              {view.day.mine ? (
                <span className="space-today__done"><IconCheck size={18} aria-hidden="true" /> Done today</span>
              ) : signedIn ? (
                <Button variant="secondary" className="space-today__main" onClick={() => void checkInDay()} disabled={busy}>
                  {view.day.challenge.type === "combo" ? <IconFlag size={18} aria-hidden="true" /> : <IconCheck size={18} aria-hidden="true" />}{" "}{view.day.action}
                </Button>
              ) : (
                <Button variant="secondary" className="space-today__main" onClick={() => setAsking(true)} aria-haspopup="dialog">
                  {view.day.challenge.type === "combo" ? <IconFlag size={18} aria-hidden="true" /> : <IconCheck size={18} aria-hidden="true" />}{" "}{view.day.action}
                </Button>
              )}
              <Button variant="ghost" className="space-today__ghost" onClick={() => void share(view.day!)}><IconShare size={18} aria-hidden="true" /> Share</Button>
            </div>
            <p className="space-today__note">
              {signedIn
                ? `${tokenText(view.tokens.day)} for checking in, ${tokenText(view.tokens.streak)} more every ${view.tokens.streakEvery} days in a row.`
                : "A free account checks in, keeps your streak and earns tokens."}
            </p>
          </div>
          {week && <WeekStrip week={week} signedIn={signedIn} join={join} busy={busy} onStep={step} tokens={view.tokens.week} cup={view.tokens.cup} />}
          {!signedIn && (
            <JoinSheet
              open={asking} onClose={() => setAsking(false)} space={space} action="checkin"
              heading="Check in and start your streak"
              body="A free account keeps your streak, your times and your builds in every game space. You'll be back here, checked in."
              context={{ title: view.day.action, line: `${view.day.title} · ${tokenText(view.tokens.day)}`, img: view.day.challenge.roll.slots[0]?.img ? getImagePath(view.day.challenge.roll.slots[0].img) : null }}
            />
          )}
        </section>
      ) : week ? (
        <section className="space-today space-today--week" style={{ "--today": accent } as React.CSSProperties} aria-labelledby="sp-week-title">
          <IconField category={field} seed={`${space}-${week.period}`} opacity={0.08} className="space-today__field" />
          <WeekStrip week={week} signedIn={signedIn} join={join} busy={busy} onStep={step} tokens={view.tokens.week} cup={view.tokens.cup} solo />
        </section>
      ) : null}
    </>
  );
}

function DayArt({ day }: { day: DayView }) {
  const lead = day.challenge.roll.slots[0];
  const wide = day.challenge.type === "party";
  // Fighter renders are full-body and tall, so they get the panel's height.
  const tall = day.challenge.type === "fighter";
  return (
    <div className={`space-today__art${wide ? " space-today__art--wide" : tall ? " space-today__art--tall" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- our game art */}
      {lead?.img && <img src={getImagePath(lead.img)} alt="" />}
    </div>
  );
}

function DayParts({ day }: { day: DayView }) {
  const rest = day.challenge.roll.slots.slice(1);
  if (!rest.length) {
    const detail = day.challenge.roll.slots[0]?.detail;
    return detail ? <p className="space-today__detail">{detail}</p> : null;
  }
  return (
    <ul className="space-today__parts">
      {rest.map((p) => (
        <li key={`${p.label}-${p.name}`}>
          <PartArt slot={p} />
          <span><small>{p.label}</small><b>{p.name}</b></span>
        </li>
      ))}
    </ul>
  );
}

function WeekStrip({ week, signedIn, join, busy, onStep, tokens, cup, solo = false }: {
  week: WeekView; signedIn: boolean; join: string; busy: boolean; onStep: (i: number) => void; tokens: number; cup: [number, number, number]; solo?: boolean;
}) {
  const c = week.challenge;
  const Icon = c.type === "cup" ? IconStopwatch : c.type === "gauntlet" ? IconSwords : c.type === "run" ? IconPokeball : IconTrophy;
  const Heading = solo ? "h2" : "h3";
  const left = week.daysLeft <= 1 ? "Last day" : `${week.daysLeft} days left`;
  const reward = c.type === "cup" ? `${tokenText(cup[0])} for the week's best total` : `${tokenText(tokens)} for finishing`;
  return (
    <div className={`space-week${solo ? " space-week--solo" : ""}`}>
      <span className="space-week__icon" aria-hidden="true"><Icon size={22} /></span>
      <div className="space-week__words">
        <Heading id={solo ? "sp-week-title" : undefined} className="space-week__title">{/week/i.test(week.title) ? week.title : `This week: ${week.title}`}</Heading>
        <p className="space-week__line">{week.line}</p>
        <p className="space-week__meta">{left} · {week.count.toLocaleString("en-US")} finished · {reward}{week.done ? " · You finished it" : ""}</p>
        {week.link && <ArrowLink href={week.link.href} plain={week.link.href.startsWith("#")} className="space-week__link">{week.link.label}</ArrowLink>}
      </div>
      {c.type === "gauntlet" ? (
        <ul className="space-week__steps space-week__steps--art" aria-label="Fighters">
          {c.rolls.map((r, i) => {
            const done = week.progress.includes(i);
            const s = r.slots[0];
            return (
              <li key={s?.name ?? i}>
                {signedIn ? (
                  <button type="button" className={`space-week__step${done ? " is-done" : ""}`} aria-pressed={done} disabled={busy || done} onClick={() => onStep(i)} aria-label={done ? `${s?.name}: won` : `I won with ${s?.name}`} title={s?.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- our fighter art */}
                    {s?.img && <img src={getImagePath(s.img)} alt="" />}
                  </button>
                ) : (
                  <span className="space-week__step" title={s?.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- our fighter art */}
                    {s?.img && <img src={getImagePath(s.img)} alt={s?.name ?? ""} />}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : c.type === "run" ? (
        <ul className="space-week__steps space-week__steps--words" aria-label="Badges">
          {week.steps.map((st, i) => {
            const done = week.progress.includes(i);
            return (
              <li key={st.label}>
                {signedIn ? (
                  <button type="button" className={`space-week__pill${done ? " is-done" : ""}`} aria-pressed={done} disabled={busy || done} onClick={() => onStep(i)}>
                    {done && <IconCheck size={14} aria-hidden="true" />}{st.label.replace(/ Badge$/, "")}
                  </button>
                ) : <span className="space-week__pill">{st.label.replace(/ Badge$/, "")}</span>}
              </li>
            );
          })}
        </ul>
      ) : c.type === "party" ? (
        <div className="space-week__party">
          {week.done ? <span className="space-today__done"><IconCheck size={18} aria-hidden="true" /> You won it</span>
            : signedIn ? <Button variant="secondary" className="space-today__main" disabled={busy} onClick={() => onStep(0)}>We won it</Button>
            : <Link href={join} className="space-today__main space-today__link">We won it</Link>}
        </div>
      ) : null}
    </div>
  );
}
