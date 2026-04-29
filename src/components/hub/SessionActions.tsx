"use client";

/**
 * Session detail header actions — primary CTA varies by status.
 *
 * Per gs-pro-v1-phase-4a-spec.md §§5.2 + 6:
 *   - draft   → Activate / Cancel
 *   - scheduled → Cancel
 *   - ready   → Activate / Cancel
 *   - active  → End session
 *   - ending  → no actions (read-only during wrap-up)
 *   - ended   → Restart
 *   - cancelled → Restart
 *
 * Confirmation modals use CDS `<Modal />` with `destructive` prop for
 * end / cancel.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal } from "@empac/cascadeds";
import {
  activateSessionAction,
  cancelSessionAction,
  endSessionAction,
  restartSessionAction,
} from "@/app/hub/sessions/[slug]/actions";
import type { GsSession } from "@/lib/sessions/types";
import { Countdown } from "./Countdown";

interface SessionActionsProps {
  session: GsSession;
  /** ISO timestamp when an "ending" sibling session's wrap-up window
   *  elapses. When set, the Activate button is disabled until then so
   *  the streamer doesn't try to bring up a new session before the
   *  previous one is fully ended. */
  blockingEndingEnableAt?: string | null;
}

export function SessionActions({
  session,
  blockingEndingEnableAt = null,
}: SessionActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<
    "activate" | "cancel" | "end" | "restart" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const dispatchAction = (
    action: "activate" | "cancel" | "end" | "restart"
  ) => {
    setError(null);
    startTransition(async () => {
      try {
        let result: { ok: boolean; error?: string; redirectTo?: string };
        if (action === "activate") result = await activateSessionAction(session.slug);
        else if (action === "cancel") result = await cancelSessionAction(session.slug);
        else if (action === "end") result = await endSessionAction(session.slug);
        else result = await restartSessionAction(session.slug);

        if (!result.ok) {
          setError(result.error ?? "Action failed.");
          return;
        }
        setConfirming(null);
        if (result.redirectTo) {
          router.push(result.redirectTo);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  };

  const buttons: React.ReactNode[] = [];
  // Phase 4B: when a previous session is still wrapping up (status='ending'),
  // the new draft can't activate until that session reaches 'ended' (the
  // unique-active index would block it). Show the user why instead of
  // failing the click.
  const activateDisabledForEnding = !!blockingEndingEnableAt;

  switch (session.status) {
    case "draft":
    case "ready":
      buttons.push(
        <Button
          key="activate"
          variant="primary"
          onClick={() => setConfirming("activate")}
          disabled={pending || activateDisabledForEnding}
        >
          {activateDisabledForEnding ? (
            <span>
              Wrap-up in progress (
              <Countdown to={blockingEndingEnableAt} fallback="momentarily" />)
            </span>
          ) : (
            "Activate"
          )}
        </Button>
      );
      buttons.push(
        <Button
          key="cancel"
          variant="secondary"
          onClick={() => setConfirming("cancel")}
          disabled={pending}
        >
          Cancel session
        </Button>
      );
      break;
    case "scheduled":
      buttons.push(
        <Button
          key="cancel"
          variant="secondary"
          onClick={() => setConfirming("cancel")}
          disabled={pending}
        >
          Cancel session
        </Button>
      );
      break;
    case "active":
      buttons.push(
        <Button
          key="end"
          variant="danger"
          onClick={() => setConfirming("end")}
          disabled={pending}
        >
          End session
        </Button>
      );
      break;
    case "ending":
      // No actions — read-only wrap-up
      break;
    case "ended":
    case "cancelled":
      buttons.push(
        <Button
          key="restart"
          variant="primary"
          onClick={() => setConfirming("restart")}
          disabled={pending}
        >
          Restart
        </Button>
      );
      break;
  }

  return (
    <>
      <div className="hub-detail__action-row">
        {buttons.length > 0 ? buttons : null}
      </div>
      {error && (
        <div style={{ marginTop: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {confirming === "activate" && (
        <Modal
          isOpen
          onClose={() => setConfirming(null)}
          title="Activate session?"
          primaryAction={{
            label: pending ? "Activating…" : "Activate",
            onClick: () => dispatchAction("activate"),
          }}
          secondaryAction={{
            label: "Cancel",
            onClick: () => setConfirming(null),
          }}
        >
          <p>
            Activating <strong>{session.name}</strong> will trigger any
            attached platforms (chat welcome message, channel point reward
            setup) and start the session lifecycle. The session can be
            ended at any time.
          </p>
        </Modal>
      )}

      {confirming === "cancel" && (
        <Modal
          isOpen
          onClose={() => setConfirming(null)}
          title="Cancel this session?"
          destructive
          primaryAction={{
            label: pending ? "Cancelling…" : "Cancel session",
            onClick: () => dispatchAction("cancel"),
          }}
          secondaryAction={{
            label: "Keep it",
            onClick: () => setConfirming(null),
          }}
        >
          <p>
            Cancelling <strong>{session.name}</strong> marks it as cancelled
            and removes it from active flows. You can restart it from
            history later.
          </p>
        </Modal>
      )}

      {confirming === "end" && (
        <Modal
          isOpen
          onClose={() => setConfirming(null)}
          title="End this session?"
          destructive
          primaryAction={{
            label: pending ? "Ending…" : "End session",
            onClick: () => dispatchAction("end"),
          }}
          secondaryAction={{
            label: "Keep it running",
            onClick: () => setConfirming(null),
          }}
        >
          <p>
            Ending <strong>{session.name}</strong> will end the session for
            all participants and trigger the wrap-up sequence. A recap
            posts to chat once wrap-up completes (~60s).
          </p>
        </Modal>
      )}

      {confirming === "restart" && (
        <Modal
          isOpen
          onClose={() => setConfirming(null)}
          title="Restart session?"
          primaryAction={{
            label: pending ? "Cloning…" : "Restart",
            onClick: () => dispatchAction("restart"),
          }}
          secondaryAction={{
            label: "Cancel",
            onClick: () => setConfirming(null),
          }}
        >
          <p>
            Creates a new draft session with the same name + platforms +
            config as <strong>{session.name}</strong>. The new session
            stays in draft until you activate it.
          </p>
        </Modal>
      )}
    </>
  );
}
