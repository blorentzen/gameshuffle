"use client";

/**
 * ChatCommandsTab — streamer-level custom chat command editor.
 *
 * Lives under `/account?tab=chat-commands` (sidebar: Streamer → Chat
 * Commands). Reads + writes rows from `gs_custom_commands` for the
 * authenticated streamer's community via the
 * `/api/account/custom-commands` endpoints.
 *
 * Shape:
 *   - Top card: helper text + template-variable cheat sheet.
 *   - A responsive card grid of commands. The first cell is an
 *     "+ Add command" tile. Both Add and Edit open a modal (so nothing
 *     in the grid reflows/pushes when creating or editing) — they share
 *     one form-state set + `CommandFormFields`.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Switch,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { DefaultCommandOverridesSection } from "./DefaultCommandOverridesSection";
import { EventOverridesSection } from "./EventOverridesSection";
import { CommandReference } from "./CommandReference";
import { VariableAutocomplete } from "./VariableAutocomplete";

interface CustomCommandRow {
  id: string;
  community_id: string;
  trigger: string;
  response_tmpl: string;
  actor: "everyone" | "crew" | "host";
  cooldown_s: number;
  enabled: boolean;
  use_count: number;
}

const ACTOR_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "crew", label: "Mods + broadcaster" },
  { value: "host", label: "Broadcaster only" },
];

const ACTOR_LABEL: Record<CustomCommandRow["actor"], string> = {
  everyone: "Everyone",
  crew: "Mods + broadcaster",
  host: "Broadcaster only",
};

const LABEL_STYLE = {
  display: "block",
  marginBottom: "var(--spacing-8)",
} as const;

/**
 * The trigger / who-can-run / response / cooldown field set — shared by
 * the Add and Edit flows (both render it inside the modal) so they can't
 * drift.
 */
function CommandFormFields({
  trigger,
  onTrigger,
  actor,
  onActor,
  response,
  onResponse,
  cooldown,
  onCooldown,
  responseAria,
  showTriggerHint = false,
}: {
  trigger: string;
  onTrigger: (v: string) => void;
  actor: CustomCommandRow["actor"];
  onActor: (v: CustomCommandRow["actor"]) => void;
  response: string;
  onResponse: (v: string) => void;
  cooldown: string;
  onCooldown: (v: string) => void;
  responseAria: string;
  showTriggerHint?: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--spacing-16)",
        }}
      >
        <div>
          <label className="account-card__label" style={LABEL_STYLE}>
            Trigger
          </label>
          <Input
            type="text"
            value={trigger}
            onChange={(e) => onTrigger(e.target.value)}
            placeholder="!discord"
            fullWidth
          />
          {showTriggerHint && (
            <p
              style={{
                margin: "var(--spacing-4) 0 0",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
              }}
            >
              Include the leading <code>!</code>. Single word only.
            </p>
          )}
        </div>
        <div>
          <label className="account-card__label" style={LABEL_STYLE}>
            Who can run it
          </label>
          <Select
            options={ACTOR_OPTIONS}
            value={actor}
            onChange={(v) =>
              onActor(
                (Array.isArray(v) ? v[0] : v) as CustomCommandRow["actor"],
              )
            }
            fullWidth
          />
        </div>
      </div>
      <div style={{ marginTop: "var(--spacing-16)" }}>
        <label className="account-card__label" style={LABEL_STYLE}>
          Response
        </label>
        {/* Both `$name` and `{name}` syntaxes substitute against the same
            variable set. Autocomplete inserts the `{}` form (canonical);
            legacy `$name` in existing commands keeps working. */}
        <VariableAutocomplete
          value={response}
          onChange={onResponse}
          placeholder="👋 Welcome to the stream, {user}!"
          rows={3}
          ariaLabel={responseAria}
        />
      </div>
      <div style={{ marginTop: "var(--spacing-16)", maxWidth: "200px" }}>
        <label className="account-card__label" style={LABEL_STYLE}>
          Cooldown (seconds)
        </label>
        <Input
          type="number"
          min={0}
          max={3600}
          value={cooldown}
          onChange={(e) => onCooldown(e.target.value)}
          fullWidth
        />
      </div>
    </>
  );
}

