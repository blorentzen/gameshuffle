"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "@empac/cascadeds";

/**
 * One confirm dialog for the whole site, on CDS Modal, in place of the
 * browser's own confirm(). Mounted next to the toasts in the root layout.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Clear the score pad?", confirmLabel: "Clear scores" }))) return;
 *
 * The confirm button says what happens ("Clear scores", not "OK") and is red
 * unless `danger: false`. Escape, the overlay and Cancel all answer no.
 */
export interface ConfirmOptions {
  /** The question: "Delete this night?" */
  title: string;
  /** One more line when it helps: "This can't be undone." */
  body?: ReactNode;
  /** What the button does: "Delete night". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button (default). False for a non-destructive confirm. */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => new Promise<boolean>((resolve) => {
    // A second confirm while one is open answers the first with no.
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(next);
  }), []);

  const answer = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          isOpen
          size="small"
          title={options.title}
          onClose={() => answer(false)}
          destructive={options.danger ?? true}
          primaryAction={{ label: options.confirmLabel, onClick: () => answer(true) }}
          secondaryAction={{ label: options.cancelLabel ?? "Cancel", onClick: () => answer(false) }}
        >
          {options.body ? <p className="confirm-dialog__body">{options.body}</p> : null}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return confirm;
}
