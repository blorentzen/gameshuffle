"use client";

/**
 * /twitch/commands — interactive surface.
 *
 * Lists every custom command for the community. Add and edit both
 * route through the same modal (CustomCommandEditModal) so a
 * streamer sees the variable picker + every field at once instead of
 * a cramped inline form.
 *
 * Toggle enable/disable + delete are still inline per-row actions.
 */

import { useState, useTransition } from "react";
import type { CustomCommandRow } from "@/lib/twitch/commands/customCommands";
import type { ActorTier } from "@/lib/twitch/commands/registry";
import {
  createCustomCommandAction,
  deleteCustomCommandAction,
  updateCustomCommandAction,
} from "./actions";
import {
  CustomCommandEditModal,
  type ProfileVarStatus,
} from "./CustomCommandEditModal";

interface Props {
  communityId: string;
  communitySlug: string;
  communityDisplayName: string | null;
  initialRows: CustomCommandRow[];
  profileStatus: ProfileVarStatus;
}

export function CustomCommandsManager({
  communitySlug,
  communityDisplayName,
  initialRows,
  profileStatus,
}: Props) {
  const [rows, setRows] = useState<CustomCommandRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [modalRow, setModalRow] = useState<CustomCommandRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** Drives the modal's "Saving…" button label AND prevents the
   *  modal from closing prematurely while the network call is in
   *  flight. Distinct from `pending` (useTransition) because save
   *  needs an `await`-able flag the modal can read directly. */
  const [saving, setSaving] = useState(false);
  /** Lights up the "Saved ✓" indicator at the top of the manager
   *  briefly after every successful save. Cleared on a 2.5s timer. */
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const flashSaved = () => {
    const stamp = Date.now();
    setSavedAt(stamp);
    setTimeout(() => {
      setSavedAt((prev) => (prev === stamp ? null : prev));
    }, 2500);
  };

  const openAdd = () => {
    setModalRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: CustomCommandRow) => {
    setModalRow(row);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    // Don't clear modalRow immediately — the modal closes via
    // animation; clearing on close keeps the row in scope while
    // the modal animates out.
  };

  const handleSave = async (patch: {
    trigger?: string;
    responseTmpl?: string;
    actor?: ActorTier;
    cooldownSeconds?: number;
  }) => {
    if (saving) return; // Guard re-entrancy.
    setError(null);
    setSaving(true);
    try {
      if (!modalRow) {
        // Add.
        const trigger = patch.trigger ?? "";
        const responseTmpl = patch.responseTmpl ?? "";
        const actor = patch.actor ?? "everyone";
        const cooldown = patch.cooldownSeconds ?? 5;
        const result = await createCustomCommandAction({
          trigger,
          responseTmpl,
          actor,
          cooldownSeconds: cooldown,
        });
        if (!result.ok) {
          setError(result.reason ?? "Couldn't save.");
          return;
        }
        const normalized = trigger.startsWith("!") ? trigger : `!${trigger}`;
        setRows((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            community_id: "",
            trigger: normalized,
            response_tmpl: responseTmpl,
            actor,
            cooldown_s: cooldown,
            enabled: true,
            use_count: 0,
          },
        ]);
        flashSaved();
        closeModal();
        return;
      }
      // Edit — patch may be empty if user clicked Save without changes.
      if (Object.keys(patch).length === 0) {
        closeModal();
        return;
      }
      const result = await updateCustomCommandAction({
        id: modalRow.id,
        ...patch,
      });
      if (!result.ok) {
        setError(result.reason ?? "Couldn't save.");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === modalRow.id
            ? {
                ...r,
                trigger: patch.trigger ?? r.trigger,
                response_tmpl: patch.responseTmpl ?? r.response_tmpl,
                actor: patch.actor ?? r.actor,
                cooldown_s: patch.cooldownSeconds ?? r.cooldown_s,
              }
            : r,
        ),
      );
      flashSaved();
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (id: string, nextEnabled: boolean) => {
    setError(null);
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: nextEnabled } : r)),
    );
    startTransition(async () => {
      const result = await updateCustomCommandAction({
        id,
        enabled: nextEnabled,
      });
      if (!result.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, enabled: !nextEnabled } : r)),
        );
        setError(result.reason ?? "Couldn't toggle.");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this command?")) {
      return;
    }
    setError(null);
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const result = await deleteCustomCommandAction({ id });
      if (!result.ok) {
        setRows(previous);
        setError(result.reason ?? "Couldn't delete.");
      }
    });
  };

  return (
    <div className="cc-manager">
      <header className="cc-manager__header">
        <h1>Custom Commands</h1>
        <p className="cc-manager__subtitle">
          Community:{" "}
          <strong>{communityDisplayName ?? communitySlug}</strong>{" "}
          (<code>{communitySlug}</code>)
        </p>
        <p className="cc-manager__hint">
          Per-community static-response commands. Edits propagate to chat
          within ~15s. The dispatcher gates on the{" "}
          <code>custom_commands</code> module — disable it at{" "}
          <a href="/twitch/modules">/twitch/modules</a> to turn the whole
          surface off.
        </p>
      </header>

      {error && (
        <p className="cc-manager__error" role="alert">
          {error}
        </p>
      )}

      <div className="cc-manager__toolbar">
        <button
          type="button"
          className="cc-manager__add-btn"
          disabled={pending || saving}
          onClick={openAdd}
        >
          + Add custom command
        </button>
        {savedAt && (
          <span className="cc-manager__saved" role="status">
            ✓ Saved
          </span>
        )}
      </div>

      <section className="cc-manager__list">
        <h2>Commands ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="cc-manager__empty">
            No custom commands yet. The seed library (<code>!socials</code>,{" "}
            <code>!discord</code>, etc.) auto-populates when your community
            is first created.
          </p>
        ) : (
          <ul className="cc-manager__rows">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`cc-manager__row${
                  r.enabled ? "" : " cc-manager__row--disabled"
                }`}
              >
                <div className="cc-manager__row-meta">
                  <p className="cc-manager__row-trigger">
                    <code>{r.trigger}</code>
                    <span className="cc-manager__row-actor"> {r.actor}</span>
                    <span className="cc-manager__row-cooldown">
                      {" "}
                      · {r.cooldown_s}s
                    </span>
                    <span className="cc-manager__row-uses">
                      {" "}
                      · {r.use_count} uses
                    </span>
                  </p>
                  <p className="cc-manager__row-response">{r.response_tmpl}</p>
                </div>
                <div className="cc-manager__row-actions">
                  <label className="cc-manager__row-toggle">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => handleToggle(r.id, e.target.checked)}
                      disabled={pending}
                    />
                    {r.enabled ? "On" : "Off"}
                  </label>
                  <button
                    type="button"
                    className="cc-manager__row-btn"
                    onClick={() => openEdit(r)}
                    disabled={pending}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="cc-manager__row-btn cc-manager__row-btn--danger"
                    onClick={() => handleDelete(r.id)}
                    disabled={pending}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CustomCommandEditModal
        key={modalRow?.id ?? "add"}
        isOpen={modalOpen}
        row={modalRow}
        profileStatus={profileStatus}
        busy={saving}
        error={modalOpen ? error : null}
        onSave={handleSave}
        onClose={() => {
          if (saving) return; // Don't allow close during in-flight save.
          setError(null);
          closeModal();
        }}
      />
    </div>
  );
}
