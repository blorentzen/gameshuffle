"use client";

/**
 * Beta-only feedback affordance — a small floating button that
 * opens an in-app modal with a form. Submissions email the
 * configured inbox via MailerSend; no DB write.
 *
 * Per the consult, the original anchor-to-URL behavior was replaced
 * with an in-app modal so testers can submit without leaving the
 * Companion. The button still only renders when beta mode is on.
 */

import { Modal } from "@empac/cascadeds";
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
      <button type="button" className="companion-feedback" onClick={handleOpen}>
        <span className="companion-feedback__icon" aria-hidden="true">
          ✍
        </span>
        <span className="companion-feedback__label">Feedback</span>
      </button>
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
          Got it — we&apos;ll read it.
        </p>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send feedback">
      <form className="companion-feedback-form" onSubmit={handleSubmit}>
        <label className="companion-feedback-form__field">
          <span>Category</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value as (typeof COMPANION_FEEDBACK_CATEGORIES)[number],
              )
            }
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="companion-feedback-form__field">
          <span>
            What&apos;s up?
            <span className="companion-feedback-form__count">
              {message.length}/{MESSAGE_MAX}
            </span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            rows={5}
            placeholder="Describe the issue, idea, or confusion. Steps to reproduce help a lot for bugs."
            autoFocus
          />
        </label>

        {!viewerIsAuthenticated && (
          <label className="companion-feedback-form__field">
            <span>Contact email (optional)</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </label>
        )}

        {error && (
          <p className="companion-feedback-form__error" role="alert">
            {error}
          </p>
        )}

        <div className="companion-feedback-form__actions">
          <button
            type="button"
            className="companion-feedback-form__btn companion-feedback-form__btn--secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="companion-feedback-form__btn companion-feedback-form__btn--primary"
            disabled={pending || message.trim().length === 0}
          >
            {pending ? "Sending…" : "Send"}
          </button>
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
      return "That's a lot — please shorten it to 2000 characters.";
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
