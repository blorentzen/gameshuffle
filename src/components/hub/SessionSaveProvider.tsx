"use client";

/**
 * Session-detail unsaved-changes orchestration.
 *
 * Each editable section inside the session detail page (Configure tab's
 * SessionDetailsForm, Modules tab's RaceSetupSection, etc.) registers
 * itself with this provider via `useSessionSave()`. The provider:
 *
 *   - Renders a top-of-page "Save changes" bar covering ALL sections
 *   - Aggregates dirty state across sections — button enables only
 *     when at least one section has pending edits
 *   - On click: calls every registered section's save fn in parallel,
 *     awaits results, surfaces failures
 *   - Beforeunload guard — browser-native prompt for tab close / refresh
 *   - In-app navigation guard — intercepts same-origin anchor clicks and
 *     shows a CDS modal letting the streamer Stay / Discard & leave /
 *     Save & continue
 *
 * Replaces the per-section "autosave on every edit" pattern that was
 * driving streamer feedback ("autosave on every click is driving me
 * nuts"). Sections now mutate local state freely; saves only fire on
 * explicit user action.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal } from "@empac/cascadeds";

export type SaverResult = { ok: true } | { ok: false; error?: string };
export type SaverFn = () => Promise<SaverResult>;

interface Registration {
  id: string;
  /** Human label shown in the save bar / modal copy when this section
   *  has unsaved changes. */
  label?: string;
  save: SaverFn;
  dirty: boolean;
}

interface SessionSaveCtx {
  registerSaver: (reg: Registration) => void;
  unregisterSaver: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
}

const SessionSaveContext = createContext<SessionSaveCtx | null>(null);

/** Section-side hook. Returns helpers for registering a save fn and
 *  declaring dirty state. Designed to live next to the section's
 *  local-state useEffect lifecycle. */
export function useSessionSave(): {
  registerSection: (
    id: string,
    save: SaverFn,
    options?: { label?: string },
  ) => void;
  unregisterSection: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
} {
  const ctx = useContext(SessionSaveContext);
  if (!ctx) {
    throw new Error(
      "useSessionSave must be used inside <SessionSaveProvider>",
    );
  }
  return {
    registerSection: useCallback(
      (id, save, options) =>
        ctx.registerSaver({
          id,
          save,
          label: options?.label,
          // Start clean — sections explicitly setDirty when their local
          // state diverges from the last-known-server state.
          dirty: false,
        }),
      [ctx],
    ),
    unregisterSection: ctx.unregisterSaver,
    setDirty: ctx.setDirty,
  };
}

