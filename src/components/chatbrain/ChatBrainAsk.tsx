"use client";

/**
 * The one-question Chat Brain card, for places people have just finished
 * something: the Daily and Weekly end screens, the homepage, the end of a live
 * night. Answer in one tap, see how many others said the same ("You and 6
 * others said that"), then answer another or skip. Shows the seeding progress
 * toward launch underneath. Hides itself entirely when Chat Brain isn't open
 * or there's nothing to ask.
 *
 * `source` is recorded on each answer (daily, weekly, home, night) so the
 * admin can see which surface works. `frameClass` swaps the CDS Card frame for
 * a host's own card class (the homepage module), so its tiles match.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Progress } from "@empac/cascadeds";
import { IconBrain, IconUser, IconUserFilled } from "@tabler/icons-react";
import { CategoryIcon } from "@/components/chatbrain/brainIcons";
import { AudienceStep, useAudienceStep } from "@/components/chatbrain/AudienceStep";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { brainAnonId } from "@/lib/chatbrain/anon";
import { FOUNDING_BRAIN_ANSWERS, sameLine } from "@/lib/chatbrain/rules";

interface SeedProgress { answers: number; boards: number; goal: number }
interface Ask { id: string; text: string; category: string }

export function ChatBrainAsk({ source, eyebrow = "Help build a new game", title = "One more before you go?", frameClass }: {
  source: string; eyebrow?: string; title?: string; frameClass?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [prompt, setPrompt] = useState<Ask | null | undefined>(undefined);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [skip, setSkip] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<{ text: string; category: string; answer: string; same: number } | null>(null);
  const [given, setGiven] = useState(0);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const audience = useAudienceStep();

  const load = useCallback(async (skipIds: string[]) => {
    const q = new URLSearchParams({ view: "card" });
    if (skipIds.length) q.set("skip", skipIds.join(","));
    if (!user) q.set("anon", brainAnonId());
    const j = await fetch(`/api/chat-brain?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok || !j.ready) { setReady(false); setPrompt(null); return; }
    setReady(true);
    setProgress(j.progress);
    setPrompt(j.prompt);
  }, [user]);
  useEffect(() => { void load([]); }, [load]);

  const next = (ids: string[]) => { setResult(null); setDraft(""); setSkip(ids); setPrompt(undefined); void load(ids); };

  const send = async () => {
    if (!prompt || !draft.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/chat-brain/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, answer: draft.trim(), source, anonId: user ? undefined : brainAnonId(), turnstileToken: token ?? undefined, audience: audience.localAudience ?? undefined }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; same?: number; needsCaptcha?: boolean; message?: string; error?: string } | null;
      if (j?.needsCaptcha) { setCaptcha(true); toast.info("Quick check first, then send again."); return; }
      if (!j?.ok && j?.error !== "already_answered") { toast.error(j?.message ?? "That didn't save. Try again."); return; }
      if (!j?.ok) { next([...skip, prompt.id]); return; }
      setCaptcha(false);
      setResult({ text: prompt.text, category: prompt.category, answer: draft.trim(), same: j.same ?? 0 });
      setGiven((n) => n + 1);
      setProgress((p) => (p ? { ...p, answers: p.answers + 1 } : p));
    } finally { setBusy(false); }
  };

  // Nothing to show: not open yet, or still loading the first question.
  if (!ready || (prompt === undefined && !result)) return null;

  const body = (
    <div className="brain-ask">
      <div className="brain-ask__head">
        <span className="brain-ask__mark" aria-hidden><IconBrain size={22} stroke={1.75} /></span>
        <div className="brain-ask__headtext">
          <span className="home-play__eyebrow">{eyebrow}</span>
          <h3 className={frameClass ? "home-play__title" : "brain-ask__title"}>{title}</h3>
        </div>
      </div>

      {result ? (
        <div className="brain-ask__result" aria-live="polite">
          <CategoryTag slug={result.category} />
          <p className="brain-ask__q">{result.text}</p>
          <Crowd same={result.same} />
          <p className="brain-ask__said"><strong>{result.answer}</strong> · {sameLine(result.same)}</p>
          <div className="party-row">
            <Button variant="primary" size="small" onClick={() => next([...skip, ...(prompt ? [prompt.id] : [])])}>Answer another</Button>
            <Link href="/chat-brain"><Button variant="ghost" size="small">All questions</Button></Link>
          </div>
          {audience.needsAsking && <AudienceStep suggested={audience.suggested} signedIn={audience.signedIn} onDone={audience.done} />}
          {user && given >= 3 && <p className="brain-ask__fine">Answer {FOUNDING_BRAIN_ANSWERS} before launch to earn the Founding Brain badge on your profile.</p>}
          {!user && given >= 2 && <p className="brain-ask__fine"><Link href="/login?redirect=/chat-brain">Sign in</Link> and answer {FOUNDING_BRAIN_ANSWERS} before launch for the Founding Brain badge.</p>}
        </div>
      ) : prompt ? (
        <form className="brain-ask__form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <CategoryTag slug={prompt.category} />
          <label className="brain-ask__q" htmlFor={`brain-ask-${source}`}>{prompt.text}</label>
          <div className="brain-ask__row">
            <Input id={`brain-ask-${source}`} value={draft} maxLength={40} placeholder="First thing that comes to mind" onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" variant="primary" disabled={busy || !draft.trim()}>Send</Button>
          </div>
          {captcha && !user && <TurnstileWidget onToken={setToken} />}
          <div className="party-row">
            <Button type="button" variant="ghost" size="small" onClick={() => next([...skip, prompt.id])}>Skip this one</Button>
            <Link href="/chat-brain" className="brain-ask__link">What&apos;s Chat Brain?</Link>
          </div>
        </form>
      ) : (
        <p className="brain-ask__said">You&apos;ve answered every open question. Thanks for helping build Chat Brain! New ones arrive every week.</p>
      )}

      {progress && <BrainProgressBar progress={progress} />}
    </div>
  );

  return frameClass ? <div className={frameClass}>{body}</div> : <Card variant="outlined" padding="large" className="brain-ask-card">{body}</Card>;
}

/** "1,240 answers · 4 of 30 boards ready", with a bar toward launch. Shared with the hub page. */
export function BrainProgressBar({ progress }: { progress: SeedProgress }) {
  // Boards are the goal, but they arrive in steps; answers toward the launch
  // total (goal x the 50-answer target) keep the bar moving with every answer.
  const pct = Math.min(100, Math.round(Math.max(progress.boards / Math.max(1, progress.goal), progress.answers / (Math.max(1, progress.goal) * 50)) * 100));
  return (
    <div className="brain-ask__progress">
      <Progress value={pct} size="small" aria-label="Boards ready toward launch" />
      <span>{progress.answers.toLocaleString()} answers so far · {progress.boards} of {progress.goal} boards ready for launch</span>
    </div>
  );
}

const CATEGORY_NAMES: Record<string, string> = {
  "game-night": "Game night", gaming: "Gaming", "mario-kart": "Mario Kart", food: "Food",
  family: "Family", streaming: "Streaming", "school-work": "School and work", everyday: "Everyday life",
};

function CategoryTag({ slug }: { slug: string }) {
  return <span className="brain-ask__cat"><CategoryIcon slug={slug} size={14} />{CATEGORY_NAMES[slug] ?? "Chat Brain"}</span>;
}

/** You, then one figure per person who said the same (up to 7, then "+N"). */
function Crowd({ same }: { same: number }) {
  const shown = Math.min(same, 7);
  return (
    <span className="brain-ask__crowd" aria-hidden>
      <span className="brain-ask__you"><IconUserFilled size={20} /></span>
      {Array.from({ length: shown }, (_, i) => <IconUser key={i} size={20} stroke={1.75} style={{ animationDelay: `${80 + i * 60}ms` }} />)}
      {same > shown && <span className="brain-ask__more">+{same - shown}</span>}
    </span>
  );
}
