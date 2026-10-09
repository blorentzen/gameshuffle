"use client";

/**
 * Platform ▸ Trivia (staff): the GameShuffle question pack hosts fill their
 * nights from. Questions arrive as drafts (the starter pack in
 * src/data/originals/trivia-pack.ts) and reach hosts only once approved, so
 * every answer is checked against its source first. Fix a wording or an
 * answer line in place; retire anything wrong or dated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Select, Tabs, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AnswerLine } from "@/components/trivia/TriviaStudio";
import type { LibraryQuestion, PackCounts } from "@/lib/trivia/store";
import "@/styles/trivia.css";

type Status = "draft" | "approved" | "retired";
interface Data { ready: boolean; questions: LibraryQuestion[]; counts: PackCounts; bank: { total: number; missing: number } }

const LANES: { id: Status; label: string }[] = [
  { id: "draft", label: "To check" },
  { id: "approved", label: "Approved" },
  { id: "retired", label: "Retired" },
];
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function PlatformTriviaTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [lane, setLane] = useState<Status>("draft");
  const [cat, setCat] = useState("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<LibraryQuestion | null>(null);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    const j = await fetch("/api/admin/trivia", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      // First load with nothing to check: open on the approved list.
      if (firstLoad.current && j.counts.draft === 0 && j.counts.approved > 0) setLane("approved");
      firstLoad.current = false;
      setData({ ready: true, questions: j.questions, counts: j.counts, bank: j.bank });
    }
    else setData({ ready: j?.error !== "not_ready", questions: [], counts: { draft: 0, approved: 0, retired: 0 }, bank: { total: 0, missing: 0 } });
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error("That didn't save."); return null; }
      await load();
      return j;
    } finally { setBusy(false); }
  };

  const importBank = async () => {
    const j = await post({ action: "import" });
    if (!j) return;
    const invalid = (j.invalid as string[]).length;
    toast.success(`Added ${j.added} question${j.added === 1 ? "" : "s"} to check${invalid ? `. ${invalid} didn't pass validation` : ""}`);
    setLane("draft");
  };

  const setStatus = async (ids: string[], status: Status, msg: string) => {
    const j = await post({ action: "status", ids, status });
    if (j) toast.success(msg);
  };

  const inLane = useMemo(() => (data?.questions ?? []).filter((q) => q.status === lane), [data, lane]);
  const cats = useMemo(() => [...new Set(inLane.map((q) => q.category ?? "General"))].sort(), [inLane]);
  const activeCat = cats.includes(cat) ? cat : "all";
  const shown = inLane.filter((q) => activeCat === "all" || q.category === activeCat);

  const approveShown = async () => {
    const ok = await confirm({
      title: `Approve ${shown.length} question${shown.length === 1 ? "" : "s"}?`,
      body: "Hosts can add them to their nights straight away. Only approve what you've checked against the sources.",
      confirmLabel: `Approve ${shown.length}`,
    });
    if (ok) await setStatus(shown.map((q) => q.id), "approved", `Approved ${shown.length}`);
  };

  if (!data) return <div className="account-card"><LoadingLines label="Loading" /></div>;
  if (!data.ready) return <Alert variant="warning">Trivia needs supabase/trivia-m1.sql on this database.</Alert>;

  const list = (
    <div className="trivia-admin">
      <div className="trivia-admin__bar">
        {cats.length > 1 && (
          <Select floatingLabel="Category" value={activeCat} onChange={(v) => setCat(String(v))}
            options={[{ value: "all", label: `Every category (${inLane.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${inLane.filter((q) => q.category === c).length})` }))]} />
        )}
        {lane === "draft" && shown.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => void approveShown()}>Approve all {shown.length} shown</Button>}
      </div>
      {shown.length === 0 ? (
        <p className="dbot-muted">{lane === "draft" ? "Nothing to check." : lane === "approved" ? "No approved questions yet: hosts see an empty pack." : "Nothing retired."}</p>
      ) : (
        <ul className="trivia-library">
          {shown.map((q) => (
            <li key={q.id} className={`trivia-lib-q${q.status === "draft" ? " is-draft" : ""}`}>
              <div className="trivia-lib-q__head">
                <span className="trivia-muted">{q.category} · {q.difficulty}{q.kind !== "text" ? ` · ${q.kind}` : ""}</span>
              </div>
              <p className="trivia-lib-q__prompt">{q.prompt}</p>
              {q.kind === "choice" && q.options && <p className="trivia-muted">Choices: {q.options.join(" · ")}</p>}
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- the question's picture, from our own art
                <img className="trivia-lib-q__pic" src={q.imageUrl} alt="" loading="lazy" />
              )}
              <AnswerLine q={q} />
              <div className="trivia-row">
                {q.status === "draft" && <Button variant="primary" size="small" disabled={busy} onClick={() => void setStatus([q.id], "approved", "Approved")}>Approve</Button>}
                {q.status !== "retired" && <Button variant="secondary" size="small" disabled={busy} onClick={() => setEditing(q)}>Edit</Button>}
                {q.status === "approved" && <Button variant="ghost" size="small" disabled={busy} onClick={() => void setStatus([q.id], "draft", "Moved back to check")}>Back to check</Button>}
                {q.status !== "retired" && <Button variant="ghost" size="small" disabled={busy} onClick={() => void setStatus([q.id], "retired", "Retired")}>Retire</Button>}
                {q.status === "retired" && <Button variant="secondary" size="small" disabled={busy} onClick={() => void setStatus([q.id], "draft", "Back in the queue")}>Put back to check</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="trivia-admin__wrap">
      <div className="account-card">
        <h3 className="account-card__title">GameShuffle trivia pack</h3>
        <p className="dbot-muted">
          Hosts fill their nights from approved questions here (one tap fills a whole night). {data.counts.approved} approved, {data.counts.draft} to check, {data.counts.retired} retired.
          Check each answer against its source before approving, and retire anything wrong or out of date.
        </p>
        <div className="trivia-row">
          <Button variant="primary" disabled={busy || data.bank.missing === 0} onClick={() => void importBank()}>
            {data.bank.missing === 0 ? "Starter pack added" : `Add the starter pack (${data.bank.missing} new)`}
          </Button>
        </div>
        <p className="dbot-muted">The starter pack is {data.bank.total} questions across general knowledge, geography, science, history, games, film and TV, music, sports, food and words, plus picture rounds of game characters and Overwatch heroes. Adding skips any already here.</p>
      </div>

      <Tabs variant="underline" activeTab={lane} onChange={(id) => setLane(id as Status)}
        tabs={LANES.map((l) => ({ id: l.id, label: `${l.label} (${data.counts[l.id]})`, content: lane === l.id ? list : null }))} />

      {editing && <EditQuestion q={editing} busy={busy} onClose={() => setEditing(null)}
        onSave={async (question) => { const j = await post({ action: "update", id: editing.id, question }); if (j) { toast.success("Saved"); setEditing(null); } }} />}
    </div>
  );
}

function EditQuestion({ q, busy, onClose, onSave }: { q: LibraryQuestion; busy: boolean; onClose: () => void; onSave: (question: Record<string, unknown>) => Promise<void> }) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer);
  const [accept, setAccept] = useState(q.accept.join(", "));
  const [askAbout, setAskAbout] = useState(q.askAbout.join(", "));
  const [reject, setReject] = useState(q.reject.join(", "));
  const [difficulty, setDifficulty] = useState<string>(q.difficulty ?? "medium");
  return (
    <Modal isOpen onClose={onClose} title="Edit question" size="medium">
      <div className="trivia-form">
        <Textarea floatingLabel="Question" value={prompt} maxLength={300} rows={2} onChange={(e) => setPrompt(e.target.value)} />
        <Input fullWidth floatingLabel="Answer" value={answer} maxLength={120} onChange={(e) => setAnswer(e.target.value)} />
        <Input fullWidth floatingLabel="Also accept (commas between)" value={accept} onChange={(e) => setAccept(e.target.value)} />
        <Input fullWidth floatingLabel="Ask the host about (commas between)" value={askAbout} onChange={(e) => setAskAbout(e.target.value)} />
        <Input fullWidth floatingLabel="Reject (commas between)" value={reject} onChange={(e) => setReject(e.target.value)} />
        <Select floatingLabel="Difficulty" value={difficulty} onChange={(v) => setDifficulty(String(v))}
          options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
        <div className="trivia-row">
          <Button variant="primary" disabled={busy} onClick={() => void onSave({ prompt, answer, accept: splitList(accept), askAbout: splitList(askAbout), reject: splitList(reject), difficulty, kind: q.kind, options: q.options, imageUrl: q.imageUrl, category: q.category ?? undefined, sources: q.sources, asOf: q.asOf, changeable: q.changeable })}>Save</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
