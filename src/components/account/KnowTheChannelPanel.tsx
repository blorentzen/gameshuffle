"use client";

/**
 * Break mode ▸ Know the Channel: the questions chat gets about this channel.
 * Add one by hand (it goes straight in), or fill in a short questionnaire and
 * let AI draft up to 15 from it (drafts to keep or toss). Mods with Full
 * access manage the same list from the mod page. API: /api/break/questions.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, Input, Modal, Textarea } from "@empac/cascadeds";
import { IconMessageQuestion } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminSection } from "@/components/account/admin/AdminKit";
import { useAiAccess } from "@/components/ai/useAiAccess";
import { AiGatePrompt, allowanceText } from "@/components/ai/AiGate";

interface Question { id: string; prompt: string; answer: string; accept: string[]; status: "draft" | "approved" | "retired"; origin: "streamer" | "mod" | "ai" }

const EMPTY_FORM = { games: "", main: "", facts: "", jokes: "", community: "" };

export function KnowTheChannelPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<{ ready: boolean; questions: Question[] } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [also, setAlso] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [gate, setGate] = useState(false);
  const ai = useAiAccess("channel");

  const load = useCallback(async () => {
    const r = await fetch("/api/break/questions", { cache: "no-store" }).then((res) => res.json()).catch(() => null);
    if (r?.ok) setList({ ready: r.ready, questions: r.questions });
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const call = async (method: string, body: unknown, ok: string) => {
    const r = await fetch("/api/break/questions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (res) => ({ ok: res.ok, j: await res.json().catch(() => ({})) })).catch(() => ({ ok: false, j: {} as { message?: string } }));
    if (!r.ok) { toast.error((r.j as { message?: string }).message ?? "That didn't save. Try again."); return false; }
    toast.success(ok);
    void load();
    return true;
  };

  const add = async () => {
    setBusy("add");
    const saved = await call("POST", { questions: [{ prompt, answer, accept: also.split(",").map((x) => x.trim()).filter(Boolean) }] }, "Question added");
    setBusy(null);
    if (saved) { setPrompt(""); setAnswer(""); setAlso(""); }
  };

  const draft = async () => {
    if (ai.block) { setGate(true); return; }
    setBusy("draft");
    const r = await fetch("/api/break/questions/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionnaire: form }) })
      .then(async (res) => ({ ok: res.ok, j: await res.json().catch(() => ({})) })).catch(() => ({ ok: false, j: {} as Record<string, unknown> }));
    setBusy(null);
    const j = r.j as { added?: Question[]; remaining?: number | null; error?: string };
    if (!r.ok) {
      toast.error(j.error === "too_little" ? "Tell us a bit more about your channel first." : j.error === "not_ready" ? "Know the Channel needs a database update first." : "We couldn't draft questions right now. Try again in a minute.");
      return;
    }
    ai.spent(j.remaining ?? null);
    toast.success(`${j.added?.length ?? 0} drafts added. Keep the good ones.`);
    setDrafting(false);
    void load();
  };

  const drafts = list?.questions.filter((q) => q.status === "draft") ?? [];
  const live = list?.questions.filter((q) => q.status === "approved") ?? [];

  return (
    <AdminSection title="Know the Channel" intro="Questions about your channel that chat answers on a break. Only kept questions are asked, and none repeats within 30 days. Your mods with Full access can add them too.">
      {!list ? (
        <LoadingLines label="Loading questions" />
      ) : !list.ready ? (
        <Alert variant="info">Know the Channel needs a quick database update (break-mode-m2) before it can save questions.</Alert>
      ) : (
        <div className="ktc">
          <div className="ktc__add">
            <Input id="ktc-prompt" floatingLabel="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={160} fullWidth />
            <div className="ktc__row">
              <Input id="ktc-answer" floatingLabel="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={60} />
              <Input id="ktc-also" floatingLabel="Also accept (comma-separated)" value={also} onChange={(e) => setAlso(e.target.value)} />
            </div>
            <div className="ktc__actions">
              <Button size="small" variant="primary" loading={busy === "add"} disabled={busy === "add" || prompt.trim().length < 5 || !answer.trim()} onClick={() => void add()}>Add question</Button>
              <Button size="small" variant="secondary" onClick={() => setDrafting(true)}>Draft with AI</Button>
            </div>
          </div>

          {drafts.length > 0 && (
            <div className="ktc__group">
              <h3 className="ktc__h">Drafts to check ({drafts.length})</h3>
              <ul className="ktc__list">
                {drafts.map((q) => (
                  <li key={q.id} className="ktc__item">
                    <div className="ktc__text">
                      <p className="ktc__q">{q.prompt}</p>
                      <p className="ktc__a">{q.answer}{q.accept.length ? ` · also ${q.accept.join(", ")}` : ""}</p>
                    </div>
                    <div className="ktc__item-actions">
                      <Button size="small" variant="secondary" onClick={() => void call("PATCH", { id: q.id, status: "approved" }, "Kept")}>Keep</Button>
                      <Button size="small" variant="ghost" onClick={() => void call("DELETE", { id: q.id }, "Tossed")}>Toss</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ktc__group">
            <h3 className="ktc__h">Asked on breaks ({live.length})</h3>
            {live.length === 0 ? (
              <EmptyState variant="bordered" icon={<IconMessageQuestion size={28} />} title="No questions yet" description="Add a few above, or draft some with AI. The game skips itself until there are some." />
            ) : (
              <ul className="ktc__list">
                {live.map((q) => (
                  <li key={q.id} className="ktc__item">
                    <div className="ktc__text">
                      <p className="ktc__q">{q.prompt}</p>
                      <p className="ktc__a">
                        {q.answer}{q.accept.length ? ` · also ${q.accept.join(", ")}` : ""}
                        {q.origin === "mod" && <> · <Badge size="small" variant="default">From a mod</Badge></>}
                      </p>
                    </div>
                    <div className="ktc__item-actions">
                      <Button size="small" variant="ghost" onClick={async () => {
                        if (await confirm({ title: "Remove this question?", body: q.prompt, confirmLabel: "Remove" })) void call("DELETE", { id: q.id }, "Removed");
                      }}>Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={drafting}
        onClose={() => setDrafting(false)}
        title="Draft questions with AI"
        size="medium"
        primaryAction={{ label: busy === "draft" ? "Drafting…" : "Draft 15 questions", onClick: () => { if (busy !== "draft") void draft(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setDrafting(false) }}
      >
        <div className="ktc__form">
          <p className="ktc__lead">AI writes questions from what you put here and nothing else. They arrive as drafts for you to keep or toss. {allowanceText(ai.info)}</p>
          <Input id="ktc-games" floatingLabel="Games you play most" value={form.games} onChange={(e) => setForm({ ...form, games: e.target.value })} maxLength={300} fullWidth />
          <Input id="ktc-main" floatingLabel="Your favorite character or main" value={form.main} onChange={(e) => setForm({ ...form, main: e.target.value })} maxLength={200} fullWidth />
          <Textarea id="ktc-facts" floatingLabel="Channel facts viewers should know (one per line)" fullWidth value={form.facts} onChange={(e) => setForm({ ...form, facts: e.target.value })} maxLength={1500} rows={4} />
          <Textarea id="ktc-jokes" floatingLabel="Running jokes and catchphrases" fullWidth value={form.jokes} onChange={(e) => setForm({ ...form, jokes: e.target.value })} maxLength={800} rows={3} />
          <Textarea id="ktc-community" floatingLabel="Your community's name, emotes or traditions" fullWidth value={form.community} onChange={(e) => setForm({ ...form, community: e.target.value })} maxLength={600} rows={3} />
        </div>
      </Modal>
      {ai.info && ai.block && <AiGatePrompt info={ai.info} block={ai.block} isOpen={gate} onClose={() => setGate(false)} />}
    </AdminSection>
  );
}
