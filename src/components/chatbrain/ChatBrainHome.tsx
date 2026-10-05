"use client";

/**
 * /chat-brain (and /chat-brain/q/<id> for one shared question): the game's home
 * while it's being built. Explains the premise (a hero band, how it works, an
 * example board, the three ways to play at launch), shows launch progress with
 * "email me when it opens" and the account option, then every open question
 * with a one-tap answer box.
 *
 * Share links land here with ?prompt=<id> (that prompt first) and
 * ?src=<platform> (recorded as the answer's source). Signed-out visitors answer
 * as their browser and pass a quick check on their first answer.
 */

import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, Chip, Container, Input, Progress } from "@empac/cascadeds";
import {
  IconBroadcast, IconCalendarEvent, IconChartBar, IconDice5, IconMailForward, IconMessageCircle, IconTrophy, IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { BrowseHero } from "@/components/events/BrowseHero";
import { BrainProgressBar } from "@/components/chatbrain/ChatBrainAsk";
import { CategoryIcon } from "@/components/chatbrain/brainIcons";
import { AudienceStep, useAudienceStep } from "@/components/chatbrain/AudienceStep";
import { brainAnonId } from "@/lib/chatbrain/anon";
import { EVENTS, track } from "@/lib/analytics/events";
import { FOUNDING_BRAIN_ANSWERS, sameLine } from "@/lib/chatbrain/rules";

interface Category { slug: string; name: string; description: string | null; openPrompts: number }
interface Prompt { id: string; text: string; category: string; minAnswers: number; answers: number; answered: boolean }
interface SeedProgress { answers: number; boards: number; goal: number }

const SOURCES = new Set(["x", "bluesky", "reddit", "instagram", "tiktok", "discord", "twitch", "email"]);

const STEPS = [
  { Icon: IconMessageCircle, title: "You answer", text: "Quick questions, first thing that comes to mind. About five seconds each, and every answer is anonymous." },
  { Icon: IconChartBar, title: "The crowd adds up", text: "Matching answers are grouped and ranked. The more people say it, the more points it's worth on the board." },
  { Icon: IconTrophy, title: "You guess the board", text: "Find the top answers before three strikes. The trick is thinking like everyone else, not like yourself." },
];

const MODES = [
  { Icon: IconCalendarEvent, title: "Every day", text: "A new board each day to play solo, with a streak to keep, next to the Daily Shuffle." },
  { Icon: IconDice5, title: "At game night", text: "Pass one phone around, or put the board on the TV and play from everyone's phones." },
  { Icon: IconBroadcast, title: "On stream", text: "Chat guesses together while you host. Face off against another channel's chat. GS Pro." },
];

// An illustration of how a board plays: made-up numbers, labelled as an example.
const EXAMPLE = {
  question: "Name something you bring to a game night",
  rows: [{ label: "Snacks", points: 38 }, { label: "A board game", points: 24 }, { label: "Drinks", points: 17 }, { label: "Friends", points: 11 }, { label: "Dice", points: 6 }],
  revealed: 2,
  strikes: 2,
};

export function ChatBrainHome({ focus: focusProp }: { focus?: string } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const focus = focusProp ?? params.get("prompt");
  const srcParam = (params.get("src") ?? "").toLowerCase();
  const source = SOURCES.has(srcParam) ? (srcParam === "discord" || srcParam === "twitch" ? srcParam : `share:${srcParam}`) : "site";
  const [category, setCategory] = useState<string | null>(params.get("category"));
  const [data, setData] = useState<{ ready: boolean; categories: Category[]; prompts: Prompt[]; progress: SeedProgress | null } | null>(null);
  const [said, setSaid] = useState<Record<string, { answer: string; same: number }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [captchaFor, setCaptchaFor] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const audience = useAudienceStep();

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (!user) q.set("anon", brainAnonId());
    const j = await fetch(`/api/chat-brain?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setData(j);
  }, [category, user]);
  useEffect(() => { void load(); }, [load]);

  const prompts = useMemo(() => {
    const list = data?.prompts ?? [];
    return focus ? [...list].sort((a, b) => Number(b.id === focus) - Number(a.id === focus)) : list;
  }, [data, focus]);

  const send = async (p: Prompt) => {
    const answer = (drafts[p.id] ?? "").trim();
    if (!answer) return;
    setBusy(p.id);
    try {
      const r = await fetch("/api/chat-brain/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: p.id, answer, source, anonId: user ? undefined : brainAnonId(), turnstileToken: token ?? undefined, audience: audience.localAudience ?? undefined }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; same?: number; needsCaptcha?: boolean; message?: string } | null;
      if (j?.needsCaptcha) { setCaptchaFor(p.id); toast.info("Quick check first, then send again."); return; }
      if (!j?.ok) { toast.error(j?.message ?? "That didn't save. Try again."); return; }
      setCaptchaFor(null);
      track(EVENTS.brainAnswered, { source });
      setData((cur) => cur ? { ...cur, progress: cur.progress ? { ...cur.progress, answers: cur.progress.answers + 1 } : null, prompts: cur.prompts.map((x) => (x.id === p.id ? { ...x, answered: true, answers: x.answers + 1 } : x)) } : cur);
      setSaid((cur) => ({ ...cur, [p.id]: { answer, same: j.same ?? 0 } }));
    } finally { setBusy(null); }
  };

  return (
    <main className="chat-brain-page">
      <BrowseHero
        eyebrow="A GameShuffle Original · coming soon"
        title="Chat Brain"
        sub="Guess what everyone else said. We ask real people quick questions, and the most popular answers become the boards you play."
        accent="violet"
        field="brain"
        primary={{ href: "#answer", label: "Answer a question" }}
        secondary={{ href: "#updates", label: "Get launch updates" }}
      />

      <Container className="chat-brain">
        <section className="cb-section" aria-labelledby="cb-how">
          <h2 id="cb-how" className="cb-h2">How it works</h2>
          <ResponsiveCarousel className="cb-tiles" label="How Chat Brain works">
            {STEPS.map(({ Icon, title, text }) => (
              <Card key={title} variant="outlined" padding="medium" className="cb-tile">
                <span className="cb-tile__icon" aria-hidden><Icon size={24} stroke={1.75} /></span>
                <h3 className="cb-tile__title">{title}</h3>
                <p className="cb-tile__text">{text}</p>
              </Card>
            ))}
          </ResponsiveCarousel>
        </section>

        <section className="cb-section cb-example" aria-labelledby="cb-example">
          <div className="cb-example__copy">
            <span className="home-play__eyebrow">Example board</span>
            <h2 id="cb-example" className="cb-h2">{EXAMPLE.question}</h2>
            <p className="cb-muted">Every board is a real question with real answers behind it. Points show how many people gave each answer, out of 100. Two found, two strikes: one more miss and the round is over.</p>
          </div>
          <div className="cb-board" role="img" aria-label="An example board with two answers found and two strikes">
            {EXAMPLE.rows.map((r, i) => (
              <div key={r.label} className={`cb-board__row${i < EXAMPLE.revealed ? " is-open" : ""}`}>
                <span className="cb-board__rank">{i + 1}</span>
                <span className="cb-board__label">{i < EXAMPLE.revealed ? r.label : ""}</span>
                <span className="cb-board__pts">{i < EXAMPLE.revealed ? r.points : ""}</span>
              </div>
            ))}
            <div className="cb-board__strikes">
              {Array.from({ length: 3 }, (_, i) => <span key={i} className={i < EXAMPLE.strikes ? "is-on" : ""}><IconX size={18} stroke={3} /></span>)}
            </div>
          </div>
        </section>

        <section className="cb-section" aria-labelledby="cb-modes">
          <h2 id="cb-modes" className="cb-h2">Three ways to play at launch</h2>
          <ResponsiveCarousel className="cb-tiles" label="Three ways to play">
            {MODES.map(({ Icon, title, text }) => (
              <Card key={title} variant="outlined" padding="medium" className="cb-tile">
                <span className="cb-tile__icon cb-tile__icon--accent" aria-hidden><Icon size={24} stroke={1.75} /></span>
                <h3 className="cb-tile__title">{title}</h3>
                <p className="cb-tile__text">{text}</p>
              </Card>
            ))}
          </ResponsiveCarousel>
        </section>

        {data?.ready && data.progress && <LaunchPanel progress={data.progress} signedIn={!!user} />}

        <section id="answer" className="cb-section" aria-labelledby="cb-answer">
          <h2 id="cb-answer" className="cb-h2">Answer a few</h2>
          {data && !data.ready && <p className="chat-brain__empty">Chat Brain isn&apos;t open yet. Check back soon.</p>}
          {data?.ready && (
            <>
              <div className="chat-brain__cats" role="group" aria-label="Categories">
                <Chip label="All" clickable selected={!category} onClick={() => setCategory(null)} />
                {data.categories.map((c) => (
                  <Chip key={c.slug} icon={<CategoryIcon slug={c.slug} size={14} />} label={c.openPrompts ? `${c.name} · ${c.openPrompts}` : c.name} clickable selected={category === c.slug}
                    onClick={() => setCategory(category === c.slug ? null : c.slug)} />
                ))}
              </div>

              {prompts.length === 0 ? (
                <p className="chat-brain__empty">No questions open here right now. Try another category.</p>
              ) : (
                <ul className="chat-brain__prompts">
                  {prompts.map((p) => {
                    const need = Math.max(0, p.minAnswers - p.answers);
                    return (
                      <li key={p.id} className={`chat-brain__prompt${p.id === focus ? " is-focus" : ""}`}>
                        <span className="brain-ask__cat"><CategoryIcon slug={p.category} size={14} />{data.categories.find((c) => c.slug === p.category)?.name ?? "Chat Brain"}</span>
                        <p className="chat-brain__q">{p.text}</p>
                        {said[p.id] ? (
                          <>
                            <p className="chat-brain__said" aria-live="polite"><strong>{said[p.id].answer}</strong> · {sameLine(said[p.id].same)}</p>
                            {audience.needsAsking && Object.keys(said)[0] === p.id && <AudienceStep suggested={audience.suggested} signedIn={audience.signedIn} onDone={audience.done} />}
                          </>
                        ) : p.answered ? (
                          <Badge variant="success" size="small">Answered</Badge>
                        ) : (
                          <form className="chat-brain__answer" onSubmit={(e) => { e.preventDefault(); void send(p); }}>
                            <Input value={drafts[p.id] ?? ""} maxLength={40} placeholder="First thing that comes to mind" aria-label={`Your answer: ${p.text}`}
                              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))} />
                            <Button type="submit" variant="primary" disabled={busy === p.id || !(drafts[p.id] ?? "").trim()}>Send</Button>
                          </form>
                        )}
                        {captchaFor === p.id && !user && <TurnstileWidget onToken={setToken} />}
                        <div className="chat-brain__progress">
                          <Progress value={Math.min(100, Math.round((p.answers / p.minAnswers) * 100))} size="small" aria-label="Answers so far" />
                          <span>{need > 0 ? `Needs ${need} more answer${need === 1 ? "" : "s"} to become a board` : "Enough answers for a board"}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="chat-brain__fine">Answers are anonymous and only ever shown grouped with everyone else&apos;s, after review.</p>
            </>
          )}
        </section>
      </Container>
    </main>
  );
}

const JOINED_KEY = "gs-brain-updates";

/** Launch progress, "email me when it opens", and the account option. */
function LaunchPanel({ progress, signedIn }: { progress: SeedProgress; signedIn: boolean }) {
  const toast = useToast();
  const [configured, setConfigured] = useState(false);
  const [joined, setJoined] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => { try { setJoined(window.localStorage.getItem(JOINED_KEY) === "1"); } catch { /* fine */ } });
    void fetch("/api/chat-brain/updates").then((r) => r.json()).then((j) => setConfigured(!!j?.configured)).catch(() => {});
  }, []);

  const join = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/chat-brain/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signedIn ? {} : { email }) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "bad_email" || j?.error === "email_required" ? "Check that email address and try again." : "Couldn't add you just now. Try again."); return; }
      try { window.localStorage.setItem(JOINED_KEY, "1"); } catch { /* fine */ }
      setJoined(true);
      track(EVENTS.brainUpdatesSignup, { signedIn });
      toast.success("You're on the list");
    } finally { setBusy(false); }
  };

  return (
    <section id="updates" className="chat-brain__launch" aria-labelledby="cb-launch">
      <div className="cb-launch__head">
        <span className="cb-tile__icon" aria-hidden><IconMailForward size={24} stroke={1.75} /></span>
        <div>
          <h2 id="cb-launch">Help build the first boards</h2>
          <p className="cb-muted">Chat Brain opens at {progress.goal} boards. Every answer gets it closer.</p>
        </div>
      </div>
      <BrainProgressBar progress={progress} />
      {configured && (joined ? (
        <p className="cb-joined">You&apos;re on the list. We&apos;ll email you the day Chat Brain opens.</p>
      ) : signedIn ? (
        <div><Button variant="primary" disabled={busy} onClick={() => void join()}>Email me when it opens</Button></div>
      ) : (
        <form className="chat-brain__answer" onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <Input type="email" value={email} placeholder="you@example.com" aria-label="Email for launch updates" onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !email.includes("@")}>Notify me</Button>
        </form>
      ))}
      {signedIn ? (
        <p className="chat-brain__fine">Answer {FOUNDING_BRAIN_ANSWERS} before launch to earn the Founding Brain badge on your profile.</p>
      ) : (
        <p className="chat-brain__fine"><Link href="/signup?redirect=/chat-brain">Create a free account</Link> to play the day it opens. Answer {FOUNDING_BRAIN_ANSWERS} while signed in and you get the Founding Brain badge on your profile.</p>
      )}
    </section>
  );
}
