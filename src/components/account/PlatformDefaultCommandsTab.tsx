"use client";

/**
 * Platform ▸ Chat bot ▸ Commands (staff/admin): the ready-made chat commands
 * every channel gets without setting anything up (!lurk, !8ball, !roll…).
 *
 * How one answers in chat (src/lib/twitch/commands/defaultCommandsFallback.ts):
 *   - it must be allowed here (`enabled`, the kill switch for every channel)
 *     and on for that channel (the streamer's own choice, else
 *     `default_enabled`);
 *   - the reply is the reply text (or the streamer's own reply), with
 *     {result} filled by built-in logic (`handler`) or by a weighted random
 *     pick from the reply list (the entries edited here plus any the channel
 *     added with `!<command> add`).
 *
 * Data: /api/admin/default-commands (GET list, PUT upsert), DELETE /[id];
 * reply lists: /[id]/responses (GET, POST upsert) and DELETE
 * /[id]/responses/[responseId]. Staff/admin only.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  StatCard,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@empac/cascadeds";
import { IconBan, IconMessageChatbot, IconMessages, IconPlus, IconToggleLeft } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminPanel, AdminRowMenu, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { VariableAutocomplete } from "./VariableAutocomplete";
import { AUTHORITY_LABEL, CHAT_AUTHORITIES, type ChatAuthority } from "@/lib/twitch/commands/authority";
import { HANDLER_INFO } from "@/lib/twitch/commands/handlerInfo";

type Category = "info" | "fun" | "engagement" | "wholesome" | "game";

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
  min_authority: ChatAuthority;
  created_at: string;
  updated_at: string;
}

interface PoolResponse {
  id: string;
  command_id: string;
  response: string;
  weight: number;
  sort_order: number;
  enabled: boolean;
}

const CATEGORIES: Category[] = ["info", "fun", "engagement", "wholesome", "game"];

const CATEGORY: Record<Category, { label: string; about: string }> = {
  info: { label: "Info", about: "Links and facts about the channel, like !discord" },
  fun: { label: "Fun", about: "Jokes and little games, like !8ball" },
  engagement: { label: "Engagement", about: "Hellos, lurking and shoutouts" },
  wholesome: { label: "Wholesome", about: "Kind words, like !compliment" },
  game: { label: "Game", about: "About the game on stream" },
};

/** Built-in logic a command can use, named for staff (defined with the handlers themselves). */
const BUILT_IN = HANDLER_INFO;

const ALL = "all";
const NONE = "none";
const PAGE = 25;
const NAME_RULE = /^[a-z0-9][a-z0-9_-]*$/;
const NAME_RULE_TEXT = "Use lowercase letters, numbers, dashes and underscores, like 8ball or shout-out.";

const ERRORS: Record<string, string> = {
  unauthenticated: "Your session ended. Sign in again, then try once more.",
  forbidden: "Only GameShuffle staff can change these commands.",
  bad_json: "That didn't send properly. Try again.",
  trigger_required: "Add a command name.",
  invalid_category: "Pick a category.",
  invalid_min_authority: "Pick who can use it.",
  description_required: "Add a short line on what it does.",
  missing_id: "That command wasn't found. Refresh the page.",
  missing_command_id: "That command wasn't found. Refresh the page.",
  response_required: "Write the reply first.",
  response_not_found: "That reply wasn't found. It may have been removed already, so reopen the list.",
};

/** The API answers with short codes, a sentence or a database message.
 *  Staff get plain words either way. */
function errorText(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw : "";
  if (ERRORS[s]) return ERRORS[s];
  if (/duplicate key|unique constraint|already exists/i.test(s)) return "Another command already uses that name.";
  if (s.startsWith("Trigger must")) return NAME_RULE_TEXT;
  if (s.startsWith("Handler must")) return "Chat doesn't know that built-in logic. Pick one from the list.";
  if (s.startsWith("Command needs")) return "Add a reply, or pick built-in logic.";
  if (s.startsWith("Cannot edit community") || s.startsWith("Cannot delete community")) return "That reply belongs to a streamer's channel, so it can't be changed here.";
  return fallback;
}

