"use client";

/**
 * /chat-brain (and /chat-brain/q/<id> for one shared question): the categories page and the seeding surface. Every category,
 * the prompts open for answers ("needs 23 more"), and a one-tap answer box on
 * each. Share links land here with ?prompt=<id> (that prompt first) and
 * ?src=<platform> (recorded as the answer's source). Signed-out visitors answer
 * as their browser and pass a quick check on their first answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Chip, Container, Input, Progress } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { BrainProgressBar } from "@/components/chatbrain/ChatBrainAsk";
import { brainAnonId } from "@/lib/chatbrain/anon";
import { FOUNDING_BRAIN_ANSWERS, sameLine } from "@/lib/chatbrain/rules";

interface Category { slug: string; name: string; description: string | null; openPrompts: number }
interface Prompt { id: string; text: string; category: string; minAnswers: number; answers: number; answered: boolean }
interface SeedProgress { answers: number; boards: number; goal: number }

const SOURCES = new Set(["x", "bluesky", "reddit", "instagram", "tiktok", "discord", "twitch", "email"]);

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
        body: JSON.stringify({ promptId: p.id, answer, source, anonId: user ? undefined : brainAnonId(), turnstileToken: token ?? undefined }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; same?: number; needsCaptcha?: boolean; message?: string } | null;
      if (j?.needsCaptcha) { setCaptchaFor(p.id); toast.info("Quick check first, then send again."); return; }
      if (!j?.ok) { toast.error(j?.message ?? "That didn't save. Try again."); return; }
      setCaptchaFor(null);
      setData((cur) => cur ? { ...cur, progress: cur.progress ? { ...cur.progress, answers: cur.progress.answers + 1 } : null, prompts: cur.prompts.map((x) => (x.id === p.id ? { ...x, answered: true, answers: x.answers + 1 } : x)) } : cur);
      setSaid((cur) => ({ ...cur, [p.id]: { answer, same: j.same ?? 0 } }));
    } finally { setBusy(null); }
  };

  return (
    <Container as="main" className="chat-brain">
      <header className="chat-brain__hero">
        <p className="marketing-eyebrow">A GameShuffle Original · coming soon</p>
        <h1 className="chat-brain__title">Chat Brain</h1>
        <p className="chat-brain__lede">
          Answer a few quick questions with the first thing that comes to mind. The most popular answers become the boards in
          Chat Brain, the game where you win by thinking like everyone else.
        </p>
      </header>

      {data?.ready && data.progress && (
        <section className="chat-brain__launch" aria-label="Launch progress">
          <h2>Help build the first boards</h2>
          <ol className="chat-brain__how">
            <li>Answer with the first thing that comes to mind. Everything is anonymous.</li>
            <li>Once a question has enough answers, the most popular ones become a board.</li>
            <li>At {data.progress.goal} boards, Chat Brain opens: guess the top answers solo every day, at game night, or on stream.</li>
          </ol>
          <BrainProgressBar progress={data.progress} />
          <p className="chat-brain__fine">{user ? `Answer ${FOUNDING_BRAIN_ANSWERS} before launch to earn the Founding Brain badge on your profile.` : `Signed in, ${FOUNDING_BRAIN_ANSWERS} answers before launch earns the Founding Brain badge on your profile.`}</p>
        </section>
      )}

      {data && !data.ready && <p className="chat-brain__empty">Chat Brain isn&apos;t open yet. Check back soon.</p>}

      {data?.ready && (
        <>
          <div className="chat-brain__cats" role="group" aria-label="Categories">
            <Chip label="All" clickable selected={!category} onClick={() => setCategory(null)} />
            {data.categories.map((c) => (
              <Chip key={c.slug} label={c.openPrompts ? `${c.name} · ${c.openPrompts}` : c.name} clickable selected={category === c.slug}
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
                    <p className="chat-brain__q">{p.text}</p>
                    {said[p.id] ? (
                      <p className="chat-brain__said" aria-live="polite"><strong>{said[p.id].answer}</strong> · {sameLine(said[p.id].same)}</p>
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
    </Container>
  );
}
