"use client";

/**
 * Platform ▸ Chat bot ▸ Chaos events ▸ Add / Edit event (staff). One gs_events
 * row (its chat line, deck, who it involves, weight, game, own command) plus
 * its effects (gs_event_consequences: token changes, modifiers, challenges,
 * story lines). The event saves with the footer button through
 * PUT /api/admin/events; effects save one at a time as they're added or
 * changed (/api/admin/events/[id]/consequences), so they only show once the
 * event exists. Opened from PlatformEventsTab.
 */

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { AdminField, AdminTable } from "@/components/account/admin/AdminKit";
import { GAME_NAMES, getGameName } from "@/data/game-registry";
import { VariableAutocomplete } from "../VariableAutocomplete";
import { AUTHORITY_LABEL, CHAT_AUTHORITIES } from "@/lib/twitch/commands/authority";
import {
  CTYPE_LABEL,
  FANOUT_MODES,
  TARGET_LABEL,
  type ConsequenceRow,
  type ConsequenceTarget,
  type Ctype,
  type EventAuthority,
  type EventRow,
  type FlavorVariable,
  type PartnerMode,
  type Surface,
} from "./types";

interface EditorProps {
  row: EventRow | null;
  isOpen: boolean;
  onClose: () => void;
  /** Fired when the event itself is saved; the parent closes and reloads.
   *  Effects save on their own inside the modal, and the parent reloads
   *  whenever the modal closes. */
  onSaved: () => void;
}

const OFFLINE = "Couldn't reach GameShuffle. Check your connection and try again.";
const pick = (v: string | string[]) => (Array.isArray(v) ? v[0] : v);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------------------
// Game choices. Saved as the game's slug, or "" (stored as null) for every
// game. CDS Select treats "" as no choice, so "all" stands in for it here.
// ---------------------------------------------------------------------------

const ALL_GAMES = "all";

type SelectGroups = NonNullable<ComponentProps<typeof Select>["groups"]>;

/** Every game, then each game GameShuffle knows: !chaos and !random draw an event set to a game only while that game is on stream. */
function gameGroups(current: string): SelectGroups {
  const games = Object.keys(GAME_NAMES);
  // A slug saved earlier that isn't on our list stays choosable, so opening
  // and saving the event never changes its game.
  if (current && current !== ALL_GAMES && !games.includes(current)) games.push(current);
  return [
    { label: "Any game", options: [{ value: ALL_GAMES, label: "Every game" }] },
    { label: "Only while this game is on stream", options: games.map((slug) => ({ value: slug, label: getGameName(slug) })) },
  ];
}

// ---------------------------------------------------------------------------
// Plain words for what the server sends back
// ---------------------------------------------------------------------------

function eventSaveError(code: unknown, status: number): string {
  const text = typeof code === "string" ? code : "";
  if (status === 401 || text === "unauthenticated") return "You've been signed out. Sign in again, then save.";
  if (status === 403 || text === "forbidden") return "Only GameShuffle staff can change chat events.";
  if (text === "event_key_required") return "Give the event a short name.";
  if (text === "flavor_tmpl_required") return "Write the chat line.";
  if (text === "invalid_surface") return "Pick which command draws the event.";
  if (text.startsWith("partner_count")) return "Enter how many viewers it reaches, 1 or more.";
  if (/duplicate key|unique/i.test(text)) return "Another event already uses that short name. Pick a different one.";
  return "That didn't save. Check the fields and try again.";
}

function effectSaveError(code: unknown, status: number): string {
  const text = typeof code === "string" ? code : "";
  if (status === 401 || text === "unauthenticated") return "You've been signed out. Sign in again, then save the effect.";
  if (status === 403 || text === "forbidden") return "Only GameShuffle staff can change chat events.";
  if (text === "consequence_not_found") return "That effect is gone, maybe deleted in another window. Close this window and open the event again.";
  return "That effect didn't save. Check its fields and try again.";
}

// ---------------------------------------------------------------------------
// Who an effect lands on, in words that fit the event's kind
// ---------------------------------------------------------------------------

function targetLabel(t: ConsequenceTarget, mode: PartnerMode): string {
  if (!FANOUT_MODES.has(mode)) return TARGET_LABEL[t];
  if (t === "partner") return mode === "random_n" ? "The viewers it picks" : "Everyone it reaches";
  if (t === "both") return mode === "random_n" ? "The viewer who set it off and the viewers it picks" : "The viewer who set it off and everyone it reaches";
  return TARGET_LABEL[t];
}

// ---------------------------------------------------------------------------
// Challenge conditions. The resolver (markets/resolveFanout.ts) reads:
//   yes or no, pick one: { value: "win" }  (or { key: "win" })
//   finishing place:     { max_position: 3 }  (or a full placement spec)
//   a number:            { over: 10 } or { under: 10 }
// The simple shapes get fields; anything else stays as JSON.
// ---------------------------------------------------------------------------

type ChallengeKind = "binary" | "placement" | "pickone" | "count";
type CountDir = "over" | "under";
interface ConditionFields { answer: string; place: string; countDir: CountDir; countNum: string }

const CHALLENGE_KINDS: Array<{ value: ChallengeKind; label: string; description: string }> = [
  { value: "binary", label: "Yes or no", description: "Settled with an answer like win or lose" },
  { value: "placement", label: "Finishing place", description: "Settled with a place, like 1 for first" },
  { value: "pickone", label: "One of several choices", description: "Settled with the choice that happened" },
  { value: "count", label: "A number", description: "Settled with a count, like how many coins" },
];
const KIND_LABEL = Object.fromEntries(CHALLENGE_KINDS.map((k) => [k.value, k.label])) as Record<string, string>;

