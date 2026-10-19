"use client";

/**
 * Platform ▸ Trivia ▸ Four choices (staff): the wrong answers Fire Round's
 * four choices need (Britton's picks, 2026-10-19: drafted, then checked by a
 * person before solo play uses them), and how close each category is to
 * ~100 playable questions. Numbers and pictures get their wrong answers worked
 * out, so only word answers show here. Server side: src/lib/fireRound/choices.ts.
 */

import { useState } from "react";
import { Button, EmptyState, Input, Modal, Progress, Select } from "@empac/cascadeds";
import { IconChecks, IconListLetters, IconSparkles } from "@tabler/icons-react";
import { AdminPanel, AdminSection } from "@/components/account/admin/AdminKit";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { ChoiceQuestion, ChoicesAdmin } from "@/lib/fireRound/choices";

const PAGE = 25;
const ERRORS: Record<string, string> = {
  need_three: "Give three different wrong answers, none of them the answer.",
  counts_as_right: "One of those would count as the right answer (too close a spelling). Try another.",
  blocked: "One of those didn't pass the word filter.",
};

export function FireChoicesPanel({ choices, busy, post, reload }: {
  choices: ChoicesAdmin;
  busy: boolean;
  post: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cat, setCat] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<ChoiceQuestion | null>(null);
  const [drafting, setDrafting] = useState(false);

  if (!choices.ready) {
    return <EmptyState variant="bordered" icon={<IconListLetters size={28} />} title="Not set up yet" description="Fire Round's columns aren't on this database yet (supabase/fire-round-m1.sql)." />;
  }

  const cats = [...new Set(choices.waiting.map((q) => q.category))].sort();
  const activeCat = cats.includes(cat) ? cat : "all";
  const shown = choices.waiting.filter((q) => activeCat === "all" || q.category === activeCat);

  const approve = async (ids: string[]) => {
    const j = await post({ action: "wrong-approve", ids });
    if (j) toast.success(ids.length === 1 ? "Checked" : `Checked ${ids.length}`);
  };
  const approveShown = async () => {
    const ok = await confirm({
      title: `Approve wrong answers for ${shown.length} question${shown.length === 1 ? "" : "s"}?`,
      body: "Fire Round starts using them straight away. Only approve what you've read: none of the three may also be right.",
      confirmLabel: `Approve ${shown.length}`,
    });
    if (ok) await approve(shown.map((q) => q.id));
  };
  const fillStarter = async () => {
    const j = await post({ action: "wrong-fill" });
    if (j) toast.success(`${j.filled ?? 0} to check`);
  };
  const draftMissing = async () => {
    setDrafting(true);
    try {
      const res = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wrong-draft" }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) toast.error(j?.error === "none" ? "Every approved question already has wrong answers." : "Claude couldn't draft them just now. Try again.");
      else toast.success(`${j.drafted} drafted to check${j.skipped ? ` (${j.skipped} didn't pass and were left out)` : ""}`);
      await reload();
    } finally { setDrafting(false); }
  };

  return (
    <div className="trivia-admin fire-choices-admin">
      <p className="admin-section__intro">
        Fire Round shows the answer and three wrong ones. Word answers need wrong answers someone has checked; numbers and picture questions get theirs worked out.
        {" "}{choices.playable} questions can play now, {choices.approved} word answers have checked wrong answers.
      </p>
      <div className="trivia-admin__bar">
        {choices.starter > 0 && <Button variant="secondary" size="small" disabled={busy} onClick={() => void fillStarter()}>Add the starter wrong answers ({choices.starter})</Button>}
        {choices.missing > 0 && (
          <Button variant="secondary" size="small" iconBefore={IconSparkles} loading={drafting} disabled={busy || drafting} onClick={() => void draftMissing()}>
            Draft wrong answers with Claude ({Math.min(30, choices.missing)} of {choices.missing})
          </Button>
        )}
        {cats.length > 1 && (
          <Select floatingLabel="Category" value={activeCat} onChange={(v) => { setCat(String(v)); setLimit(PAGE); }}
            options={[{ value: "all", label: `Every category (${choices.waiting.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${choices.waiting.filter((q) => q.category === c).length})` }))]} />
        )}
        {shown.length > 0 && <Button variant="primary" size="small" iconBefore={IconChecks} disabled={busy} onClick={() => void approveShown()}>Approve all {shown.length} shown</Button>}
      </div>

      {shown.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconListLetters size={28} />} title="Nothing to check"
          description={choices.missing ? `${choices.missing} approved questions have no wrong answers yet. Draft them above.` : "Every word answer has checked wrong answers."} />
      ) : (
        <ul className="trivia-library">
          {shown.slice(0, limit).map((q) => (
            <li key={q.id} className="trivia-lib-q is-draft">
              <span className="trivia-muted">{q.category}{q.status === "draft" ? " · question still to check" : ""}</span>
              <p className="trivia-lib-q__prompt">{q.prompt}</p>
              <p className="fire-choices-admin__line"><strong>Answer:</strong> {q.answer}{q.accept.length ? <span className="trivia-muted"> (also {q.accept.join(", ")})</span> : null}</p>
              <p className="fire-choices-admin__line"><strong>Wrong:</strong> {q.wrong.join(" · ")}</p>
              <div className="trivia-row">
                <Button variant="primary" size="small" disabled={busy} onClick={() => void approve([q.id])}>Approve</Button>
                <Button variant="ghost" size="small" disabled={busy} onClick={() => setEditing(q)}>Edit</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && <div><Button variant="ghost" size="small" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more of {shown.length}</Button></div>}

      <AdminSection title="How full each category is" intro="Questions each Fire Round category can play now, against about 100 before launch. A category shows in Fire Round from 12. Grow one with Draft for a category above the tabs.">
        <AdminPanel>
          <ul className="fire-choices-admin__fill">
            {choices.categories.map((c) => (
              <li key={c.id}>
                <span>{c.label}</span>
                <Progress value={Math.min(100, (c.playable / c.target) * 100)} size="small" label={`${c.label}: ${c.playable} of ${c.target}`} className="admin-progress-quiet" />
                <span className="fire-choices-admin__n">{c.playable} of {c.target}</span>
              </li>
            ))}
          </ul>
        </AdminPanel>
      </AdminSection>

      {editing && (
        <EditWrong q={editing} busy={busy} onClose={() => setEditing(null)}
          onSave={async (wrong) => {
            const res = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wrong-update", id: editing.id, wrong }) });
            const j = await res.json().catch(() => null);
            if (!j?.ok) return ERRORS[j?.error] ?? "That didn't save.";
            toast.success("Saved and checked");
            setEditing(null);
            await reload();
            return null;
          }} />
      )}
    </div>
  );
}

function EditWrong({ q, busy, onClose, onSave }: { q: ChoiceQuestion; busy: boolean; onClose: () => void; onSave: (wrong: string[]) => Promise<string | null> }) {
  const [wrong, setWrong] = useState<string[]>([q.wrong[0] ?? "", q.wrong[1] ?? "", q.wrong[2] ?? ""]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal isOpen onClose={onClose} title="Wrong answers" size="medium"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={async () => setError(await onSave(wrong))}>Save and approve</Button></>}>
      <div className="trivia-form">
        <p className="trivia-lib-q__prompt">{q.prompt}</p>
        <p className="fire-choices-admin__line"><strong>Answer:</strong> {q.answer}</p>
        {wrong.map((w, i) => (
          <Input key={i} floatingLabel={`Wrong answer ${i + 1}`} value={w} maxLength={120} fullWidth
            onChange={(e) => { const next = [...wrong]; next[i] = e.target.value; setWrong(next); setError(null); }} />
        ))}
        {error && <p className="trivia-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/** Claude drafts new questions (with wrong answers) for one pack category. */
export function DraftCategory({ categories, onClose, onDrafted }: { categories: string[]; onClose: () => void; onDrafted: (category: string, added: number) => Promise<void> }) {
  const toast = useToast();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [count, setCount] = useState("20");
  const [busy, setBusy] = useState(false);
  const draft = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft-category", category, count: Number(count) }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "not_ready" ? "The database needs fire-round-m1.sql first." : "Claude couldn't draft them just now. Try again."); return; }
      await onDrafted(category, j.added ?? 0);
    } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Draft questions for a category" size="medium"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={busy || !category} onClick={() => void draft()}>Draft {count}</Button></>}>
      <div className="trivia-form">
        <p className="trivia-muted">Claude writes new questions with their answer lines, sources and three wrong answers each. They land in To check (the questions) and Four choices (the wrong answers); nothing reaches a night or a round until you approve it. Written by AI, so check every answer against its source.</p>
        <Select floatingLabel="Category" value={category} onChange={(v) => setCategory(String(v))} options={categories.map((c) => ({ value: c, label: c }))} />
        <Select floatingLabel="How many" value={count} onChange={(v) => setCount(String(v))} options={["10", "20", "30"].map((n) => ({ value: n, label: n }))} />
      </div>
    </Modal>
  );
}
