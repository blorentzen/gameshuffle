"use client";

/**
 * Feedback affordance — a small floating button that opens an in-app
 * modal with a form. Submissions email the configured inbox via
 * MailerSend; no DB write.
 *
 * Rendered as an in-app modal so players can submit without leaving
 * the Companion.
 */

import { Button, Input, Modal, Select, Textarea } from "@empac/cascadeds";
import { IconMessageCircle } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  submitCompanionFeedbackAction,
  type SubmitCompanionFeedbackInput,
} from "@/app/tcg-companion/feedback/actions";
import { COMPANION_FEEDBACK_CATEGORIES } from "@/lib/email/companion-feedback";

const CATEGORY_OPTIONS: Array<{
  value: (typeof COMPANION_FEEDBACK_CATEGORIES)[number];
  label: string;
}> = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "confusion", label: "Confusing" },
  { value: "other", label: "Other" },
];

const MESSAGE_MAX = 2000;

interface Props {
  /** True when the viewer is signed in. Suppresses the optional
   *  contact-email field since we already have the user's email. */
  viewerIsAuthenticated: boolean;
}

export function FeedbackButton({ viewerIsAuthenticated }: Props) {
  const [open, setOpen] = useState(false);
  // Bumped each time the modal opens so the form remounts with
  // fresh state — same pattern as PlacePieceModal.
  const [nonce, setNonce] = useState(0);

  const handleOpen = () => {
    setNonce((n) => n + 1);
    setOpen(true);
  };

  return (
    <>
      <Button variant="primary" size="small" iconBefore={IconMessageCircle} className="companion-feedback" onClick={handleOpen}>
        Feedback
      </Button>
      <FeedbackModal
        key={nonce}
        isOpen={open}
        viewerIsAuthenticated={viewerIsAuthenticated}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

interface ModalProps {
  isOpen: boolean;
  viewerIsAuthenticated: boolean;
  onClose: () => void;
}

function FeedbackModal({ isOpen, viewerIsAuthenticated, onClose }: ModalProps) {
  const [category, setCategory] =
    useState<(typeof COMPANION_FEEDBACK_CATEGORIES)[number]>("bug");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || submitted) return;
    setError(null);
    if (message.trim().length === 0) {
      setError("Please describe what you're seeing.");
      return;
    }
    const payload: SubmitCompanionFeedbackInput = {
      category,
      message,
      contactEmail: viewerIsAuthenticated ? null : contactEmail || null,
      path:
        typeof window !== "undefined" ? window.location.pathname : null,
    };
    startTransition(async () => {
      const result = await submitCompanionFeedbackAction(payload);
      if (!result.ok) {
        setError(reasonToMessage(result.reason));
        return;
      }
      setSubmitted(true);
      // Auto-close after a short beat so the success state is
      // visible but doesn't block them from getting back to play.
      window.setTimeout(() => {
        onClose();
      }, 1400);
    });
  };

  if (submitted) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Thanks!">
        <p className="companion-feedback-form__thanks">
          Got it, we&apos;ll read it.
        </p>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send feedback">
      <form className="companion-feedback-form" onSubmit={handleSubmit}>
        <Select
          floatingLabel="Category"
          fullWidth
          value={category}
          onChange={(v) => setCategory(v as (typeof COMPANION_FEEDBACK_CATEGORIES)[number])}
          options={CATEGORY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        />

        <div className="companion-feedback-form__message">
          <Textarea
            floatingLabel="What's up?"
            fullWidth
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            rows={5}
            placeholder="Describe the issue, idea, or confusion. Steps to reproduce help a lot for bugs."
            autoFocus
          />
          <span className="companion-feedback-form__count">{message.length}/{MESSAGE_MAX}</span>
        </div>

        {!viewerIsAuthenticated && (
          <Input
            floatingLabel="Contact email (optional)"
            fullWidth
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
          />
        )}

        {error && (
          <p className="companion-feedback-form__error" role="alert">
            {error}
          </p>
        )}

        <div className="companion-feedback-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending} disabled={pending || message.trim().length === 0}>Send</Button>
        </div>
      </form>
    </Modal>
  );
}

function reasonToMessage(reason: string | undefined): string {
  switch (reason) {
    case "empty_message":
      return "Please describe what you're seeing.";
    case "message_too_long":
      return "That's a lot. Please shorten it to 2000 characters.";
    case "invalid_email":
      return "That email doesn't look right.";
    case "invalid_category":
      return "Please pick a category.";
    case "beta_off":
      return "Feedback is closed.";
    default:
      return "Couldn't send. Try again in a moment.";
  }
}
