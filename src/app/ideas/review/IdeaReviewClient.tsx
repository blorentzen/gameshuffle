"use client";

/**
 * Idea review queue (staff). Pending approve/reject → cycle create/promote/close
 * → verdicts → ship. Mobile-friendly (this gets worked from a phone, §6.5).
 * Every action POSTs the admin dispatcher and refreshes server data.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Button, Modal, Input, Textarea, Card, Badge } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { Idea, IdeaCycle } from "@/lib/ideas/types";
import { IDEA_CATEGORY_LABELS } from "@/lib/ideas/constants";

interface PromptCfg {
  title: string;
  label: string;
  multiline?: boolean;
  required?: boolean;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
}

export function IdeaReviewClient({
  pending,
  inReview,
  planned,
  cycles,
}: {
  pending: Idea[];
  inReview: Idea[];
  planned: Idea[];
  cycles: IdeaCycle[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptCfg | null>(null);
  const [value, setValue] = useState("");

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; error?: string } | null;
    setBusy(false);
    if (res.ok && d?.ok !== false) {
      const action = body.action as string;
      const label =
        action === "approve" ? "Idea approved"
        : action === "reject" ? "Idea rejected"
        : action === "create_cycle" ? "Cycle created"
        : action === "promote_cycle" ? "Cycle promoted"
        : action === "close_cycle" ? "Cycle closed"
        : action === "ship" ? "Idea marked shipped"
        : action === "verdict" ? (body.verdict === "planned" ? "Idea planned" : "Verdict saved")
        : "Saved";
      toast.success(label);
      router.refresh();
      return;
    }
    setMsg(d?.reason || d?.error || "Action failed.");
  }

  function openPrompt(cfg: PromptCfg) {
    setValue("");
    setPrompt(cfg);
  }
  function confirmPrompt() {
    if (!prompt) return;
    if (prompt.required && !value.trim()) return;
    const cb = prompt.onConfirm;
    const v = value;
    setPrompt(null);
    cb(v);
  }

  const cycleBadge = (s: IdeaCycle["status"]): "info" | "warning" | "default" | "outline" =>
    s === "voting" ? "info" : s === "in_review" ? "warning" : s === "closed" ? "default" : "outline";

  return (
    <Container className="ideas-page">
      <h1 className="ideas-page__title">Idea review</h1>
      {msg && <p className="ideas-submit__error">{msg}</p>}

      {/* Cycles */}
      <section className="ideas-review__section">
        <div className="ideas-page__head">
          <h2 className="ideas-review__h2">Cycles</h2>
          <Button
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              openPrompt({
                title: "New cycle",
                label: "Cycle name (e.g. Cycle 3, August 2026)",
                required: true,
                confirmLabel: "Create",
                onConfirm: (name) => void act({ action: "create_cycle", name }),
              })
            }
          >
            New cycle
          </Button>
        </div>
        {cycles.length === 0 ? (
          <p className="ideas-page__lead">No cycles yet.</p>
        ) : (
          <ul className="ideas-list">
            {cycles.map((c) => (
              <li key={c.id}>
                <Card variant="outlined" padding="medium" className="idea-card">
                <div className="idea-card__top">
                  <Badge variant={cycleBadge(c.status)} size="small">{c.status}</Badge>
                  <strong>{c.name}</strong>
                  <span className="idea-card__votes">{c.slots} slots</span>
                </div>
                <div className="ideas-review__actions">
                  {c.status === "voting" && (
                    <Button size="small" variant="primary" disabled={busy} onClick={() => void act({ action: "promote_cycle", cycleId: c.id })}>
                      Close voting → promote top {c.slots}
                    </Button>
                  )}
                  {c.status === "in_review" && (
                    <Button size="small" variant="secondary" disabled={busy} onClick={() => void act({ action: "close_cycle", cycleId: c.id })}>
                      Close cycle
                    </Button>
                  )}
                </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending */}
      <section className="ideas-review__section">
        <h2 className="ideas-review__h2">Pending review ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="ideas-page__lead">Queue is clear.</p>
        ) : (
          <ul className="ideas-list">
            {pending.map((i) => (
              <li key={i.id}>
                <Card variant="outlined" padding="medium" className="idea-card">
                <div className="idea-card__top">
                  <Badge variant="default" size="small">{IDEA_CATEGORY_LABELS[i.category]}</Badge>
                  <span className="idea-card__votes">{i.author?.name}</span>
                </div>
                <h3 className="idea-card__title">{i.title}</h3>
                <p className="idea-card__body">{i.body}</p>
                <div className="ideas-review__actions">
                  <Button size="small" variant="primary" disabled={busy} onClick={() => void act({ action: "approve", ideaId: i.id })}>
                    Approve
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      openPrompt({
                        title: "Reject idea",
                        label: "Reason (shown to the author)",
                        multiline: true,
                        required: true,
                        confirmLabel: "Reject",
                        onConfirm: (reason) => void act({ action: "reject", ideaId: i.id, reason }),
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* In review */}
      <section className="ideas-review__section">
        <h2 className="ideas-review__h2">In review ({inReview.length})</h2>
        {inReview.length === 0 ? (
          <p className="ideas-page__lead">Nothing in review.</p>
        ) : (
          <ul className="ideas-list">
            {inReview.map((i) => (
              <li key={i.id}>
                <Card variant="outlined" padding="medium" className="idea-card">
                <div className="idea-card__top">
                  <Badge variant="default" size="small">{IDEA_CATEGORY_LABELS[i.category]}</Badge>
                  <span className="idea-card__votes">{i.voteCount} votes</span>
                </div>
                <h3 className="idea-card__title">{i.title}</h3>
                <p className="idea-card__body">{i.body}</p>
                <div className="ideas-review__actions">
                  <Button size="small" variant="primary" disabled={busy} onClick={() => void act({ action: "verdict", ideaId: i.id, verdict: "planned" })}>
                    Plan it
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      openPrompt({
                        title: "Decline idea",
                        label: "Public verdict note (required)",
                        multiline: true,
                        required: true,
                        confirmLabel: "Decline",
                        onConfirm: (note) => void act({ action: "verdict", ideaId: i.id, verdict: "declined", note }),
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Planned → ship */}
      <section className="ideas-review__section">
        <h2 className="ideas-review__h2">Planned ({planned.length})</h2>
        {planned.length === 0 ? (
          <p className="ideas-page__lead">Nothing planned.</p>
        ) : (
          <ul className="ideas-list">
            {planned.map((i) => (
              <li key={i.id}>
                <Card variant="outlined" padding="medium" className="idea-card">
                <h3 className="idea-card__title">{i.title}</h3>
                <div className="ideas-review__actions">
                  <Button
                    size="small"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      openPrompt({
                        title: "Ship idea",
                        label: "Link to the shipped thing (optional)",
                        confirmLabel: "Mark shipped",
                        onConfirm: (ref) => void act({ action: "ship", ideaId: i.id, shippedRef: ref || null }),
                      })
                    }
                  >
                    Ship it
                  </Button>
                </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {prompt && (
        <Modal isOpen onClose={() => setPrompt(null)} title={prompt.title} size="small">
          <div className="ideas-prompt">
            {prompt.multiline ? (
              <Textarea floatingLabel={prompt.label} value={value} onChange={(e) => setValue(e.target.value)} rows={4} fullWidth />
            ) : (
              <Input floatingLabel={prompt.label} value={value} onChange={(e) => setValue(e.target.value)} fullWidth />
            )}
            <div className="ideas-submit__actions">
              <Button variant="primary" disabled={prompt.required && !value.trim()} onClick={confirmPrompt}>
                {prompt.confirmLabel ?? "Confirm"}
              </Button>
              <Button variant="secondary" onClick={() => setPrompt(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Container>
  );
}
