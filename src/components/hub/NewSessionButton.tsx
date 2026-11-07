"use client";

/**
 * Hub-home "New session" / "New test stream" button. Opens the
 * `<NewSessionModal />` rather than routing to /hub/sessions/new. Keeps
 * the modal state co-located with the trigger so the rest of Hub home
 * stays a server component.
 *
 * The full-page `/hub/sessions/new` form still works as a fallback URL
 * (direct link / browser back-button case); both paths converge on the
 * same `createSession` service.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { NewSessionModal } from "./NewSessionModal";

interface Props {
  /** Pre-flips the test toggle on when the button is rendered in the
   *  Test streams view. */
  defaultTest?: boolean;
  /** The hub header keeps one primary button (New stream); the test stream button sits beside it as secondary. */
  variant?: "primary" | "secondary";
}

export function NewSessionButton({ defaultTest = false, variant = "primary" }: Props) {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {defaultTest ? "Test stream" : "New stream"}
      </Button>
      {/* Keying on isOpen ensures form state resets each time the modal
          re-opens (no leftover name/description from a prior open). */}
      {isOpen && (
        <NewSessionModal
          key={`open-${defaultTest ? "test" : "live"}`}
          isOpen={isOpen}
          onClose={() => setOpen(false)}
          defaultTest={defaultTest}
        />
      )}
    </>
  );
}
