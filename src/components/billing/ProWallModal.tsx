"use client";

/**
 * The GS Pro wall in a window, for a Pro action pressed from a free screen (the
 * level boards' "Add to my queue"), where there's no room to show the wall in
 * place. Same prompt as every other wall (ProTrialPrompt: the trial one tap
 * away, Support as the quiet second choice). Free vs GS Pro fixes, 2026-11-11.
 */

import type { ReactNode } from "react";
import { Modal } from "@empac/cascadeds";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";

export function ProWallModal({ isOpen, onClose, heading, title, from, children }: {
  isOpen: boolean;
  onClose: () => void;
  /** The window's own title, short: "Add to your queue". */
  heading: string;
  /** What's locked, as a sentence: "The level queue is part of GS Pro". */
  title: string;
  /** Analytics place name. */
  from: string;
  children?: ReactNode;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={heading} size="small" className="pro-wall-modal">
      <ProTrialPrompt compact title={title} from={from}>{children}</ProTrialPrompt>
    </Modal>
  );
}
