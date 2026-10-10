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
  EmptyState,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@empac/cascadeds";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { AdminRowMenu, AdminScreen, AdminTable } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { IconMessage, IconPlus, IconScript } from "@tabler/icons-react";
import { DefaultCommandOverridesSection } from "./DefaultCommandOverridesSection";
import { EventOverridesSection } from "./EventOverridesSection";
import { CommandReference } from "./CommandReference";
import { VariableAutocomplete } from "./VariableAutocomplete";
import { LoadingLines } from "@/components/loading/LoadingLines";

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

/** "custom" = your commands (Streaming ▸ Chat ▸ Commands); "builtin" = the
 *  built-in commands, events, variables and the reference (▸ Built-in). */
/** Some stored triggers already start with "!" (older rows), some don't. */
const cmdName = (t: string) => (t.startsWith("!") ? t : `!${t}`);

export function ChatCommandsTab({ part = "custom" }: { part?: "custom" | "builtin" } = {}) {
  const confirm = useConfirm();
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

  const handleDelete = async (row: CustomCommandRow) => {
    const ok = await confirm({ title: `Delete ${cmdName(row.trigger)}?`, body: "Chat stops answering it. Its use count goes too.", confirmLabel: `Delete ${cmdName(row.trigger)}` });
    if (!ok) return;
    const id = row.id;
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

  if (part === "builtin") {
    return (
      <AdminScreen title="Built-in commands" intro="The commands every channel gets, chaos and random events, and the variables you can use in any reply. Turn each off, keep the default or write your own reply.">
        <Accordion
          variant="bordered"
          defaultOpenIds={["defaults"]}
          items={[
            {
              id: "defaults",
              title: "Built-in commands",
              description: "!hype, !discord, !8ball, !roll and the rest. Off, default, or your own reply.",
              content: <DefaultCommandOverridesSection hideHeader />,
            },
            {
              id: "events",
              title: "Chaos and random events",
              description: "Change an event's wording, or whether viewers can trigger it directly.",
              content: <EventOverridesSection hideHeader />,
            },
            {
              id: "variables",
              title: "Variables",
              description: "Type { in a reply to pick one. Here they all are.",
              content: (
                <div className="cmd-vars">
                  <span><code>{`{user}`}</code>: who typed the command</span>
                  <span><code>{`{touser}`}</code>: the first @name, or who typed it</span>
                  <span><code>{`{streamer}`}</code>: your name</span>
                  <span><code>{`{game}`}</code>: what you&apos;re playing</span>
                  <span><code>{`{random}`}</code>: 0 to 99</span>
                  <span><code>{`{count}`}</code>: times it&apos;s been used</span>
                  <span><code>{`{uptime}`}</code>: how long you&apos;ve been live</span>
                  <span><code>{`{followage}`}</code>: how long they&apos;ve followed</span>
                  <span><code>{`{discord_invite}`}</code>: your Discord invite</span>
                  <span><code>{`{discord}`}</code> / <code>{`{youtube}`}</code> / <code>{`{twitter}`}</code>: socials</span>
                  <span><code>{`{psn}`}</code> / <code>{`{nso}`}</code> / <code>{`{xbox}`}</code> / <code>{`{steam}`}</code>: gamertags</span>
                </div>
              ),
            },
          ]}
        />
        <CommandReference />
      </AdminScreen>
    );
  }

  if (noCommunity) {
    return (
      <AdminScreen title="Commands" intro="Your own !commands and what the bot replies.">
        <Alert variant="info">
          Connect Twitch on <a href="/account/streaming?tab=integrations">Streaming ▸ Setup</a> to start
          your community. The default commands (<code>!socials</code>, <code>!discord</code>, <code>!so</code> and
          more) are added for you, and you can edit them here.
        </Alert>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Commands"
      intro={<>Your own <code>!commands</code> and what the bot replies. Type <code>{"{"}</code> in a reply to add your socials, the game and more.</>}
      actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={openAdd}>New command</Button>}
    >
      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}
      {rows === null ? (
        <LoadingLines label="Loading" />
      ) : rows.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconMessage size={28} />} title="No commands yet" description="Add one, like !discord or !rules, and the bot answers it in your chat." action={<Button variant="secondary" size="small" onClick={openAdd}>New command</Button>} />
      ) : (
        <AdminTable label="Your commands">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Command</TableHead>
                <TableHead>Reply</TableHead>
                <TableHead>Who</TableHead>
                <TableHead align="right">Uses</TableHead>
                <TableHead>On</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><code className="chat-commands__trigger">{cmdName(row.trigger)}</code></TableCell>
                  <TableCell>
                    <span className={`cmd-reply${row.enabled ? "" : " cmd-reply--off"}`}>{row.enabled ? row.response_tmpl : "Off: hidden from chat"}</span>
                    {row.cooldown_s > 0 && <span className="admin-table__sub">Every {row.cooldown_s}s</span>}
                  </TableCell>
                  <TableCell>{ACTOR_LABEL[row.actor]}</TableCell>
                  <TableCell align="right" className="admin-num">{row.use_count.toLocaleString("en-US")}</TableCell>
                  <TableCell>
                    <Switch checked={row.enabled} onChange={() => void toggleEnabled(row, !row.enabled)} disabled={togglingId === row.id || deletingId !== null} aria-label={`${cmdName(row.trigger)} on`} />
                  </TableCell>
                  <TableCell align="right">
                    <span className="admin-row-actions">
                      <Button variant="ghost" size="small" onClick={() => openEdit(row)} disabled={deletingId !== null} aria-label={`Edit ${cmdName(row.trigger)}`}>Edit</Button>
                      <AdminRowMenu label={`More for ${cmdName(row.trigger)}`} items={[{ label: `Delete ${cmdName(row.trigger)}`, danger: true, onClick: () => void handleDelete(row) }]} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      {communitySlug && (
        <p className="admin-field__help">
          <IconScript size={14} stroke={1.9} aria-hidden /> Viewers can browse your <code>!quote</code> pool at{" "}
          <a href={`/quotes/${communitySlug}`}>gameshuffle.co/quotes/{communitySlug}</a>. Mods add to it with <code>!quote add &lt;text&gt;</code>.
        </p>
      )}

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
    </AdminScreen>
  );
}
