"use client";

/**
 * "New session" modal — primary entry point from Hub home. Captures the
 * minimum viable inputs for a draft (name, description, games,
 * real/test), creates the draft on submit, and routes the user to the
 * detail page so they finish configuration in the Settings tab.
 *
 * Per Britton's UI direction: scheduling, eligibility window, and other
 * advanced fields live ONLY in Settings on the detail page — the modal
 * stays focused on identity + scope.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Textarea } from "@empac/cascadeds";
import { GameMultiSelect } from "./GameMultiSelect";
import { createDraftSessionAction } from "@/app/hub/sessions/new/actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** When true, the draft is flagged as a test session. The view pill
   *  the streamer is on (Sessions vs. Test streams) decides this — the
   *  modal no longer asks. */
  defaultTest?: boolean;
}

export function NewSessionModal({
  isOpen,
  onClose,
  defaultTest = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Form state — re-initialized on each open via the `key` on the
  // parent's mount, so we don't need a manual reset effect.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configuredGames, setConfiguredGames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ slug: string; name: string } | null>(null);

  const isTest = defaultTest;

  const submit = () => {
    setError(null);
    setDraft(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give your stream a name.");
      return;
    }
    startTransition(async () => {
      const result = await createDraftSessionAction({
        name: trimmedName,
        description: description.trim() || null,
        configuredGames,
        isTestSession: isTest,
      });
      if (!result.ok || !result.slug) {
        setError(result.error ?? "Could not create the stream.");
        setDraft(result.draft ?? null);
        return;
      }
      // Navigate into the new draft's detail page → Settings tab so the
      // streamer continues configuration there.
      router.push(`/hub/sessions/${result.slug}?tab=configure`);
      onClose();
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isTest ? "New test stream" : "New stream"}
      size="medium"
      primaryAction={{
        label: pending ? "Creating…" : "Create draft",
        onClick: submit,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="new-session-modal">
        <p className="new-session-modal__intro">
          {isTest
            ? "A test stream works like a real one but doesn't end on its own or wrap up. Name it now; you'll set the games and the schedule on the next page."
            : "Name it now; you'll set the games, the schedule and picks and bans on the next page."}
        </p>

        {error && (
          <Alert variant={draft ? "warning" : "error"} onClose={() => { setError(null); setDraft(null); }}>
            {error}
            {draft && (
              <div className="new-session-modal__draft">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    router.push(`/hub/sessions/${draft.slug}`);
                    onClose();
                  }}
                >
                  Open &ldquo;{draft.name}&rdquo;
                </Button>
              </div>
            )}
          </Alert>
        )}

        <label className="hub-form__field">
          <span className="hub-form__label">Title</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Saturday MK Shuffle Night"
            fullWidth
            autoFocus
          />
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Description</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional: what this stream is about, prizes, rules, vibes…"
            rows={3}
            fullWidth
          />
        </label>

        <div className="hub-form__field">
          <span className="hub-form__label">Games for this stream</span>
          <GameMultiSelect
            value={configuredGames}
            onChange={setConfiguredGames}
          />
        </div>
      </div>
    </Modal>
  );
}