export function SessionSaveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const registrationsRef = useRef(new Map<string, Registration>());
  const [anyDirty, setAnyDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"ok" | "error" | null>(null);

  /** Recompute `anyDirty` from the live registrations map. Cheap —
   *  the map is small (typically < 5 entries). */
  const recomputeDirty = useCallback(() => {
    let next = false;
    for (const reg of registrationsRef.current.values()) {
      if (reg.dirty) {
        next = true;
        break;
      }
    }
    setAnyDirty(next);
  }, []);

  const registerSaver = useCallback(
    (reg: Registration) => {
      registrationsRef.current.set(reg.id, reg);
      recomputeDirty();
    },
    [recomputeDirty],
  );
  const unregisterSaver = useCallback(
    (id: string) => {
      registrationsRef.current.delete(id);
      recomputeDirty();
    },
    [recomputeDirty],
  );
  const setDirty = useCallback(
    (id: string, dirty: boolean) => {
      const existing = registrationsRef.current.get(id);
      if (!existing) return;
      if (existing.dirty === dirty) return;
      registrationsRef.current.set(id, { ...existing, dirty });
      recomputeDirty();
    },
    [recomputeDirty],
  );

  /** Save every dirty section. Returns true when all saves succeeded
   *  (or there was nothing dirty); false if any reported an error. */
  const saveAll = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setStatusMessage(null);
    setStatusKind(null);
    const dirty = Array.from(registrationsRef.current.values()).filter(
      (r) => r.dirty,
    );
    if (dirty.length === 0) {
      setSaving(false);
      return true;
    }
    const results = await Promise.all(
      dirty.map(async (r) => {
        try {
          const res = await r.save();
          return { id: r.id, label: r.label, ...res };
        } catch (err) {
          return {
            id: r.id,
            label: r.label,
            ok: false as const,
            error:
              err instanceof Error
                ? err.message
                : "Unexpected save failure.",
          };
        }
      }),
    );
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      setStatusMessage(
        `Some sections couldn’t save: ${failures
          .map((f) => f.label ?? f.id)
          .join(", ")}.`,
      );
      setStatusKind("error");
    } else {
      setStatusMessage("Saved.");
      setStatusKind("ok");
      window.setTimeout(() => {
        // Clear the success flash after a couple seconds.
        setStatusMessage((cur) => (cur === "Saved." ? null : cur));
        setStatusKind((cur) => (cur === "ok" ? null : cur));
      }, 2000);
    }
    setSaving(false);
    return failures.length === 0;
  }, []);

  // ---- Beforeunload (tab close / refresh / type new URL same tab) ----
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by Chrome historically; modern browsers ignore the
      // string but still trigger the native prompt as long as preventDefault
      // was called.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  // ---- In-app anchor intercept ----
  // Captures clicks on same-origin <a> elements and prompts before
  // navigating when dirty. Programmatic `router.push` calls are NOT
  // intercepted — those are explicit imperative actions; sections that
  // want guarded programmatic navigation should call `saveAll()` first.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      // Only left-clicks without modifier keys go through SPA nav.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      if (!target) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Skip non-navigating anchors (mailto:, tel:, #fragments, etc.).
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }
      // Skip external links — beforeunload covers full navigations.
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        // Skip same-page links — pathname identical AND no different
        // search/hash. (Same-tab anchors that change nothing don't
        // count as navigation.)
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search &&
          url.hash === window.location.hash
        ) {
          return;
        }
      } catch {
        return;
      }
      // Intercept!
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(anchor.href);
    };
    // Capture phase so we run before React's bubble-phase handlers
    // attached to <Link>.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty]);

  const closeLeaveModal = () => setPendingHref(null);
  const onDiscardAndLeave = () => {
    const href = pendingHref;
    setPendingHref(null);
    // Mark every registration clean so the beforeunload handler
    // immediately stops blocking. (We're explicitly discarding.)
    for (const [id, reg] of registrationsRef.current.entries()) {
      registrationsRef.current.set(id, { ...reg, dirty: false });
    }
    recomputeDirty();
    if (href) {
      // Use router.push for same-origin in-app routes; full reload
      // otherwise. Since we filtered to same-origin in the click
      // handler, router.push is safe.
      const url = new URL(href);
      const target = `${url.pathname}${url.search}${url.hash}`;
      router.push(target);
    }
  };
  const onSaveAndLeave = async () => {
    const href = pendingHref;
    const ok = await saveAll();
    if (!ok) {
      // Surface error inline; keep modal open so user can retry.
      return;
    }
    setPendingHref(null);
    if (href) {
      const url = new URL(href);
      const target = `${url.pathname}${url.search}${url.hash}`;
      router.push(target);
    }
  };

  const value = useMemo<SessionSaveCtx>(
    () => ({ registerSaver, unregisterSaver, setDirty }),
    [registerSaver, unregisterSaver, setDirty],
  );

  return (
    <SessionSaveContext.Provider value={value}>
      <SaveBar
        anyDirty={anyDirty}
        saving={saving}
        statusMessage={statusMessage}
        statusKind={statusKind}
        onSave={() => void saveAll()}
      />
      {children}
      <Modal
        isOpen={pendingHref !== null}
        onClose={closeLeaveModal}
        title="Unsaved changes"
        size="small"
        footer={
          <div
            style={{
              display: "flex",
              gap: "var(--spacing-8)",
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <Button variant="ghost" onClick={closeLeaveModal}>
              Stay on page
            </Button>
            <Button variant="secondary" onClick={onDiscardAndLeave}>
              Discard &amp; leave
            </Button>
            <Button
              variant="primary"
              onClick={() => void onSaveAndLeave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save & continue"}
            </Button>
          </div>
        }
      >
        <p>
          You have unsaved changes on this page. Saving keeps your
          edits; discarding throws them away.
        </p>
      </Modal>
    </SessionSaveContext.Provider>
  );
}

function SaveBar({
  anyDirty,
  saving,
  statusMessage,
  statusKind,
  onSave,
}: {
  anyDirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  statusKind: "ok" | "error" | null;
  onSave: () => void;
}) {
  return (
    <div className="hub-detail__save-bar">
      <div className="hub-detail__save-bar-status">
        {anyDirty ? (
          <span className="hub-detail__save-bar-dirty">
            Unsaved changes
          </span>
        ) : (
          <span className="hub-detail__save-bar-clean">All changes saved</span>
        )}
        {statusKind === "ok" && statusMessage && (
          <span className="hub-detail__save-bar-flash hub-detail__save-bar-flash--ok">
            {statusMessage}
          </span>
        )}
        {statusKind === "error" && statusMessage && (
          <Alert variant="error">{statusMessage}</Alert>
        )}
      </div>
      <Button
        variant="primary"
        onClick={onSave}
        disabled={!anyDirty || saving}
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