const EMPTY_FIELDS: ConditionFields = { answer: "", place: "", countDir: "over", countNum: "" };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Fields for a condition the fields can show exactly, else null (JSON). */
function fieldsFromCondition(kind: string, cond: unknown): ConditionFields | null {
  if (!isPlainObject(cond)) return null;
  const keys = Object.keys(cond);
  if (keys.length === 0) return { ...EMPTY_FIELDS };
  if (keys.length !== 1) return null;
  const [k] = keys;
  const v = cond[k];
  if ((kind === "binary" || kind === "pickone") && k === "value" && typeof v === "string") return { ...EMPTY_FIELDS, answer: v };
  if (kind === "placement" && k === "max_position" && typeof v === "number") return { ...EMPTY_FIELDS, place: String(v) };
  if (kind === "count" && (k === "over" || k === "under") && typeof v === "number") return { ...EMPTY_FIELDS, countDir: k, countNum: String(v) };
  return null;
}

type ConditionResult = { ok: true; condition: Record<string, unknown> } | { ok: false; field: "answer" | "place" | "countNum"; error: string };

function conditionFromFields(kind: string, f: ConditionFields): ConditionResult {
  if (kind === "placement") {
    const n = Number(f.place);
    if (f.place.trim() === "" || !Number.isInteger(n) || n < 1) return { ok: false, field: "place", error: "Enter a place of 1 or more, like 3 for a top three finish." };
    return { ok: true, condition: { max_position: n } };
  }
  if (kind === "count") {
    const n = Number(f.countNum);
    if (f.countNum.trim() === "" || !Number.isFinite(n)) return { ok: false, field: "countNum", error: "Enter the number to beat, like 10." };
    return { ok: true, condition: { [f.countDir]: n } };
  }
  const answer = f.answer.trim();
  if (!answer) return { ok: false, field: "answer", error: "Enter the answer that wins, like win." };
  return { ok: true, condition: { value: answer } };
}

const ordinal = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

function conditionWords(cond: unknown): string {
  if (!isPlainObject(cond)) return "no condition";
  const text = typeof cond.value === "string" ? cond.value : typeof cond.key === "string" ? cond.key : null;
  if (text !== null) return `"${text}" wins`;
  if (typeof cond.max_position === "number") return `${ordinal(cond.max_position)} place or better`;
  if (typeof cond.over === "number") return `more than ${cond.over}`;
  if (typeof cond.under === "number") return `fewer than ${cond.under}`;
  return Object.keys(cond).length === 0 ? "no condition set" : "a custom condition";
}

// ---------------------------------------------------------------------------
// One line per effect for the list
// ---------------------------------------------------------------------------

