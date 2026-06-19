"use client";

/**
 * PlatformVariablesTab — staff/admin-only flavor-variables editor.
 *
 * Manages the dictionary of `{name}` tokens admins can reference in
 * event flavor templates. The engine in
 * `src/lib/economy/events/engine.ts` is the actual source of truth
 * for which variables resolve at fire time — this catalog is a
 * writer-facing reference, not a feature switch. The intro copy is
 * blunt about that so admins don't expect a new row here to
 * automatically work in chat.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Select, Textarea } from "@empac/cascadeds";

type VariableCategory = "caller" | "stream" | "profile" | "event" | "pool";

const CATEGORY_LABEL: Record<VariableCategory, string> = {
  caller: "Caller",
  stream: "Stream",
  profile: "Profile",
  event: "Event-only",
  pool: "Pool-only",
};

const CATEGORY_OPTIONS = (
  ["caller", "stream", "profile", "event", "pool"] as VariableCategory[]
).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

interface VariableRow {
  name: string;
  description: string;
  example: string;
  category: VariableCategory;
  created_at: string;
  updated_at: string;
}

export function PlatformVariablesTab() {
  const [vars, setVars] = useState<VariableRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<VariableRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/flavor-variables", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError("Forbidden — this surface is for GameShuffle staff only.");
        setVars([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setVars([]);
        return;
      }
      setVars(body.variables as VariableRow[]);
    } catch {
      setLoadError("Network error while loading.");
      setVars([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (row: VariableRow) => {
    if (
      !confirm(
        `Delete {${row.name}}? Events that reference it will render the token literally in chat.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/flavor-variables/${encodeURIComponent(row.name)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      setVars((cur) => cur?.filter((v) => v.name !== row.name) ?? null);
    } catch {
      setLoadError("Network error while deleting.");
    }
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Flavor variables</h2>
      <p className="account-tab__intro">
        Dictionary of <code>{`{name}`}</code> tokens that event flavor
        templates can reference. <strong>Adding a row here doesn&rsquo;t
        wire up a new variable</strong> — the engine at{" "}
        <code>src/lib/economy/events/engine.ts</code> has to populate
        it at fire time. Unknown tokens render literally in chat so
        typos are visible.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-16)",
          marginBottom: "var(--spacing-16)",
        }}
      >
        <span
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-12)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {vars?.length ?? 0} variable{vars?.length === 1 ? "" : "s"}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add variable
          </Button>
        </div>
      </div>

      {vars === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : vars.length === 0 ? (
        <p className="account-tab__empty">
          No variables in the catalog yet.
        </p>
      ) : (
        <table className="platform-events__table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Category</th>
              <th>What it renders</th>
              <th>Example</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vars.map((row) => (
              <tr key={row.name}>
                <td>
                  <code>{`{${row.name}}`}</code>
                </td>
                <td>{CATEGORY_LABEL[row.category]}</td>
                <td style={{ color: "var(--text-secondary)" }}>
                  {row.description}
                </td>
                <td>
                  <code>{row.example || "—"}</code>
                </td>
                <td className="platform-events__actions">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => void handleDelete(row)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <VariableEditorModal
          row={editing === "new" ? null : editing}
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor modal
// ---------------------------------------------------------------------------

interface EditorProps {
  row: VariableRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function VariableEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [example, setExample] = useState(row?.example ?? "");
  const [category, setCategory] = useState<VariableCategory>(
    row?.category ?? "stream",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmedName)) {
      setError(
        "Name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
      );
      return;
    }
    if (!trimmedDescription) {
      setError("Description is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/flavor-variables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
          example: example.trim(),
          category,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Save failed (${res.status}).`);
        return;
      }
      onSaved();
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit {${row.name}}` : "Add variable"}
      size="medium"
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--spacing-8)",
            width: "100%",
          }}
        >
          <Button variant="tertiary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={saving}
            disabled={saving}
          >
            Save variable
          </Button>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div className="hub-form__field-stack">
        <label className="hub-form__field">
          <span className="hub-form__label">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="streamer"
            fullWidth
            disabled={isEdit}
          />
          <p className="hub-form__platform-disabled">
            Lowercase + underscores. Referenced in flavor templates as{" "}
            <code>{`{${name || "name"}}`}</code>. Locked once created
            — delete and re-add to rename.
          </p>
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Category</span>
          <Select
            value={category}
            onChange={(v) => setCategory(v as VariableCategory)}
            options={CATEGORY_OPTIONS}
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Drives the badge color in the autocomplete dropdown so
            writers see at a glance which surface a variable applies
            to. <strong>Event-only</strong> + <strong>Pool-only</strong>{" "}
            render empty outside their context; the other three
            categories are universal.
          </p>
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">What it renders</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Display name of the streamer."
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Tells the writer what value this token expands to. Be
            explicit about edge cases (e.g. empty string when not
            applicable).
          </p>
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Example</span>
          <Input
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="MarioFan99"
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Shown in the writer&rsquo;s dictionary so they can see
            what the rendered chat line will look like.
          </p>
        </label>

        <p
          className="hub-form__platform-disabled"
          style={{
            padding: "var(--spacing-8) var(--spacing-12)",
            background: "var(--surface-secondary)",
            borderRadius: "var(--radius-medium)",
            margin: 0,
          }}
        >
          <strong>Heads-up:</strong> the engine still has to populate
          this variable at fire time. Until the matching engine code
          ships, <code>{`{${name || "name"}}`}</code> will render
          literally in chat.
        </p>
      </div>
    </Modal>
  );
}