const OFFLINE = "Couldn't reach GameShuffle. Check your connection and try again.";

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && body.ok !== false, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}

const usesList = (row: CommandRow) => !row.handler;
/** Random commands pick from their list; a fixed reply only uses one if
 *  someone adds {result} to it. */
const isRandom = (row: CommandRow) => usesList(row) && (!row.response_template?.trim() || row.response_template.includes("{result}"));

/** What a command does when it answers, in a few words. */
function replyKind(row: CommandRow): string {
  if (row.handler) return BUILT_IN[row.handler]?.label ?? "Built-in logic";
  return isRandom(row) ? "Random from its list" : "Same reply each time";
}

const stripBang = (s: string) => s.trim().toLowerCase().replace(/^!+/, "");

export function PlatformDefaultCommandsTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [commands, setCommands] = useState<CommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<CommandRow | "new" | null>(null);
  const [replies, setReplies] = useState<CommandRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call("/api/admin/default-commands", { cache: "no-store" });
    if (r.status === 403) {
      setLoadError("Only GameShuffle staff can see these commands.");
      setCommands([]);
      return;
    }
    if (!r.ok) {
      setLoadError(r.status === 0 ? OFFLINE : "Couldn't load the commands. Refresh the page to try again.");
      setCommands([]);
      return;
    }
    setLoadError(null);
    setCommands(r.body.commands as CommandRow[]);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = stripBang(q);
    return (commands ?? []).filter(
      (c) =>
        (category === ALL || c.category === category) &&
        (!needle ||
          c.trigger.includes(needle) ||
          c.aliases.some((a) => a.includes(needle)) ||
          c.description.toLowerCase().includes(needle) ||
          (c.response_template ?? "").toLowerCase().includes(needle)),
    );
  }, [commands, category, q]);
  const shown = filtered.slice(0, limit);

  const stats = useMemo(() => {
    const list = commands ?? [];
    return {
      total: list.length,
      categories: new Set(list.map((c) => c.category)).size,
      blocked: list.filter((c) => !c.enabled).length,
      defaultOff: list.filter((c) => !c.default_enabled).length,
    };
  }, [commands]);

  const setAllowed = async (row: CommandRow, next: boolean) => {
    if (!next) {
      const ok = await confirm({
        title: `Block !${row.trigger} on every channel?`,
        body: "Chat stops answering it everywhere, even on channels that have it on. You can allow it again any time.",
        confirmLabel: "Block everywhere",
      });
      if (!ok) return;
    }
    setBusy(row.id);
    setCommands((cur) => cur?.map((c) => (c.id === row.id ? { ...c, enabled: next } : c)) ?? null);
    const r = await call("/api/admin/default-commands", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...row, enabled: next }),
    });
    setBusy(null);
    if (!r.ok) {
      setCommands((cur) => cur?.map((c) => (c.id === row.id ? { ...c, enabled: row.enabled } : c)) ?? null);
      toast.error(r.status === 0 ? OFFLINE : errorText(r.body.error, "That didn't save. Try again."));
      return;
    }
    toast.success(next ? `!${row.trigger} allowed on every channel` : `!${row.trigger} blocked everywhere`);
  };

  const remove = async (row: CommandRow) => {
    const ok = await confirm({
      title: `Delete !${row.trigger}?`,
      body: "It goes from every channel, along with any replies streamers added to it and any reply they wrote for it. This can't be undone. To stop it for now, block it instead.",
      confirmLabel: "Delete command",
    });
    if (!ok) return;
    const r = await call(`/api/admin/default-commands/${row.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error(r.status === 0 ? OFFLINE : errorText(r.body.error, `Couldn't delete !${row.trigger}. Try again.`));
      return;
    }
    setCommands((cur) => cur?.filter((c) => c.id !== row.id) ?? null);
    toast.success(`!${row.trigger} deleted`);
  };

  const addButton = (
    <Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>
      Add command
    </Button>
  );

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Ready-made commands"
        intro="The chat commands every channel gets without any setup, like !lurk, !8ball and !roll."
        actions={addButton}
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {commands && commands.length > 0 && (
        <AdminStats columns={3} label="Commands at a glance">
          <StatCard
            label="Commands"
            value={stats.total.toLocaleString()}
            source={`In ${stats.categories.toLocaleString()} ${stats.categories === 1 ? "category" : "categories"}`}
            icon={<IconMessageChatbot size={20} />}
          />
          <StatCard
            label="Blocked everywhere"
            value={stats.blocked.toLocaleString()}
            source={stats.blocked ? "Chat doesn't answer these on any channel" : "Every command is allowed"}
            icon={<IconBan size={20} />}
            variant={stats.blocked ? "accent" : "default"}
          />
          <StatCard
            label="Off by default"
            value={stats.defaultOff.toLocaleString()}
            source={stats.defaultOff ? "Streamers turn these on themselves" : "Every command starts on"}
            icon={<IconToggleLeft size={20} />}
          />
        </AdminStats>
      )}

      <AdminSection
        title={commands && commands.length > 0 ? `All commands (${commands.length.toLocaleString()})` : "All commands"}
        intro="A command answers on a channel when it's allowed here and the streamer has it on. Default is where it starts before the streamer chooses. Streamers switch commands and write their own replies in Streaming ▸ Chat ▸ Commands."
      >
        {commands === null ? (
          <LoadingLines label="Loading the commands" />
        ) : commands.length === 0 ? (
          !loadError && (
            <EmptyState
              variant="bordered"
              icon={<IconMessageChatbot size={28} aria-hidden />}
              title="No ready-made commands yet"
              description="Add the first one and every channel gets it."
              action={addButton}
            />
          )
        ) : (
          <>
            <div className="admin-filters">
              <Input
                fullWidth
                floatingLabel="Search by name, reply or what it does"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
              />
              <Select
                fullWidth
                floatingLabel="Category"
                value={category}
                onChange={(v) => {
                  setCategory(String(Array.isArray(v) ? v[0] : v));
                  setLimit(PAGE);
                }}
                options={[{ value: ALL, label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY[c].label }))]}
              />
            </div>
            <AdminTable label="Ready-made commands">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Command</TableHead>
                    <TableHead>Reply</TableHead>
                    <TableHead>Who can use it</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Allowed</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <TableEmpty title="No commands match" description="Try another word, or set Category to All categories." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    shown.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="admin-cmds-name">!{row.trigger}</span>
                          <span className="admin-table__sub">{CATEGORY[row.category]?.label ?? row.category}</span>
                          {row.aliases.length > 0 && (
                            <span className="admin-table__sub admin-cmds-nowrap">Also {row.aliases.map((a) => `!${a}`).join(", ")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="admin-cmds-kind">{replyKind(row)}</span>
                          <span className="admin-cmds-reply">{row.response_template?.trim() || "Posts the picked reply as it is"}</span>
                        </TableCell>
                        <TableCell className="admin-cmds-nowrap">{AUTHORITY_LABEL[row.min_authority] ?? row.min_authority}</TableCell>
                        <TableCell>
                          <Badge size="small" variant={row.default_enabled ? "success" : "default"}>
                            {row.default_enabled ? "On" : "Off"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            aria-label={`Allow !${row.trigger} on every channel`}
                            checked={row.enabled}
                            disabled={busy === row.id}
                            onChange={(e) => void setAllowed(row, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <span className="admin-row-actions">
                            {isRandom(row) && (
                              <Button variant="ghost" size="small" aria-label={`Replies for !${row.trigger}`} onClick={() => setReplies(row)}>
                                Replies
                              </Button>
                            )}
                            <Button variant="ghost" size="small" aria-label={`Edit !${row.trigger}`} onClick={() => setEditing(row)}>
                              Edit
                            </Button>
                            <AdminRowMenu
                              label={`More for !${row.trigger}`}
                              items={[
                                ...(usesList(row) && !isRandom(row) ? [{ label: "Reply list", onClick: () => setReplies(row) }] : []),
                                { label: "Delete", danger: true, onClick: () => void remove(row) },
                              ]}
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </AdminTable>
            {filtered.length > 0 && (
              <div className="admin-cmds-more">
                <p className="admin-updated">
                  Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()}
                </p>
                {filtered.length > limit && (
                  <Button variant="secondary" size="small" onClick={() => setLimit((n) => n + PAGE)}>
                    Show more
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </AdminSection>

      {editing && (
        <CommandEditorModal
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {replies && <ReplyListModal command={replies} onClose={() => setReplies(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add or edit a command
// ---------------------------------------------------------------------------

type FieldErrors = Partial<Record<"name" | "description" | "reply" | "cooldown", string>>;

function CommandEditorModal({ row, onClose, onSaved }: { row: CommandRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!row;
  const [trigger, setTrigger] = useState(row ? `!${row.trigger}` : "");
  const [aliases, setAliases] = useState((row?.aliases ?? []).map((a) => `!${a}`).join(", "));
  const [category, setCategory] = useState<Category>(row?.category ?? "info");
  const [responseTemplate, setResponseTemplate] = useState(row?.response_template ?? "");
  const [handler, setHandler] = useState(row?.handler ?? NONE);
  const [description, setDescription] = useState(row?.description ?? "");
  const [inspiredBy, setInspiredBy] = useState(row?.inspired_by ?? "");
  const [defaultEnabled, setDefaultEnabled] = useState(row?.default_enabled ?? true);
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [cooldownSeconds, setCooldownSeconds] = useState(String(row?.cooldown_seconds ?? 30));
  const [minAuthority, setMinAuthority] = useState<ChatAuthority>(row?.min_authority ?? "viewer");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const saved = row?.handler ?? null;
  const handlerOptions = [
    { value: NONE, label: "None", description: "The reply text, or a random pick from the command's reply list" },
    ...Object.entries(BUILT_IN).map(([value, b]) => ({ value, label: b.label, description: b.about })),
    // A command saved with logic this screen doesn't name yet stays pickable.
    ...(saved && !BUILT_IN[saved] ? [{ value: saved, label: "Built-in logic set by a developer", description: "Leave as is unless a developer says otherwise" }] : []),
  ];

  const save = async () => {
    setSaveError(null);
    const name = stripBang(trigger);
    const template = responseTemplate.trim();
    const logic = handler === NONE ? "" : handler;
    const cd = Number(cooldownSeconds);
    const next: FieldErrors = {};
    if (!name) next.name = "Add a command name.";
    else if (!NAME_RULE.test(name)) next.name = NAME_RULE_TEXT;
    if (!description.trim()) next.description = "Add a short line on what it does.";
    if (!template && !logic) next.reply = "Add a reply, or pick built-in logic below.";
    if (cooldownSeconds.trim() === "" || !Number.isInteger(cd) || cd < 0) next.cooldown = "Use a whole number of seconds, 0 or more.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const aliasList = aliases.split(",").map(stripBang).filter((a) => a.length > 0);
    setSaving(true);
    const r = await call("/api/admin/default-commands", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row?.id,
        trigger: name,
        aliases: aliasList,
        category,
        response_template: template || null,
        handler: logic || null,
        description: description.trim(),
        inspired_by: inspiredBy.trim() || null,
        default_enabled: defaultEnabled,
        enabled,
        cooldown_seconds: cd,
        min_authority: minAuthority,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      setSaveError(r.status === 0 ? OFFLINE : errorText(r.body.error, "That didn't save. Check the fields and try again."));
      return;
    }
    toast.success(isEdit ? `!${name} saved` : `!${name} added`);
    onSaved();
  };

  const logicAbout = handler !== NONE ? BUILT_IN[handler]?.about : null;

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit !${row.trigger}` : "Add a command"}
      size="large"
      footer={
        <div className="admin-cmds-modal-actions">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving}>
            {isEdit ? "Save command" : "Add command"}
          </Button>
        </div>
      }
    >
      <form className="admin-form admin-cmds-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {saveError && <Alert variant="error" onClose={() => setSaveError(null)}>{saveError}</Alert>}

        <fieldset className="admin-cmds-group">
          <legend className="admin-cmds-group__title">The command</legend>
          <div className="admin-form-grid">
            <AdminField label="Command name" error={errors.name} helper="What chat types. Lowercase letters, numbers, dashes and underscores.">
              {(id, d) => (
                <Input id={id} aria-describedby={d} aria-invalid={!!errors.name} variant={errors.name ? "error" : "default"} value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="!lurk" fullWidth autoComplete="off" />
              )}
            </AdminField>
            <AdminField label="Other names (optional)" helper="Separate with commas. Each works the same as the main name.">
              {(id, d) => (
                <Input id={id} aria-describedby={d} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="!hello, !hey" fullWidth autoComplete="off" />
              )}
            </AdminField>
          </div>
          <AdminField label="Category" helper={CATEGORY[category].about}>
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(v) => setCategory((Array.isArray(v) ? v[0] : v) as Category)}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY[c].label, description: CATEGORY[c].about }))}
                fullWidth
              />
            )}
          </AdminField>
          <AdminField label="What it does" error={errors.description} helper="One short line. Streamers can see it in their commands list.">
            {(id, d) => (
              <Textarea id={id} aria-describedby={d} aria-invalid={!!errors.description} variant={errors.description ? "error" : "default"} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Lets a viewer say they're watching quietly." fullWidth />
            )}
          </AdminField>
        </fieldset>

        <fieldset className="admin-cmds-group">
          <legend className="admin-cmds-group__title">What chat sees</legend>
          <ReplyField
            label="Reply"
            value={responseTemplate}
            onChange={setResponseTemplate}
            placeholder="Welcome to the stream, {user}!"
            error={errors.reply}
            helper={`Type { to add a detail, like {user} for the viewer or {streamer} for the channel. For a random reply each time, put {result} where the picked reply goes${isEdit ? ", then fill its list with Replies in the commands table" : ", save, then fill its list with Replies in the commands table"}. Channels that wrote their own reply keep theirs.`}
          />
          <AdminField
            label="Built-in logic"
            helper={logicAbout ?? "For replies a list can't cover, like dice rolls. Commands with built-in logic don't use a reply list."}
          >
            {(id) => <Select id={id} value={handler} onChange={(v) => setHandler(String(Array.isArray(v) ? v[0] : v))} options={handlerOptions} fullWidth />}
          </AdminField>
        </fieldset>

        <fieldset className="admin-cmds-group">
          <legend className="admin-cmds-group__title">Who and how often</legend>
          <div className="admin-form-grid">
            <AdminField label="Who can use it" helper="VIP+ means VIPs, mods and the streamer. Mod+ means mods and the streamer.">
              {(id) => (
                <Select
                  id={id}
                  value={minAuthority}
                  onChange={(v) => setMinAuthority((Array.isArray(v) ? v[0] : v) as ChatAuthority)}
                  options={CHAT_AUTHORITIES.map((a) => ({ value: a, label: AUTHORITY_LABEL[a] }))}
                  fullWidth
                />
              )}
            </AdminField>
            <AdminField label="Wait between uses (seconds)" error={errors.cooldown} helper="How long each viewer waits before using it again. 0 means no wait.">
              {(id, d) => (
                <Input id={id} aria-describedby={d} aria-invalid={!!errors.cooldown} variant={errors.cooldown ? "error" : "default"} type="number" min={0} inputMode="numeric" value={cooldownSeconds} onChange={(e) => setCooldownSeconds(e.target.value)} fullWidth />
              )}
            </AdminField>
          </div>
        </fieldset>

        <fieldset className="admin-cmds-group">
          <legend className="admin-cmds-group__title">On or off</legend>
          <Switch
            label="On by default"
            helperText="Where a channel starts before the streamer chooses. Streamers who already turned it on or off keep their choice."
            checked={defaultEnabled}
            onChange={(e) => setDefaultEnabled(e.target.checked)}
          />
          <Switch
            label="Allowed on every channel"
            helperText="Off blocks it everywhere, whatever the streamer chose. Use it to retire a command without deleting it."
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </fieldset>

        <fieldset className="admin-cmds-group">
          <legend className="admin-cmds-group__title">Staff note</legend>
          <AdminField label="Where the idea came from (optional)" helper="Only staff see this.">
            {(id, d) => (
              <Input id={id} aria-describedby={d} value={inspiredBy} onChange={(e) => setInspiredBy(e.target.value)} placeholder="Nightbot, StreamElements" fullWidth autoComplete="off" />
            )}
          </AdminField>
        </fieldset>
      </form>
    </Modal>
  );
}

/** A labelled reply box. The suggestion box takes no id, so it is named
 *  through aria-label instead of a label element. */
function ReplyField({ label, value, onChange, placeholder, helper, error, rows = 3 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper: ReactNode;
  error?: string;
  rows?: number;
}) {
  return (
    <div className="admin-field">
      <span className="admin-field__label" aria-hidden>{label}</span>
      <VariableAutocomplete value={value} onChange={onChange} rows={rows} placeholder={placeholder} ariaLabel={label} />
      {error && <p className="admin-field__error" role="alert">{error}</p>}
      <p className="admin-field__help">{helper}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A command's reply list
// ---------------------------------------------------------------------------

type ReplyForm = { mode: "new" } | { mode: "edit"; row: PoolResponse };

function ReplyListModal({ command, onClose }: { command: CommandRow; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<PoolResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ReplyForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const base = `/api/admin/default-commands/${command.id}/responses`;

  useEffect(() => {
    let live = true;
    void call(base, { cache: "no-store" }).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.body.responses as PoolResponse[]);
      else {
        setLoadError(r.status === 0 ? OFFLINE : "Couldn't load the replies. Close this and try again.");
        setRows([]);
      }
    });
    return () => {
      live = false;
    };
  }, [base]);

  const inUse = (rows ?? []).filter((r) => r.enabled);
  const totalWeight = inUse.reduce((acc, r) => acc + r.weight, 0);
  const chance = (r: PoolResponse) => {
    if (!r.enabled || totalWeight <= 0) return "Off";
    const pct = (r.weight / totalWeight) * 100;
    return pct > 0 && pct < 1 ? "Under 1%" : `${Math.round(pct)}%`;
  };
  const template = command.response_template?.trim() ?? "";
  const listUnused = !!template && !template.includes("{result}");

  const upsert = async (response: string, weight: number, sort_order: number, enabled: boolean, responseId: string | null, done: string): Promise<boolean> => {
    const r = await call(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_id: responseId ?? undefined, response, weight, sort_order, enabled }),
    });
    if (!r.ok) {
      toast.error(r.status === 0 ? OFFLINE : errorText(r.body.error, "That reply didn't save. Try again."));
      return false;
    }
    const savedId = r.body.id as string;
    if (responseId) {
      setRows((prev) => prev?.map((x) => (x.id === savedId ? { ...x, response, weight, sort_order, enabled } : x)) ?? null);
    } else {
      setRows((prev) => [...(prev ?? []), { id: savedId, command_id: command.id, response, weight, sort_order, enabled }]);
    }
    toast.success(done);
    return true;
  };

  const toggle = async (row: PoolResponse, next: boolean) => {
    setBusy(row.id);
    await upsert(row.response, row.weight, row.sort_order, next, row.id, next ? "Reply back in use" : "Reply switched off");
    setBusy(null);
  };

  const removeReply = async (row: PoolResponse) => {
    const short = row.response.length > 80 ? `${row.response.slice(0, 80)}…` : row.response;
    const ok = await confirm({
      title: "Remove this reply?",
      body: `"${short}" goes from !${command.trigger} on every channel. This can't be undone. To stop it for now, switch it off instead.`,
      confirmLabel: "Remove reply",
    });
    if (!ok) return;
    const r = await call(`${base}/${row.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error(r.status === 0 ? OFFLINE : errorText(r.body.error, "Couldn't remove that reply. Try again."));
      return;
    }
    setRows((prev) => prev?.filter((x) => x.id !== row.id) ?? null);
    if (form?.mode === "edit" && form.row.id === row.id) setForm(null);
    toast.success("Reply removed");
  };

  const shown = (rows ?? []).slice(0, limit);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Replies for !${command.trigger}`}
      size="large"
      footer={
        <div className="admin-cmds-modal-actions">
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="admin-cmds-replies">
        <p className="admin-cmds-replies__intro">
          {`Each time someone uses !${command.trigger}, chat gets one of these at random. Weight sets how often each comes up: 100 is normal, 200 twice as often. Changes save straight away. Replies a streamer adds on their own channel aren't listed here.`}
        </p>

        {listUnused && rows !== null && rows.length > 0 && (
          <Alert variant="warning" title="Chat doesn't see this list yet">
            {"The command's reply has no {result}, so the picked reply has nowhere to go. Edit the command and put {result} where it belongs."}
          </Alert>
        )}
        {loadError && <Alert variant="error">{loadError}</Alert>}

        {rows === null ? (
          <LoadingLines label="Loading the replies" />
        ) : (
          <>
            <div className="admin-cmds-replies__bar">
              <p className="admin-cmds-replies__count">
                {rows.length === 0
                  ? "No replies yet"
                  : `${rows.length.toLocaleString()} ${rows.length === 1 ? "reply" : "replies"}, ${inUse.length.toLocaleString()} in use`}
              </p>
              {!form && !loadError && rows.length > 0 && (
                <Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setForm({ mode: "new" })}>
                  Add a reply
                </Button>
              )}
            </div>

            {form && (
              <ReplyFormPanel
                key={form.mode === "edit" ? form.row.id : "new"}
                initial={form.mode === "edit" ? form.row : null}
                nextOrder={rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0}
                onCancel={() => setForm(null)}
                onSubmit={async (response, weight, sortOrder, enabled) => {
                  const ok = await upsert(response, weight, sortOrder, enabled, form.mode === "edit" ? form.row.id : null, form.mode === "edit" ? "Reply saved" : "Reply added");
                  if (ok) setForm(null);
                }}
              />
            )}

            {rows.length === 0 ? (
              !loadError && !form && (
                <EmptyState
                  variant="bordered"
                  icon={<IconMessages size={28} aria-hidden />}
                  title="No replies yet"
                  description={listUnused
                    ? `!${command.trigger} gives the same reply each time. To make it random, add replies here and put {result} in its reply where the pick should go.`
                    : `Add a few so chat gets a different one each time someone uses !${command.trigger}.`}
                  action={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setForm({ mode: "new" })}>Add a reply</Button>}
                />
              )
            ) : (
              <>
                <AdminTable label={`Replies for !${command.trigger}`}>
                  <Table variant="striped" dense>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reply</TableHead>
                        <TableHead>In use</TableHead>
                        <TableHead align="right">Weight</TableHead>
                        <TableHead align="right">Chance</TableHead>
                        <TableHead align="right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((r, i) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <span className={`admin-cmds-replies__text${r.enabled ? "" : " admin-cmds-replies__text--off"}`}>{r.response}</span>
                          </TableCell>
                          <TableCell>
                            <Switch
                              aria-label={`Use reply ${i + 1}`}
                              checked={r.enabled}
                              disabled={busy === r.id}
                              onChange={(e) => void toggle(r, e.target.checked)}
                            />
                          </TableCell>
                          <TableCell align="right" className="admin-num">{r.weight.toLocaleString()}</TableCell>
                          <TableCell align="right" className="admin-num">{chance(r)}</TableCell>
                          <TableCell align="right">
                            <span className="admin-row-actions">
                              <Button variant="ghost" size="small" aria-label={`Edit reply ${i + 1}`} onClick={() => setForm({ mode: "edit", row: r })}>
                                Edit
                              </Button>
                              <AdminRowMenu label={`More for reply ${i + 1}`} items={[{ label: "Remove", danger: true, onClick: () => void removeReply(r) }]} />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
                <div className="admin-cmds-more">
                  <p className="admin-updated">
                    Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()}
                  </p>
                  {rows.length > limit && (
                    <Button variant="secondary" size="small" onClick={() => setLimit((n) => n + PAGE)}>
                      Show more
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

type ReplyErrors = Partial<Record<"response" | "weight" | "order", string>>;

function ReplyFormPanel({ initial, nextOrder, onCancel, onSubmit }: {
  initial: PoolResponse | null;
  nextOrder: number;
  onCancel: () => void;
  onSubmit: (response: string, weight: number, sortOrder: number, enabled: boolean) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [response, setResponse] = useState(initial?.response ?? "");
  const [weight, setWeight] = useState(String(initial?.weight ?? 100));
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? nextOrder));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ReplyErrors>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const submit = async () => {
    const text = response.trim();
    const w = Number(weight);
    const so = Number(sortOrder);
    const next: ReplyErrors = {};
    if (!text) next.response = "Write the reply first.";
    if (weight.trim() === "" || !Number.isInteger(w) || w <= 0) next.weight = "Use a whole number above 0.";
    if (sortOrder.trim() === "" || !Number.isInteger(so)) next.order = "Use a whole number.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await onSubmit(text, w, so, enabled);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={ref}>
      <AdminPanel title={isEdit ? "Edit this reply" : "Add a reply"} className="admin-cmds-reply-form">
        <ReplyField
          label="Reply"
          value={response}
          onChange={setResponse}
          rows={2}
          placeholder="Reply hazy, try again."
          error={errors.response}
          helper="This fills {result} in the command's reply. Details like {user} work here too."
        />
        <div className="admin-form-grid">
          <AdminField label="Weight" error={errors.weight} helper="100 is normal. 200 comes up twice as often, 50 half as often.">
            {(id, d) => (
              <Input id={id} aria-describedby={d} aria-invalid={!!errors.weight} variant={errors.weight ? "error" : "default"} type="number" min={1} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} fullWidth />
            )}
          </AdminField>
          <AdminField label="Place in this list" error={errors.order} helper="Lower numbers show first here. It doesn't change how often it comes up.">
            {(id, d) => (
              <Input id={id} aria-describedby={d} aria-invalid={!!errors.order} variant={errors.order ? "error" : "default"} type="number" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} fullWidth />
            )}
          </AdminField>
        </div>
        <Switch
          label="In use"
          helperText="Off keeps the reply here, but chat never gets it."
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <div className="admin-cmds-modal-actions">
          <Button size="small" variant="tertiary" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button size="small" variant="primary" onClick={() => void submit()} loading={submitting} disabled={submitting}>
            {isEdit ? "Save reply" : "Add reply"}
          </Button>
        </div>
      </AdminPanel>
    </div>
  );
}