export function ChatCommandsTab() {
  const [rows, setRows] = useState<CustomCommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noCommunity, setNoCommunity] = useState(false);
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);

  // One modal drives both Add and Edit. `editingId === null` = add mode;
  // otherwise it's the row being edited. One form-state set feeds both.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTrigger, setFormTrigger] = useState("");
  const [formResponse, setFormResponse] = useState("");
  const [formActor, setFormActor] = useState<CustomCommandRow["actor"]>(
    "everyone",
  );
  const [formCooldown, setFormCooldown] = useState("5");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/custom-commands", {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNoCommunity(true);
        setRows([]);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load (${res.status}).`);
        setRows([]);
        return;
      }
      const body = (await res.json()) as {
        rows: CustomCommandRow[];
        community?: { slug: string; displayName: string | null } | null;
      };
      setRows(body.rows);
      setCommunitySlug(body.community?.slug ?? null);
      setNoCommunity(false);
    } catch {
      setLoadError("Network error while loading commands.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setFormTrigger("");
    setFormResponse("");
    setFormActor("everyone");
    setFormCooldown("5");
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: CustomCommandRow) => {
    setEditingId(row.id);
    setFormTrigger(row.trigger);
    setFormResponse(row.response_tmpl);
    setFormActor(row.actor);
    setFormCooldown(String(row.cooldown_s));
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return; // don't drop a save mid-flight
    setModalOpen(false);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    const trigger = formTrigger.trim();
    const responseTmpl = formResponse.trim();
    if (!trigger) return setFormError("Trigger is required.");
    if (!responseTmpl) return setFormError("Response text is required.");
    const cooldown = parseInt(formCooldown, 10);
    if (Number.isNaN(cooldown) || cooldown < 0) {
      return setFormError("Cooldown must be 0 or higher.");
    }
    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit
          ? `/api/account/custom-commands/${editingId}`
          : "/api/account/custom-commands",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger,
            responseTmpl,
            actor: formActor,
            cooldownSeconds: cooldown,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setFormError(body.error || `Save failed (${res.status}).`);
        return;
      }
      toast.success(isEdit ? "Command updated" : "Command saved");
      setModalOpen(false);
      void load();
    } catch {
      setFormError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  /** On/off straight from the card. The row keeps its trigger/response —
   *  a disabled command just stops answering in chat. */
  const toggleEnabled = async (row: CustomCommandRow, next: boolean) => {
    setTogglingId(row.id);
    setLoadError(null);
    try {
      const res = await fetch(`/api/account/custom-commands/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      void load();
    } catch {
      setLoadError("Network error while saving.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/account/custom-commands/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      void load();
    } catch {
      setLoadError("Network error while deleting.");
    } finally {
      setDeletingId(null);
    }
  };

  if (noCommunity) {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">Chat Commands</h2>
        <Alert variant="info">
          Connect Twitch on{" "}
          <a href="/account?tab=integrations">Account → Integrations</a> to
          start your community. Once it&rsquo;s set up the default commands
          (<code>!socials</code>, <code>!discord</code>, <code>!so</code>,
          etc.) will seed automatically and this editor will surface them.
        </Alert>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Chat Commands</h2>
      <p className="account-tab__intro">
        Static-response commands viewers can run with <code>!trigger</code> in
        your Twitch chat. Defaults like <code>!socials</code> and{" "}
        <code>!so</code> are seeded when your community is created. Edit any
        card or add a new one. Use the template variables for dynamic
        responses.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      <Accordion
        variant="bordered"
        defaultOpenIds={["custom"]}
        items={[
          {
            id: "custom",
            title: "Your custom commands",
            description:
              rows === null
                ? "Loading…"
                : rows.length === 0
                  ? "No custom commands yet. Add one to get started."
                  : `${rows.length} custom command${rows.length === 1 ? "" : "s"} on your channel`,
            content: (
              <div>
                {communitySlug && (
                  <div
                    style={{
                      marginBottom: "var(--spacing-16)",
                      padding: "var(--spacing-12) var(--spacing-16)",
                      background: "var(--background-secondary)",
                      borderRadius: "var(--radius-medium)",
                      fontSize: "var(--font-size-14)",
                      color: "var(--text-secondary)",
                      lineHeight: "var(--line-height-relaxed)",
                    }}
                  >
                    📜 Viewers can browse your <code>!quote</code> pool at{" "}
                    <a
                      href={`/quotes/${communitySlug}`}
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: "var(--font-weight-semibold)",
                      }}
                    >
                      gameshuffle.co/quotes/{communitySlug}
                    </a>
                    . Mods grow it with <code>!quote add &lt;text&gt;</code> in
                    chat.
                  </div>
                )}

                {rows === null ? (
                  <p className="account-tab__empty">Loading…</p>
                ) : (
                  <div className="chat-commands__grid">
                    {/* Add tile — opens the modal (no inline reflow). */}
                    <button
                      type="button"
                      className="chat-commands__add-tile"
                      onClick={openAdd}
                      disabled={deletingId !== null}
                    >
                      <span
                        className="chat-commands__add-tile-icon"
                        aria-hidden="true"
                      >
                        +
                      </span>
                      <span className="chat-commands__add-tile-label">
                        Add command
                      </span>
                    </button>

                    {rows.map((row) => (
                      <Card
                        key={row.id}
                        variant="outlined"
                        padding="medium"
                        className="chat-commands__card"
                      >
                        <div className="chat-commands__row-meta">
                          <code className="chat-commands__trigger">
                            {row.trigger}
                          </code>
                          <span className="dc-card__toggle">
                            <Switch
                              checked={row.enabled}
                              onChange={() =>
                                void toggleEnabled(row, !row.enabled)
                              }
                              disabled={
                                togglingId === row.id || deletingId !== null
                              }
                              aria-label={`Enable ${row.trigger}`}
                            />
                          </span>
                        </div>

                        {row.enabled ? (
                          <p className="chat-commands__response">
                            {row.response_tmpl}
                          </p>
                        ) : (
                          <p className="dc-card__preview dc-card__preview--muted">
                            Hidden from chat.
                          </p>
                        )}

                        <div className="dc-card__controls">
                          <span className="dc-card__meta">
                            {ACTOR_LABEL[row.actor]} · {row.cooldown_s}s
                          </span>
                          <div className="dc-card__actions">
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => openEdit(row)}
                              disabled={deletingId !== null}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="small"
                              onClick={() => handleDelete(row.id)}
                              loading={deletingId === row.id}
                              disabled={deletingId !== null}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "defaults",
            title: "Platform default commands",
            description:
              "Built-in commands every streamer gets (!hype, !discord, !8ball, !roll…). Pick Off, Default, or Override per command.",
            content: <DefaultCommandOverridesSection hideHeader />,
          },
          {
            id: "events",
            title: "Platform events",
            description:
              "Curated chaos / random / direct-trigger events. Override flavor text or flip the direct-trigger flag per community.",
            content: <EventOverridesSection hideHeader />,
          },
          {
            id: "variables",
            title: "Template variables reference",
            description:
              "Type `{` in any response or flavor field for inline autocomplete. This card is the at-a-glance reference.",
            content: (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "var(--spacing-8) var(--spacing-16)",
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  <code>{`{user}`}</code>: caller&rsquo;s display name
                </span>
                <span>
                  <code>{`{touser}`}</code>: first @user arg, defaults to
                  caller
                </span>
                <span>
                  <code>{`{streamer}`}</code>: broadcaster name
                </span>
                <span>
                  <code>{`{game}`}</code>: current game
                </span>
                <span>
                  <code>{`{random}`}</code>: 0 to 99
                </span>
                <span>
                  <code>{`{count}`}</code>: usage counter
                </span>
                <span>
                  <code>{`{uptime}`}</code>: stream uptime
                </span>
                <span>
                  <code>{`{followage}`}</code>: caller follow duration
                </span>
                <span>
                  <code>{`{discord_invite}`}</code>: Discord invite
                </span>
                <span>
                  <code>{`{discord}`}</code> / <code>{`{youtube}`}</code> /{" "}
                  <code>{`{twitter}`}</code>: socials
                </span>
                <span>
                  <code>{`{psn}`}</code> / <code>{`{nso}`}</code> /{" "}
                  <code>{`{xbox}`}</code> / <code>{`{steam}`}</code>:
                  gamertags
                </span>
              </div>
            ),
          },
        ]}
      />

      <CommandReference />

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit command" : "Add custom command"}
        size="medium"
        primaryAction={{
          label: saving
            ? "Saving…"
            : editingId
              ? "Save changes"
              : "Save command",
          onClick: () => void handleSave(),
        }}
        secondaryAction={{ label: "Cancel", onClick: closeModal }}
      >
        {formError && (
          <div style={{ marginBottom: "var(--spacing-12)" }}>
            <Alert variant="error" onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          </div>
        )}
        <CommandFormFields
          trigger={formTrigger}
          onTrigger={setFormTrigger}
          actor={formActor}
          onActor={setFormActor}
          response={formResponse}
          onResponse={setFormResponse}
          cooldown={formCooldown}
          onCooldown={setFormCooldown}
          responseAria={editingId ? "Edit command response" : "New command response"}
          showTriggerHint
        />
      </Modal>
    </div>
  );
}
