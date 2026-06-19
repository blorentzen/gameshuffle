"use client";

/**
 * PlatformDefaultCommandsTab — staff/admin-only editor for the
 * global default-command library (Nightbot / StreamElements-style
 * defaults that every streamer gets out of the box).
 *
 * Each row has a trigger + aliases, a category, a response template
 * with variable substitution, and optional `handler` for dynamic
 * commands (`coinflip`, `roll`, `8ball`). The `default_enabled`
 * toggle decides whether new streamers see this command on by
 * default; the platform-wide `enabled` switch is a kill switch the
 * admin can flip to disable a command for everyone (e.g. retiring
 * a meme that hasn't aged well).
 *
 * Engine wiring (dispatcher fallback) is a follow-up — this tab
 * lets the catalog get authored ahead of integration.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import { VariableAutocomplete } from "./VariableAutocomplete";

import {
  AUTHORITY_LABEL,
  type ChatAuthority,
} from "@/lib/twitch/commands/authority";

type Category = "info" | "fun" | "engagement" | "wholesome" | "game";
type Authority = ChatAuthority;

interface CommandRow {
  id: string;
  trigger: string;
  aliases: string[];
  category: Category;
  response_template: string | null;
  handler: string | null;
  description: string;
  inspired_by: string | null;
  default_enabled: boolean;
  enabled: boolean;
  cooldown_seconds: number;
  min_authority: Authority;
  created_at: string;
  updated_at: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  info: "Info",
  fun: "Fun",
  engagement: "Engagement",
  wholesome: "Wholesome",
  game: "Game",
};

const CATEGORY_FILTERS: Array<{ value: "all" | Category; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "info", label: "Info" },
  { value: "fun", label: "Fun" },
  { value: "engagement", label: "Engagement" },
  { value: "wholesome", label: "Wholesome" },
  { value: "game", label: "Game" },
];

export function PlatformDefaultCommandsTab() {
  const [commands, setCommands] = useState<CommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<CommandRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/default-commands", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError("Forbidden — this surface is for GameShuffle staff only.");
        setCommands([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setCommands([]);
        return;
      }
      setCommands(body.commands as CommandRow[]);
    } catch {
      setLoadError("Network error while loading.");
      setCommands([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    commands?.filter(
      (c) => categoryFilter === "all" || c.category === categoryFilter,
    ) ?? [];

  const toggleEnabled = async (row: CommandRow) => {
    const next = !row.enabled;
    setCommands(
      (cur) =>
        cur?.map((c) => (c.id === row.id ? { ...c, enabled: next } : c)) ?? null,
    );
    try {
      const res = await fetch("/api/admin/default-commands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, enabled: next }),
      });
      if (!res.ok) {
        setCommands(
          (cur) =>
            cur?.map((c) =>
              c.id === row.id ? { ...c, enabled: row.enabled } : c,
            ) ?? null,
        );
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Toggle failed (${res.status}).`);
      }
    } catch {
      setCommands(
        (cur) =>
          cur?.map((c) =>
            c.id === row.id ? { ...c, enabled: row.enabled } : c,
          ) ?? null,
      );
      setLoadError("Network error while toggling.");
    }
  };

  const handleDelete = async (row: CommandRow) => {
    if (
      !confirm(
        `Delete !${row.trigger}? Streamers who had this enabled will lose access. This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/default-commands/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      setCommands((cur) => cur?.filter((c) => c.id !== row.id) ?? null);
    } catch {
      setLoadError("Network error while deleting.");
    }
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Default commands</h2>
      <p className="account-tab__intro">
        Platform-wide library of chat commands every streamer gets out
        of the box, inspired by Nightbot and StreamElements defaults.
        Each command is on by default; streamers can override per
        community.{" "}
        <strong>
          Engine dispatch wiring lands in a follow-up — this tab
          authors the catalog ahead of integration.
        </strong>
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
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: "240px" }}>
          <Select
            options={CATEGORY_FILTERS.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
            value={categoryFilter}
            onChange={(v) =>
              setCategoryFilter(
                (Array.isArray(v) ? v[0] : v) as "all" | Category,
              )
            }
            size="small"
            fullWidth
          />
        </div>
        <span
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-12)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {filtered.length} / {commands?.length ?? 0} shown
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add command
          </Button>
        </div>
      </div>

      {commands === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="account-tab__empty">
          {commands.length === 0
            ? "No default commands yet. Add one to seed the library."
            : "No commands match the current filter."}
        </p>
      ) : (
        <table className="platform-events__table">
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Category</th>
              <th>Type</th>
              <th>Authority</th>
              <th>Default</th>
              <th>Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>!{row.trigger}</code>
                  {row.aliases.length > 0 && (
                    <span
                      style={{
                        marginLeft: "var(--spacing-6)",
                        color: "var(--text-tertiary)",
                        fontSize: "var(--font-size-12)",
                      }}
                    >
                      ({row.aliases.map((a) => `!${a}`).join(", ")})
                    </span>
                  )}
                </td>
                <td>{CATEGORY_LABEL[row.category]}</td>
                <td>{row.handler ? `handler: ${row.handler}` : "template"}</td>
                <td>{AUTHORITY_LABEL[row.min_authority]}</td>
                <td>{row.default_enabled ? "on" : "off"}</td>
                <td>
                  <Switch
                    checked={row.enabled}
                    onChange={() => void toggleEnabled(row)}
                  />
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
        <CommandEditorModal
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
  row: CommandRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function CommandEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {
  const isEdit = !!row;
  const [trigger, setTrigger] = useState(row?.trigger ?? "");
  const [aliases, setAliases] = useState((row?.aliases ?? []).join(", "));
  const [category, setCategory] = useState<Category>(row?.category ?? "info");
  const [responseTemplate, setResponseTemplate] = useState(
    row?.response_template ?? "",
  );
  const [handler, setHandler] = useState(row?.handler ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [inspiredBy, setInspiredBy] = useState(row?.inspired_by ?? "");
  const [defaultEnabled, setDefaultEnabled] = useState(
    row?.default_enabled ?? true,
  );
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [cooldownSeconds, setCooldownSeconds] = useState(
    String(row?.cooldown_seconds ?? 30),
  );
  const [minAuthority, setMinAuthority] = useState<Authority>(
    row?.min_authority ?? "viewer",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmedTrigger = trigger.trim().toLowerCase();
    const trimmedTemplate = responseTemplate.trim();
    const trimmedHandler = handler.trim().toLowerCase();
    if (!trimmedTrigger) return setError("Trigger is required.");
    if (!description.trim()) return setError("Description is required.");
    if (!trimmedTemplate && !trimmedHandler) {
      return setError(
        "Command needs either a response template or a handler (or both).",
      );
    }
    const cd = parseInt(cooldownSeconds, 10);
    if (!Number.isInteger(cd) || cd < 0) {
      return setError("Cooldown must be a non-negative integer.");
    }
    const aliasList = aliases
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/default-commands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          trigger: trimmedTrigger,
          aliases: aliasList,
          category,
          response_template: trimmedTemplate || null,
          handler: trimmedHandler || null,
          description: description.trim(),
          inspired_by: inspiredBy.trim() || null,
          default_enabled: defaultEnabled,
          enabled,
          cooldown_seconds: cd,
          min_authority: minAuthority,
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
      title={isEdit ? `Edit !${row.trigger}` : "Add default command"}
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
            Save command
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-16)",
          }}
        >
          <label className="hub-form__field">
            <span className="hub-form__label">Trigger</span>
            <Input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="commands"
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              No <code>!</code> prefix. Lowercase letters, digits,
              hyphens, underscores. Digit-start is fine
              (e.g. <code>8ball</code>).
            </p>
          </label>
          <label className="hub-form__field">
            <span className="hub-form__label">Aliases</span>
            <Input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="help, info"
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              Comma-separated. Each alias acts as a separate trigger.
            </p>
          </label>
        </div>

        <label className="hub-form__field">
          <span className="hub-form__label">Category</span>
          <Select
            value={category}
            onChange={(v) => setCategory(v as Category)}
            options={[
              { value: "info", label: "Info" },
              { value: "fun", label: "Fun" },
              { value: "engagement", label: "Engagement" },
              { value: "wholesome", label: "Wholesome" },
              { value: "game", label: "Game" },
            ]}
            fullWidth
          />
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Response template</span>
          <VariableAutocomplete
            value={responseTemplate}
            onChange={setResponseTemplate}
            rows={3}
            placeholder="👋 Welcome to the stream, {user}!"
            ariaLabel="Response template"
          />
          <p className="hub-form__platform-disabled">
            Posted in chat when the command fires. Supports the same{" "}
            <code>{`{name}`}</code> variables as event flavor templates
            ({"{user}"}, {"{streamer}"}, {"{game}"}, {"{to}"}, etc.).
            Leave empty to defer entirely to the handler. When the
            command has a response pool (see below), use{" "}
            <code>{"{result}"}</code> as the placeholder for the
            randomly-picked entry.
          </p>
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Handler (optional)</span>
          <Input
            value={handler}
            onChange={(e) => setHandler(e.target.value)}
            placeholder="roll"
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Names a built-in dynamic handler for commands whose
            result needs real logic (e.g. <code>roll</code> parses
            NdM dice notation). Random-pick lists (8ball, coinflip,
            hype variants) use the response pool below instead — no
            handler needed. Set this only when the result genuinely
            can&rsquo;t be expressed as a static list.
          </p>
        </label>

        {row && !handler.trim() && (
          <ResponsesEditor commandId={row.id} />
        )}
        {!row && (
          <p
            className="hub-form__platform-disabled"
            style={{
              padding: "var(--spacing-8) var(--spacing-12)",
              background: "var(--surface-secondary)",
              borderRadius: "var(--radius-medium)",
            }}
          >
            Save the command first to manage its response pool.
            Pool entries become the randomized{" "}
            <code>{"{result}"}</code> in chat.
          </p>
        )}

        <label className="hub-form__field">
          <span className="hub-form__label">Description</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this command do?"
            fullWidth
          />
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Inspired by (optional)</span>
          <Input
            value={inspiredBy}
            onChange={(e) => setInspiredBy(e.target.value)}
            placeholder="StreamElements, Nightbot"
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Free-text — where the idea came from. Admin-only reference.
          </p>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-16)",
          }}
        >
          <label className="hub-form__field">
            <span className="hub-form__label">Cooldown (seconds)</span>
            <Input
              type="number"
              min={0}
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(e.target.value)}
              fullWidth
            />
          </label>
          <RadioGroup
            name="min_authority"
            label="Who can fire it"
            orientation="vertical"
            value={minAuthority}
            onChange={(v) => setMinAuthority(v as Authority)}
          >
            <Radio value="viewer" label={AUTHORITY_LABEL.viewer} />
            <Radio value="vip" label={AUTHORITY_LABEL.vip} />
            <Radio value="mod" label={AUTHORITY_LABEL.mod} />
            <Radio value="host" label={AUTHORITY_LABEL.host} />
          </RadioGroup>
        </div>

        <label className="hub-form__inline-field hub-form__inline-field--row">
          <Switch
            checked={defaultEnabled}
            onChange={() => setDefaultEnabled((v) => !v)}
          />
          <span>
            <strong>
              {defaultEnabled ? "On for new streamers" : "Off for new streamers"}
            </strong>
            <span className="hub-form__platform-disabled">
              Whether new streamers get this command enabled by
              default. Existing streamers keep their current override.
            </span>
          </span>
        </label>

        <label className="hub-form__inline-field hub-form__inline-field--row">
          <Switch
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
          />
          <span>
            <strong>
              {enabled ? "Platform enabled" : "Platform disabled"}
            </strong>
            <span className="hub-form__platform-disabled">
              Platform-wide kill switch. When off, no streamer can
              fire this command regardless of their override.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Response pool editor (inline inside the command modal)
// ---------------------------------------------------------------------------

interface PoolResponse {
  id: string;
  command_id: string;
  response: string;
  weight: number;
  sort_order: number;
  enabled: boolean;
}

interface ResponsesEditorProps {
  commandId: string;
}

function ResponsesEditor({ commandId }: ResponsesEditorProps) {
  const [rows, setRows] = useState<PoolResponse[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/default-commands/${commandId}/responses`,
          { cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.ok) {
          setRows(body.responses as PoolResponse[]);
        } else {
          setError(body.error || `Load failed (${res.status}).`);
          setRows([]);
        }
      } catch {
        if (!cancelled) {
          setError("Network error while loading.");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commandId]);

  const totalWeight = (rows ?? [])
    .filter((r) => r.enabled)
    .reduce((acc, r) => acc + r.weight, 0);

  const remove = async (responseId: string) => {
    setError(null);
    const res = await fetch(
      `/api/admin/default-commands/${commandId}/responses/${responseId}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setError(body.error || `Delete failed (${res.status}).`);
      return;
    }
    setRows((prev) => prev?.filter((r) => r.id !== responseId) ?? null);
  };

  const upsert = async (
    response: string,
    weight: number,
    sort_order: number,
    enabled: boolean,
    responseId: string | null,
  ): Promise<boolean> => {
    setError(null);
    const res = await fetch(
      `/api/admin/default-commands/${commandId}/responses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: responseId ?? undefined,
          response,
          weight,
          sort_order,
          enabled,
        }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setError(body.error || `Save failed (${res.status}).`);
      return false;
    }
    const savedId: string = body.id;
    if (responseId) {
      setRows((prev) =>
        prev?.map((r) =>
          r.id === savedId
            ? { ...r, response, weight, sort_order, enabled }
            : r,
        ) ?? null,
      );
    } else {
      setRows((prev) => [
        ...(prev ?? []),
        {
          id: savedId,
          command_id: commandId,
          response,
          weight,
          sort_order,
          enabled,
        },
      ]);
    }
    setEditingId(null);
    return true;
  };

  const toggleEnabled = async (row: PoolResponse) => {
    await upsert(
      row.response,
      row.weight,
      row.sort_order,
      !row.enabled,
      row.id,
    );
  };

  return (
    <div className="hub-form__field">
      <span className="hub-form__label">
        Response pool ({rows?.length ?? 0}
        {totalWeight > 0 && ` · total weight ${totalWeight}`})
      </span>

      {error && (
        <div style={{ margin: "var(--spacing-8) 0" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <p className="hub-form__platform-disabled">
        At fire time the engine picks one entry weighted at random,
        substitutes it as <code>{"{result}"}</code> into the template,
        and posts. Bumping a weight above 100 makes it relatively
        more likely; disabled rows are skipped.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-8)",
          marginTop: "var(--spacing-8)",
        }}
      >
        {rows === null ? (
          <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
            Loading…
          </p>
        ) : (
          rows.map((r) =>
            editingId === r.id ? (
              <ResponseForm
                key={r.id}
                initial={r}
                onCancel={() => setEditingId(null)}
                onSubmit={(response, weight, sort_order, enabled) =>
                  upsert(response, weight, sort_order, enabled, r.id)
                }
              />
            ) : (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-12)",
                  padding: "var(--spacing-8) var(--spacing-12)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-medium)",
                  background: r.enabled
                    ? "var(--surface-secondary)"
                    : "var(--surface-tertiary)",
                  opacity: r.enabled ? 1 : 0.6,
                }}
              >
                <Switch
                  checked={r.enabled}
                  onChange={() => void toggleEnabled(r)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "var(--font-size-14)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.response}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-size-12)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    weight {r.weight}
                    {totalWeight > 0 && r.enabled && (
                      <>
                        {" "}
                        · {Math.round((r.weight / totalWeight) * 100)}%
                        pick chance
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                  <Button
                    size="small"
                    variant="tertiary"
                    onClick={() => setEditingId(r.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="tertiary"
                    onClick={() => void remove(r.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )
        )}

        {editingId === "new" ? (
          <ResponseForm
            initial={null}
            onCancel={() => setEditingId(null)}
            onSubmit={(response, weight, sort_order, enabled) =>
              upsert(response, weight, sort_order, enabled, null)
            }
          />
        ) : rows !== null ? (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setEditingId("new")}
          >
            + Add response
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface ResponseFormProps {
  initial: PoolResponse | null;
  onCancel: () => void;
  onSubmit: (
    response: string,
    weight: number,
    sort_order: number,
    enabled: boolean,
  ) => Promise<boolean>;
}

function ResponseForm({ initial, onCancel, onSubmit }: ResponseFormProps) {
  const isEdit = !!initial;
  const [response, setResponse] = useState(initial?.response ?? "");
  const [weight, setWeight] = useState(String(initial?.weight ?? 100));
  const [sortOrder, setSortOrder] = useState(
    String(initial?.sort_order ?? 0),
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    const trimmed = response.trim();
    if (!trimmed) {
      setLocalError("Response text is required.");
      return;
    }
    const w = parseInt(weight, 10);
    if (!Number.isInteger(w) || w <= 0) {
      setLocalError("Weight must be a positive integer.");
      return;
    }
    const so = parseInt(sortOrder, 10);
    if (!Number.isInteger(so)) {
      setLocalError("Sort order must be an integer.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed, w, so, enabled);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-12)",
        padding: "var(--spacing-12)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-medium)",
        background: "var(--surface-primary)",
      }}
    >
      {localError && (
        <Alert variant="error" onClose={() => setLocalError(null)}>
          {localError}
        </Alert>
      )}

      <label className="hub-form__field">
        <span className="hub-form__label">Response</span>
        <VariableAutocomplete
          value={response}
          onChange={setResponse}
          rows={2}
          placeholder="Reply hazy, try again."
          ariaLabel="Pool response"
        />
        <p className="hub-form__platform-disabled">
          The text that fills <code>{"{result}"}</code> in the
          template. Variables work here too (e.g. <code>{"{user}"}</code>).
        </p>
      </label>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--spacing-12)",
        }}
      >
        <label className="hub-form__field">
          <span className="hub-form__label">Weight</span>
          <Input
            type="number"
            min={1}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Default 100. Higher = more likely.
          </p>
        </label>
        <label className="hub-form__field">
          <span className="hub-form__label">Sort order</span>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Display only — doesn&rsquo;t affect picks.
          </p>
        </label>
      </div>

      <label className="hub-form__inline-field hub-form__inline-field--row">
        <Switch
          checked={enabled}
          onChange={() => setEnabled((v) => !v)}
        />
        <span>
          <strong>{enabled ? "Enabled" : "Disabled"}</strong>
          <span className="hub-form__platform-disabled">
            Disabled entries stay in the pool but never get picked —
            useful for retiring a line without losing the text.
          </span>
        </span>
      </label>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--spacing-8)",
        }}
      >
        <Button
          size="small"
          variant="tertiary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          disabled={submitting}
        >
          {isEdit ? "Save response" : "Add response"}
        </Button>
      </div>
    </div>
  );
}