function effectSummary(c: ConsequenceRow, mode: PartnerMode): string {
  const p = c.payload;
  switch (c.ctype) {
    case "token_delta": {
      const min = typeof p.min === "number" ? p.min : 0;
      const max = typeof p.max === "number" ? p.max : 0;
      const range = min === max ? `${signed(min)} tokens` : `${signed(min)} to ${signed(max)} tokens`;
      return mode === "none" ? range : `${range}, to ${targetLabel(c.target, mode).toLowerCase()}`;
    }
    case "modifier": {
      const effect = typeof p.effect === "string" && p.effect ? p.effect : "(no name)";
      const duration = typeof p.duration === "number" ? p.duration : 60;
      const scope = p.scope === "round" || p.scope === "chapter" ? p.scope : "seconds";
      const unit = scope === "seconds" ? (duration === 1 ? "second" : "seconds") : `${scope}${duration === 1 ? "" : "s"} (counts as seconds for now)`;
      return `"${effect}" on screen for ${duration} ${unit}`;
    }
    case "challenge": {
      const kind = typeof p.variable_type === "string" ? KIND_LABEL[p.variable_type] ?? p.variable_type : "No kind set";
      const parts = [`${kind}: ${conditionWords(p.condition)}`, p.visibility === "secret" ? "Secret" : "Public"];
      if (typeof p.reward === "number" && p.reward > 0) parts.push(`+${p.reward} if pulled off`);
      if (typeof p.penalty === "number" && p.penalty > 0) parts.push(`-${p.penalty} if missed`);
      return parts.join(" · ");
    }
    case "story":
      return "Just the chat line";
  }
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

type EventField = "key" | "line" | "weight" | "count";

/** Focus the first control inside a field wrapper (inputs, textareas, selects). */
function focusField(root: HTMLElement | null, name: string) {
  requestAnimationFrame(() => {
    root?.querySelector<HTMLElement>(`[data-chaos-field="${name}"] :is(input, textarea, button)`)?.focus();
  });
}

export function EventEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {
  const [eventKey, setEventKey] = useState(row?.event_key ?? "");
  const [surface, setSurface] = useState<Surface>(row?.surface ?? "chaos");
  const [flavorTmpl, setFlavorTmpl] = useState(row?.flavor_tmpl ?? "");
  const [weight, setWeight] = useState(String(row?.weight ?? 100));
  const [gameScope, setGameScope] = useState(row?.game_scope ?? "");
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [partnerMode, setPartnerMode] = useState<PartnerMode>(row?.partner_mode ?? "none");
  const [partnerCount, setPartnerCount] = useState(
    row?.partner_count !== null && row?.partner_count !== undefined ? String(row.partner_count) : "10",
  );
  const [triggerDirectly, setTriggerDirectly] = useState(row?.trigger_directly ?? false);
  const [minAuthority, setMinAuthority] = useState<EventAuthority>(row?.min_authority ?? "viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<EventField, string>>>({});
  // A div, not a form: the variables accordion's button has no type, so a
  // form would treat opening it as Save.
  const formRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => alertRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const fanout = FANOUT_MODES.has(partnerMode);

  const save = async () => {
    setError(null);
    const trimmedKey = eventKey.trim();
    const trimmedTmpl = flavorTmpl.trim();
    const next: Partial<Record<EventField, string>> = {};
    if (!trimmedKey) next.key = "Give the event a short name, like banana_storm.";
    if (!trimmedTmpl) next.line = "Write what the bot posts in chat when the event comes up.";
    const w = parseInt(weight, 10);
    if (!Number.isFinite(w) || w <= 0) next.weight = "Enter a whole number of 1 or more. 100 is normal.";
    if (fanout) {
      const pc = parseInt(partnerCount, 10);
      if (!Number.isInteger(pc) || pc < 1) next.count = "Enter a whole number of 1 or more.";
    }
    setErrors(next);
    const first = (["key", "line", "weight", "count"] as EventField[]).find((f) => next[f]);
    if (first) {
      focusField(formRef.current, first);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          event_key: trimmedKey,
          surface,
          flavor_tmpl: trimmedTmpl,
          weight: w,
          game_scope: gameScope.trim() || null,
          enabled,
          partner_mode: partnerMode,
          partner_count: fanout ? parseInt(partnerCount, 10) : null,
          trigger_directly: triggerDirectly,
          min_authority: minAuthority,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        showError(eventSaveError(body.error, res.status));
        return;
      }
      toast.success(row ? `${trimmedKey} saved` : `${trimmedKey} added`);
      onSaved();
    } catch {
      showError(OFFLINE);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={row ? `Edit ${row.event_key}` : "Add a chat event"}
      size="large"
      className="admin-chaos-modal"
      footer={
        <div className="admin-chaos-actions">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving}>
            {row ? "Save event" : "Add event"}
          </Button>
        </div>
      }
    >
      <div className="admin-chaos">
        <div ref={alertRef} className="admin-chaos-alert">
          {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
        </div>

        <div ref={formRef} className="admin-chaos-form">
          <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-event">
            <h3 id="admin-chaos-h-event" className="admin-chaos-section__title">The event</h3>
            <div data-chaos-field="key">
              <AdminField
                label="Short name"
                error={errors.key}
                helper="Lowercase letters and underscores, like banana_storm. When viewers can type the event themselves, this is the command (hug makes !hug work). Don't rename it once the event has been used."
              >
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    aria-invalid={!!errors.key}
                    variant={errors.key ? "error" : "default"}
                    value={eventKey}
                    onChange={(e) => setEventKey(e.target.value)}
                    placeholder="banana_storm"
                    autoComplete="off"
                    spellCheck={false}
                    fullWidth
                  />
                )}
              </AdminField>
            </div>

            <div className="admin-field admin-chaos-line" data-chaos-field="line">
              <span className="admin-field__label" aria-hidden>Chat line</span>
              <VariableAutocomplete
                value={flavorTmpl}
                onChange={setFlavorTmpl}
                rows={3}
                placeholder="🍌 {user} {verb} {delta} tokens to a banana storm on {game}!"
                ariaLabel="Chat line"
              />
              {errors.line && <p className="admin-field__error" role="alert">{errors.line}</p>}
              <p className="admin-field__help">
                What the bot posts in chat when the event comes up. Type {"{"} to add a detail, like {"{user}"} for the
                viewer who set it off or {"{delta}"} for the tokens they gained or lost. A misspelt one shows in chat as
                typed.
              </p>
              <FlavorVariablesDictionary />
            </div>
          </section>

          <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-where">
            <h3 id="admin-chaos-h-where" className="admin-chaos-section__title">Where it comes up</h3>
            <RadioGroup
              name="surface"
              label="Which command draws it"
              orientation="vertical"
              value={surface}
              onChange={(v) => setSurface(v as Surface)}
            >
              <Radio value="chaos" label="!chaos" helperText="Viewers spend tokens to use !chaos." />
              <Radio value="random" label="!random" helperText="Free for viewers, with a wait between uses." />
              <Radio value="both" label="Both" helperText="Either command can draw it." />
            </RadioGroup>

            <div className="admin-form-grid">
              <div data-chaos-field="weight">
                <AdminField
                  label="Weight"
                  error={errors.weight}
                  helper="How often it comes up next to the other events in its deck. 100 is normal, 200 comes up twice as often, 50 half as often."
                >
                  {(id, d) => (
                    <Input
                      id={id}
                      aria-describedby={d}
                      aria-invalid={!!errors.weight}
                      variant={errors.weight ? "error" : "default"}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      fullWidth
                    />
                  )}
                </AdminField>
              </div>
              <AdminField
                label="Game"
                helper="Keeps the event to streams playing one game: !chaos and !random only draw it while that game is on stream. Typing an event's own command works whatever the game."
              >
                {(id) => (
                  <Select
                    id={id}
                    value={gameScope || ALL_GAMES}
                    onChange={(v) => {
                      const next = pick(v);
                      setGameScope(next === ALL_GAMES ? "" : next);
                    }}
                    groups={gameGroups(gameScope)}
                    fullWidth
                  />
                )}
              </AdminField>
            </div>
          </section>

          <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-who">
            <h3 id="admin-chaos-h-who" className="admin-chaos-section__title">Who it involves</h3>
            <RadioGroup
              name="partner_mode"
              label="Viewers"
              helperText="Active means they earned, spent or were given tokens on the channel in the last hour."
              orientation="vertical"
              value={partnerMode}
              onChange={(v) => setPartnerMode(v as PartnerMode)}
            >
              <Radio
                value="none"
                label="One viewer"
                helperText="Only the viewer who set it off. {user} is their name."
              />
              <Radio
                value="mention"
                label="Two viewers: the caller tags someone"
                helperText="The viewer types the short name as a command and tags someone, like !hug @name. {to} is the person they tagged. !chaos and !random never draw these."
              />
              <Radio
                value="random_active"
                label="Two viewers: a random partner"
                helperText="GameShuffle picks one other active viewer. {to} is their name."
              />
              <Radio
                value="random_n"
                label="A group: some random viewers"
                helperText="GameShuffle picks a set number of active viewers (set below). Each one gets the effects on their own, like a jackpot shared by five winners."
              />
              <Radio
                value="all_active"
                label="A group: everyone active"
                helperText="Reaches every active viewer, up to the limit below. Good for something like a happy hour."
              />
            </RadioGroup>

            {fanout && (
              <div className="admin-chaos-narrow" data-chaos-field="count">
                <AdminField
                  label={partnerMode === "random_n" ? "How many viewers it picks" : "Most viewers it reaches"}
                  error={errors.count}
                  helper={
                    partnerMode === "random_n"
                      ? "Each viewer it picks gets the effects meant for the other viewers separately."
                      : "Keeps big chats from handing out a flood of tokens at once. Without a limit, a busy chat could drain the token supply."
                  }
                >
                  {(id, d) => (
                    <Input
                      id={id}
                      aria-describedby={d}
                      aria-invalid={!!errors.count}
                      variant={errors.count ? "error" : "default"}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={partnerCount}
                      onChange={(e) => setPartnerCount(e.target.value)}
                      fullWidth
                    />
                  )}
                </AdminField>
              </div>
            )}

            {fanout && (
              <Alert variant="info" title="Taking tokens from a group">
                If any effect can take tokens from the other viewers, only viewers who typed !opt-in can be picked.
                Events that only give tokens can reach anyone active.
              </Alert>
            )}
          </section>

          <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-command">
            <h3 id="admin-chaos-h-command" className="admin-chaos-section__title">Its own chat command</h3>
            {partnerMode === "mention" ? (
              <p className="admin-chaos-note">
                Events where the caller tags someone always work as their own command, like !hug @name.
              </p>
            ) : (
              <>
                <Switch
                  label="Viewers can type it as a command"
                  helperText="Lets chat set it off by typing its short name, like !tornado. Off means it only comes up through !chaos or !random."
                  checked={triggerDirectly}
                  onChange={(e) => setTriggerDirectly(e.target.checked)}
                />
                {triggerDirectly && (
                  <div className="admin-chaos-narrow">
                    <AdminField
                      label="Who can type it"
                      helper="VIP+ means VIPs, mods and the streamer. Mod+ means mods and the streamer. !chaos and !random keep their own rules about who can use them."
                    >
                      {(id) => (
                        <Select
                          id={id}
                          value={minAuthority}
                          onChange={(v) => setMinAuthority(pick(v) as EventAuthority)}
                          options={CHAT_AUTHORITIES.map((a) => ({ value: a, label: AUTHORITY_LABEL[a] }))}
                          fullWidth
                        />
                      )}
                    </AdminField>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-on">
            <h3 id="admin-chaos-h-on" className="admin-chaos-section__title">On or off</h3>
            <Switch
              label="Turned on"
              helperText="Off takes the event out of the decks and turns off its own command, but keeps it and its history."
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </section>
        </div>

        <section className="admin-chaos-section" aria-labelledby="admin-chaos-h-effects">
          <h3 id="admin-chaos-h-effects" className="admin-chaos-section__title">
            What it does
          </h3>
          {row ? (
            <ConsequencesEditor eventId={row.id} initial={row.consequences} partnerMode={partnerMode} />
          ) : (
            <p className="admin-chaos-note">
              Add the event first. Then open it again from the list to say what it does, like giving or taking tokens.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Effects (inside the event modal). Each one saves as it's added or changed.
// ---------------------------------------------------------------------------

interface ConsequencesEditorProps {
  eventId: string;
  initial: ConsequenceRow[];
  /** The event's kind, as picked in the form above (saved or not). One-viewer
   *  events save every effect for the viewer who set it off. */
  partnerMode: PartnerMode;
}

function ConsequencesEditor({ eventId, initial, partnerMode }: ConsequencesEditorProps) {
  const [rows, setRows] = useState<ConsequenceRow[]>(initial);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const remove = async (c: ConsequenceRow) => {
    const ok = await confirm({
      title: `Delete this ${CTYPE_LABEL[c.ctype].toLowerCase()}?`,
      body: "It comes off the event straight away, on every stream. This can't be undone.",
      confirmLabel: "Delete effect",
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/consequences/${c.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(res.status === 403 ? "Only GameShuffle staff can change chat events." : "Couldn't delete that effect. Try again.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      toast.success("Effect deleted");
    } catch {
      setError(OFFLINE);
    }
  };

  const upsert = async (
    ctype: Ctype,
    payload: Record<string, unknown>,
    target: ConsequenceTarget,
    consequenceId: string | null,
  ): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/consequences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consequence_id: consequenceId ?? undefined,
          ctype,
          payload,
          target,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(effectSaveError(body.error, res.status));
        return false;
      }
      const savedId: string = body.id;
      if (consequenceId) {
        setRows((prev) => prev.map((r) => (r.id === savedId ? { ...r, payload, target } : r)));
      } else {
        setRows((prev) => [...prev, { id: savedId, event_id: eventId, ctype, payload, target }]);
      }
      toast.success(consequenceId ? "Effect saved" : "Effect added");
      setEditingId(null);
      return true;
    } catch {
      setError(OFFLINE);
      return false;
    }
  };

  return (
    <div className="admin-chaos-effects">
      <p className="admin-chaos-note">
        What happens when the event comes up. Effects save as soon as you add or change them, separately from
        Save event.
      </p>

      {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

      {rows.length === 0 && editingId !== "new" && (
        <p className="admin-chaos-empty">No effects yet. Without one, the event only posts its chat line.</p>
      )}

      {rows.length > 0 && (
        <ul className="admin-chaos-effect-list" aria-label="Effects">
          {rows.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <ConsequenceForm
                  initial={c}
                  partnerMode={partnerMode}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(ctype, payload, target) => upsert(ctype, payload, target, c.id)}
                />
              </li>
            ) : (
              <li key={c.id} className="admin-chaos-effect">
                <div className="admin-chaos-effect__text">
                  <span className="admin-chaos-effect__name">{CTYPE_LABEL[c.ctype]}</span>
                  <span className="admin-chaos-effect__sum">{effectSummary(c, partnerMode)}</span>
                </div>
                <div className="admin-chaos-effect__actions">
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => setEditingId(c.id)}
                    disabled={editingId !== null}
                    aria-label={`Edit ${CTYPE_LABEL[c.ctype].toLowerCase()}: ${effectSummary(c, partnerMode)}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => void remove(c)}
                    disabled={editingId !== null}
                    aria-label={`Delete ${CTYPE_LABEL[c.ctype].toLowerCase()}: ${effectSummary(c, partnerMode)}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {editingId === "new" ? (
        <ConsequenceForm
          initial={null}
          partnerMode={partnerMode}
          onCancel={() => setEditingId(null)}
          onSubmit={(ctype, payload, target) => upsert(ctype, payload, target, null)}
        />
      ) : (
        <div>
          <Button size="small" variant="secondary" onClick={() => setEditingId("new")} disabled={editingId !== null}>
            Add an effect
          </Button>
        </div>
      )}

      <p className="admin-chaos-note admin-chaos-note--small">
        An effect&apos;s type can&apos;t change after it&apos;s saved. Delete it and add a new one to switch.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit one effect (inline)
// ---------------------------------------------------------------------------

interface ConsequenceFormProps {
  /** Existing row when editing; null when adding. */
  initial: ConsequenceRow | null;
  /** From the event. One-viewer events hide the "who it lands on" choice. */
  partnerMode: PartnerMode;
  onCancel: () => void;
  /** Resolves whether the save worked; the form stays open when it didn't. */
  onSubmit: (ctype: Ctype, payload: Record<string, unknown>, target: ConsequenceTarget) => Promise<boolean>;
}

type EffectField = "min" | "max" | "effect" | "duration" | "answer" | "place" | "countNum" | "json" | "reward" | "penalty";

const EFFECT_TYPES: Array<{ value: Ctype; label: string; description: string }> = [
  { value: "token_delta", label: CTYPE_LABEL.token_delta, description: "Gives or takes tokens" },
  { value: "modifier", label: CTYPE_LABEL.modifier, description: "A named twist shown on screen for a while" },
  { value: "challenge", label: CTYPE_LABEL.challenge, description: "Something to pull off, settled like a prediction" },
  { value: "story", label: CTYPE_LABEL.story, description: "Nothing extra: the chat line is the whole event" },
];

function ConsequenceForm({ initial, partnerMode, onCancel, onSubmit }: ConsequenceFormProps) {
  const isEdit = !!initial;
  const [ctype, setCtype] = useState<Ctype>(initial?.ctype ?? "token_delta");
  const [target, setTarget] = useState<ConsequenceTarget>(initial?.target ?? "actor");
  const p = initial?.payload ?? {};

  // Token change
  const [tdMin, setTdMin] = useState(String(typeof p.min === "number" ? p.min : -5));
  const [tdMax, setTdMax] = useState(String(typeof p.max === "number" ? p.max : 5));

  // Modifier
  const [modEffect, setModEffect] = useState(typeof p.effect === "string" ? p.effect : "");
  const [modDuration, setModDuration] = useState(String(typeof p.duration === "number" ? p.duration : 60));
  const [modScope, setModScope] = useState<"seconds" | "round" | "chapter">(
    p.scope === "round" || p.scope === "chapter" ? p.scope : "seconds",
  );

  // Challenge
  const [chVarType, setChVarType] = useState<string>(typeof p.variable_type === "string" ? p.variable_type : "binary");
  const [chReward, setChReward] = useState(String(typeof p.reward === "number" ? p.reward : 10));
  const [chPenalty, setChPenalty] = useState(String(typeof p.penalty === "number" ? p.penalty : 0));
  const [chVisibility, setChVisibility] = useState<"public" | "secret">(p.visibility === "secret" ? "secret" : "public");
  // Fields when the saved condition fits them exactly, else start in JSON so
  // nothing about it changes on save.
  const [startFields] = useState(() => fieldsFromCondition(chVarType, p.condition ?? {}));
  const [condFields, setCondFields] = useState<ConditionFields>(startFields ?? EMPTY_FIELDS);
  const [condAsJson, setCondAsJson] = useState(isEdit && ctype === "challenge" && startFields === null);
  const [chCondition, setChCondition] = useState(
    isPlainObject(p.condition) ? JSON.stringify(p.condition, null, 2) : "{}",
  );

  const [submitting, setSubmitting] = useState(false);
  const [errs, setErrs] = useState<Partial<Record<EffectField, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const setField = (patch: Partial<ConditionFields>) => setCondFields((f) => ({ ...f, ...patch }));

  const toggleJson = (on: boolean) => {
    setErrs((e) => ({ ...e, answer: undefined, place: undefined, countNum: undefined, json: undefined }));
    if (on) {
      // Start the JSON from what the fields say, when they say something.
      const built = conditionFromFields(chVarType, condFields);
      if (built.ok) setChCondition(JSON.stringify(built.condition, null, 2));
    } else {
      try {
        const parsed = fieldsFromCondition(chVarType, JSON.parse(chCondition));
        if (parsed) setCondFields(parsed);
      } catch {
        // Keep the fields as they were; the JSON stays for switching back.
      }
    }
    setCondAsJson(on);
  };

  const fail = (next: Partial<Record<EffectField, string>>, order: EffectField[]) => {
    setErrs(next);
    const first = order.find((f) => next[f]);
    if (first) focusField(formRef.current, first);
  };

  const handleSubmit = async () => {
    let payload: Record<string, unknown> = {};
    switch (ctype) {
      case "token_delta": {
        const min = Number(tdMin);
        const max = Number(tdMax);
        const next: Partial<Record<EffectField, string>> = {};
        if (tdMin.trim() === "" || !Number.isFinite(min)) next.min = "Enter a number, like -5.";
        if (tdMax.trim() === "" || !Number.isFinite(max)) next.max = "Enter a number, like 5.";
        if (next.min || next.max) return fail(next, ["min", "max"]);
        payload = { min, max };
        break;
      }
      case "modifier": {
        const effect = modEffect.trim();
        const duration = parseInt(modDuration, 10);
        const next: Partial<Record<EffectField, string>> = {};
        if (!effect) next.effect = "Give the modifier a name to show on screen.";
        if (!Number.isInteger(duration) || duration <= 0) next.duration = "Enter a whole number of 1 or more.";
        if (next.effect || next.duration) return fail(next, ["effect", "duration"]);
        payload = { effect, duration, scope: modScope };
        break;
      }
      case "challenge": {
        const next: Partial<Record<EffectField, string>> = {};
        let condition: Record<string, unknown> | null = null;
        if (condAsJson) {
          try {
            const parsed: unknown = JSON.parse(chCondition);
            if (isPlainObject(parsed)) condition = parsed;
            else next.json = 'Write it as one object in curly braces, like {"value": "win"}.';
          } catch {
            next.json = "That isn't valid JSON. Check the curly braces and the quote marks.";
          }
        } else {
          const built = conditionFromFields(chVarType, condFields);
          if (built.ok) condition = built.condition;
          else next[built.field] = built.error;
        }
        const reward = Number(chReward);
        const penalty = Number(chPenalty);
        // The engine skips a challenge whose reward or penalty isn't a whole
        // number of 0 or more, so catch that here.
        if (!Number.isInteger(reward) || reward < 0) next.reward = "Enter a whole number of 0 or more.";
        if (!Number.isInteger(penalty) || penalty < 0) next.penalty = "Enter a whole number of 0 or more.";
        if (Object.keys(next).length > 0 || !condition) {
          return fail(next, ["answer", "place", "countNum", "json", "reward", "penalty"]);
        }
        payload = {
          variable_type: chVarType,
          condition,
          reward: Number.isFinite(reward) ? reward : 0,
          penalty: Number.isFinite(penalty) ? penalty : 0,
          visibility: chVisibility,
        };
        break;
      }
      case "story":
        payload = {};
        break;
    }
    setErrs({});
    setSubmitting(true);
    try {
      // One-viewer events always save the effect for the viewer who set it
      // off, even though the choice is hidden.
      const effectiveTarget: ConsequenceTarget = partnerMode === "none" ? "actor" : target;
      // A failed save shows its message above the list; the form stays open.
      await onSubmit(ctype, payload, effectiveTarget);
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = CTYPE_LABEL[ctype].toLowerCase();
  const titleId = `admin-chaos-effect-form-${initial?.id ?? "new"}`;
  // Only token changes land on particular viewers; modifiers, challenges and
  // story lines cover the whole stream, so the choice is shown for tokens only.
  const showTarget = partnerMode !== "none" && ctype === "token_delta";

  return (
    <form
      ref={formRef}
      className="admin-chaos-effect-form"
      aria-labelledby={titleId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <h4 id={titleId} className="admin-chaos-effect-form__title">
        {isEdit ? `Edit the ${typeLabel}` : "Add an effect"}
      </h4>

      {!isEdit && (
        <AdminField label="Type" helper={EFFECT_TYPES.find((t) => t.value === ctype)?.description}>
          {(id) => (
            <Select
              id={id}
              value={ctype}
              onChange={(v) => {
                setCtype(pick(v) as Ctype);
                setErrs({});
              }}
              options={EFFECT_TYPES}
              fullWidth
            />
          )}
        </AdminField>
      )}

      {showTarget && (
        <AdminField label="Who it goes to">
          {(id) => (
            <Select
              id={id}
              value={target}
              onChange={(v) => setTarget(pick(v) as ConsequenceTarget)}
              options={(["actor", "partner", "both"] as ConsequenceTarget[]).map((t) => ({ value: t, label: targetLabel(t, partnerMode) }))}
              fullWidth
            />
          )}
        </AdminField>
      )}

      {ctype === "token_delta" && (
        <>
          <div className="admin-chaos-pair">
            <div data-chaos-field="min">
              <AdminField label="Fewest tokens" error={errs.min}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.min} variant={errs.min ? "error" : "default"} type="number" value={tdMin} onChange={(e) => setTdMin(e.target.value)} fullWidth />
                )}
              </AdminField>
            </div>
            <div data-chaos-field="max">
              <AdminField label="Most tokens" error={errs.max}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.max} variant={errs.max ? "error" : "default"} type="number" value={tdMax} onChange={(e) => setTdMax(e.target.value)} fullWidth />
                )}
              </AdminField>
            </div>
          </div>
          <p className="admin-field__help">
            A number in this range is picked each time. Use a minus sign to take tokens, like -10 to 5. The same number
            in both always gives that amount. Nobody drops below 0 tokens.
          </p>
        </>
      )}

      {ctype === "modifier" && (
        <>
          <div data-chaos-field="effect">
            <AdminField
              label="Name shown on screen"
              error={errs.effect}
              helper="Shows on the live page and the stream overlay with a countdown, like banana storm. Players act it out; nothing in the game changes by itself."
            >
              {(id, d) => (
                <Input id={id} aria-describedby={d} aria-invalid={!!errs.effect} variant={errs.effect ? "error" : "default"} value={modEffect} onChange={(e) => setModEffect(e.target.value)} placeholder="banana_storm" autoComplete="off" fullWidth />
              )}
            </AdminField>
          </div>
          <div className="admin-chaos-pair">
            <div data-chaos-field="duration">
              <AdminField label="How long it lasts" error={errs.duration}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.duration} variant={errs.duration ? "error" : "default"} type="number" min={1} inputMode="numeric" value={modDuration} onChange={(e) => setModDuration(e.target.value)} fullWidth />
                )}
              </AdminField>
            </div>
            <AdminField label="Counted in">
              {(id) => (
                <Select
                  id={id}
                  value={modScope}
                  onChange={(v) => setModScope(pick(v) as "seconds" | "round" | "chapter")}
                  options={[
                    { value: "seconds", label: "Seconds" },
                    { value: "round", label: "Rounds" },
                    { value: "chapter", label: "Chapters" },
                  ]}
                  fullWidth
                />
              )}
            </AdminField>
          </div>
          {modScope !== "seconds" && (
            <div className="admin-chaos-soon">
              <Badge size="small" variant="warning">Not live yet</Badge>
              <span>Rounds and chapters aren&apos;t counted yet, so for now the modifier lasts that many seconds.</span>
            </div>
          )}
        </>
      )}

      {ctype === "challenge" && (
        <>
          <div className="admin-chaos-soon">
            <Badge size="small" variant="warning">Payouts not live yet</Badge>
            <span>
              A challenge shows on the live page and overlay (unless it&apos;s secret) and closes when the streamer
              settles a prediction about the same kind of result with !gs resolve. Viewers see the reward and penalty,
              but nobody is paid or charged automatically yet.
            </span>
          </div>

          <AdminField label="What it's about" helper={CHALLENGE_KINDS.find((k) => k.value === chVarType)?.description}>
            {(id) => (
              <Select
                id={id}
                value={chVarType}
                onChange={(v) => {
                  setChVarType(pick(v));
                  setErrs({});
                }}
                options={CHALLENGE_KINDS}
                fullWidth
              />
            )}
          </AdminField>

          {!condAsJson && (chVarType === "binary" || chVarType === "pickone") && (
            <div data-chaos-field="answer">
              <AdminField
                label="The answer that wins"
                error={errs.answer}
                helper="What the streamer types to settle the prediction, like win in !gs resolve win. Capital letters don't matter."
              >
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.answer} variant={errs.answer ? "error" : "default"} value={condFields.answer} onChange={(e) => setField({ answer: e.target.value })} placeholder="win" autoComplete="off" fullWidth />
                )}
              </AdminField>
            </div>
          )}

          {!condAsJson && chVarType === "placement" && (
            <div className="admin-chaos-narrow" data-chaos-field="place">
              <AdminField
                label="Wins at this place or better"
                error={errs.place}
                helper="1 means only first place counts. 3 means any top three finish."
              >
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.place} variant={errs.place ? "error" : "default"} type="number" min={1} inputMode="numeric" value={condFields.place} onChange={(e) => setField({ place: e.target.value })} placeholder="3" fullWidth />
                )}
              </AdminField>
            </div>
          )}

          {!condAsJson && chVarType === "count" && (
            <>
              <div className="admin-chaos-pair">
                <AdminField label="Wins when the number is">
                  {(id) => (
                    <Select
                      id={id}
                      value={condFields.countDir}
                      onChange={(v) => setField({ countDir: pick(v) as CountDir })}
                      options={[
                        { value: "over", label: "More than" },
                        { value: "under", label: "Fewer than" },
                      ]}
                      fullWidth
                    />
                  )}
                </AdminField>
                <div data-chaos-field="countNum">
                  <AdminField label="This number" error={errs.countNum}>
                    {(id, d) => (
                      <Input id={id} aria-describedby={d} aria-invalid={!!errs.countNum} variant={errs.countNum ? "error" : "default"} type="number" value={condFields.countNum} onChange={(e) => setField({ countNum: e.target.value })} placeholder="10" fullWidth />
                    )}
                  </AdminField>
                </div>
              </div>
              <p className="admin-field__help">Compared with the number the streamer settles the prediction with.</p>
            </>
          )}

          <Switch
            label="Write the condition as JSON instead"
            helperText="For a condition these fields can't describe."
            checked={condAsJson}
            onChange={(e) => toggleJson(e.target.checked)}
          />

          {condAsJson && (
            <div data-chaos-field="json">
              <AdminField
                label="Condition as JSON"
                error={errs.json}
                helper={'What the challenge checks. Example: {"max_position": 3} wins at third place or better.'}
              >
                {(id, d) => (
                  <Textarea
                    id={id}
                    aria-describedby={d}
                    aria-invalid={!!errs.json}
                    variant={errs.json ? "error" : "default"}
                    className="admin-chaos-json"
                    value={chCondition}
                    onChange={(e) => setChCondition(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    fullWidth
                  />
                )}
              </AdminField>
            </div>
          )}

          <div className="admin-chaos-pair">
            <div data-chaos-field="reward">
              <AdminField label="Tokens for pulling it off" error={errs.reward}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.reward} variant={errs.reward ? "error" : "default"} type="number" min={0} inputMode="numeric" value={chReward} onChange={(e) => setChReward(e.target.value)} fullWidth />
                )}
              </AdminField>
            </div>
            <div data-chaos-field="penalty">
              <AdminField label="Tokens lost for missing it" error={errs.penalty}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} aria-invalid={!!errs.penalty} variant={errs.penalty ? "error" : "default"} type="number" min={0} inputMode="numeric" value={chPenalty} onChange={(e) => setChPenalty(e.target.value)} fullWidth />
                )}
              </AdminField>
            </div>
          </div>

          <AdminField
            label="Who sees it"
            helper={chVisibility === "secret" ? "Stays hidden until it's settled." : "Shows on the live page and the stream overlay while it's open."}
          >
            {(id) => (
              <Select
                id={id}
                value={chVisibility}
                onChange={(v) => setChVisibility(pick(v) as "public" | "secret")}
                options={[
                  { value: "public", label: "Everyone" },
                  { value: "secret", label: "Nobody until it's settled" },
                ]}
                fullWidth
              />
            )}
          </AdminField>
        </>
      )}

      {ctype === "story" && (
        <p className="admin-chaos-note">Nothing else happens. The chat line is the whole event.</p>
      )}

      <div className="admin-chaos-effect-form__actions">
        <Button size="small" variant="tertiary" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button size="small" variant="primary" type="submit" loading={submitting} disabled={submitting}>
          {isEdit ? "Save effect" : "Add this effect"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The variables a chat line can use, under the chat line box
// ---------------------------------------------------------------------------

function FlavorVariablesDictionary() {
  const [vars, setVars] = useState<FlavorVariable[] | null>(null);
  const [asked, setAsked] = useState(false);
  const open = useCallback(() => setAsked(true), []);

  // Loads the first time the panel opens (most visits never open it). The
  // list lives here, not in the panel, so the accordion re-measures its
  // height when the rows arrive.
  useEffect(() => {
    if (!asked || vars !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/flavor-variables", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        setVars(res.ok && body.ok ? (body.variables as FlavorVariable[]) : []);
      } catch {
        if (!cancelled) setVars([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asked, vars]);

  return (
    <Accordion
      variant="bordered"
      className="admin-chaos-vars"
      items={[
        {
          id: "chaos-variables",
          title: `Variables you can use${vars ? ` (${vars.length})` : ""}`,
          description: "Type { in the chat line to pick one, or look through them here.",
          content: <VariablesTable vars={vars} onOpen={open} />,
        },
      ]}
    />
  );
}

function VariablesTable({ vars, onOpen }: { vars: FlavorVariable[] | null; onOpen: () => void }) {
  // The accordion mounts this on first open.
  useEffect(() => {
    onOpen();
  }, [onOpen]);

  if (vars === null) return <p className="admin-chaos-vars__note" role="status">Loading the variables…</p>;
  return (
    <div className="admin-chaos-vars__body">
      {vars.length === 0 ? (
        <p className="admin-chaos-vars__note">No variables yet. Add them on Chat bot ▸ Variables.</p>
      ) : (
        <AdminTable label="Variables you can use">
          <Table variant="striped" dense>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>What it fills in</TableHead>
                <TableHead>Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vars.map((v) => (
                <TableRow key={v.name}>
                  <TableCell><code className="admin-chaos-code">{`{${v.name}}`}</code></TableCell>
                  <TableCell><span className="admin-chaos-vars__desc">{v.description}</span></TableCell>
                  <TableCell><span className="admin-chaos-vars__eg">{v.example || "None"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      <p className="admin-chaos-vars__note">
        A variable that isn&apos;t on this list shows in chat exactly as typed, so typos are easy to spot. Staff add
        and edit them on Chat bot ▸ Variables.
      </p>
    </div>
  );
}
