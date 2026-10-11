"use client";

/**
 * Platform ▸ Chat bot ▸ Chaos events (staff/admin): the global event catalog
 * the !chaos and !random decks draw from at fire time, so changes reach live
 * streams on the next event. Deck balance up top (average tokens per use from
 * deckStats), then every event with an on/off switch, Edit (EventEditorModal,
 * which also edits each event's effects; those save as they go, so the list
 * reloads when the modal closes) and Delete in the row menu.
 * Data from /api/admin/events (GET list, PUT upsert) and /api/admin/events/[id].
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Select, StatCard, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconBolt, IconCards, IconDice5, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { getGameName } from "@/data/game-registry";
import { AdminHeader, AdminRowMenu, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { EventEditorModal } from "./platform-events/EventEditorModal";
import { computeDeckStats, evVerdict, type DeckStat } from "./platform-events/deckStats";
import type { ConsequenceRow, Ctype, EventRow, Surface } from "./platform-events/types";

const PAGE = 25;
const DECKS = ["chaos", "random"] as const;

/** Same filter values as before (exact deck match), in plain words. */
const FILTERS: Array<{ value: "all" | Surface; label: string }> = [
  { value: "all", label: "All events" },
  { value: "chaos", label: "Only in !chaos" },
  { value: "random", label: "Only in !random" },
  { value: "both", label: "In both decks" },
];
const DECK_LABEL: Record<Surface, string> = { chaos: "!chaos", random: "!random", both: "Both" };

const MIX_WORDS: Record<Ctype, [string, string]> = {
  token_delta: ["token change", "token changes"],
  modifier: ["modifier", "modifiers"],
  challenge: ["challenge", "challenges"],
  story: ["story line", "story lines"],
};

const VERDICT: Record<"ok" | "warn" | "bad", string> = {
  ok: "On target: takes tokens out or breaks even",
  warn: "Gives a few out. Aim for 0 or below",
  bad: "Gives too many out. Aim for 0 or below",
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const TARGET_WORD: Record<ConsequenceRow["target"], string> = { actor: "", partner: " to the other viewer", both: " to both viewers" };

/** One effect in a few plain words: "+30 to +80 tokens", "Just a chat line". */
function effectText(c: ConsequenceRow): string {
  switch (c.ctype) {
    case "token_delta": {
      const min = num(c.payload.min);
      const max = num(c.payload.max);
      return `${min === max ? signed(min) : `${signed(min)} to ${signed(max)}`} tokens${TARGET_WORD[c.target] ?? ""}`;
    }
    case "modifier":
      return "Adds a modifier";
    case "challenge":
      return "Sets a challenge";
    default:
      return "Just a chat line";
  }
}

function mixText(s: DeckStat): string {
  const parts = (Object.keys(MIX_WORDS) as Ctype[])
    .filter((t) => s.typeMix[t] > 0)
    .map((t) => `${s.typeMix[t]} ${MIX_WORDS[t][s.typeMix[t] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : "No effects yet";
}

export function PlatformEventsTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<"all" | Surface>("all");
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/events", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("Only GameShuffle staff can see the chat events.");
        setEvents([]);
        return;
      }
      if (!res.ok) {
        setLoadError("Couldn't load the chat events. Try again in a moment.");
        setEvents([]);
        return;
      }
      const body = (await res.json()) as { events: EventRow[] };
      setEvents(body.events);
    } catch {
      setLoadError("Couldn't reach GameShuffle to load the events. Check your connection and try again.");
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    // load is async (setState only after the fetch resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filtered = events?.filter((e) => surfaceFilter === "all" || e.surface === surfaceFilter) ?? [];
  const shown = filtered.slice(0, limit);

  const toggleEnabled = async (row: EventRow) => {
    const next = !row.enabled;
    const putBack = () => setEvents((cur) => cur?.map((e) => (e.id === row.id ? { ...e, enabled: row.enabled } : e)) ?? null);
    setEvents((cur) => cur?.map((e) => (e.id === row.id ? { ...e, enabled: next } : e)) ?? null);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          event_key: row.event_key,
          surface: row.surface,
          flavor_tmpl: row.flavor_tmpl,
          weight: row.weight,
          game_scope: row.game_scope,
          enabled: next,
        }),
      });
      if (!res.ok) {
        putBack();
        toast.error(`Couldn't turn ${row.event_key} ${next ? "on" : "off"}. Try again.`);
      } else {
        toast.success(next ? `${row.event_key} is back in the deck` : `${row.event_key} is out of the deck`);
      }
    } catch {
      putBack();
      toast.error("Couldn't reach GameShuffle. Check your connection and try again.");
    }
  };

  const handleDelete = async (row: EventRow) => {
    const ok = await confirm({
      title: `Delete the ${row.event_key} event?`,
      body: "Its effects go with it, and this can't be undone. To take it out of the decks for now, turn it off instead.",
      confirmLabel: "Delete event",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/events/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(`Couldn't delete ${row.event_key}. Try again.`);
        return;
      }
      setEvents((cur) => cur?.filter((e) => e.id !== row.id) ?? null);
      toast.success(`${row.event_key} deleted`);
    } catch {
      toast.error("Couldn't reach GameShuffle. Check your connection and try again.");
    }
  };

  const stats = events && events.length > 0 ? DECKS.map((deck) => ({ deck, s: computeDeckStats(events, deck) })) : [];
  const fanout = stats.filter(({ s }) => s.fanoutCount > 0);
  const overspending = stats.filter(({ s }) => evVerdict(s.meanTokenEV).cls === "bad");

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Chaos events"
        intro="The events chat can set off with !chaos and !random. !chaos costs viewers tokens and !random is free with a cooldown; each picks one event from its deck. Changes reach every stream the next time an event comes up."
        actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add event</Button>}
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {stats.length > 0 && (
        <AdminSection
          title="Deck balance"
          intro="What a viewer gains or loses on average each time a deck is used, counting only events that are on and how often each comes up. Aim for about 0 or a little below, so the decks take a few tokens out over time instead of adding them."
        >
          <AdminStats label="Deck balance">
            {stats.flatMap(({ deck, s }) => {
              const v = evVerdict(s.meanTokenEV);
              const name = deck === "chaos" ? "!chaos" : "!random";
              return [
                <StatCard
                  key={`${deck}-ev`}
                  label={`${name}: tokens per use, on average`}
                  value={`${s.meanTokenEV >= 0 ? "+" : ""}${s.meanTokenEV.toFixed(1)}`}
                  source={VERDICT[v.cls]}
                  icon={deck === "chaos" ? <IconBolt size={20} aria-hidden /> : <IconDice5 size={20} aria-hidden />}
                />,
                <StatCard
                  key={`${deck}-count`}
                  label={`${name}: events turned on`}
                  value={s.count.toLocaleString()}
                  source={`${s.count ? `Tokens from ${signed(s.minOutcome)} to ${signed(s.maxOutcome)} · ` : ""}${mixText(s)}`}
                  icon={<IconCards size={20} aria-hidden />}
                />,
              ];
            })}
          </AdminStats>
          {overspending.length > 0 && (
            <Alert variant="warning" title={`${overspending.map(({ deck }) => `!${deck}`).join(" and ")} ${overspending.length === 1 ? "gives" : "give"} out too many tokens`}>
              Lower the weight of the events that pay out most, or add events that cost tokens.
            </Alert>
          )}
          {fanout.length > 0 && (
            <Alert variant="info" title="Some events pay everyone they reach">
              {fanout.map(({ deck, s }) => `!${deck} has ${s.fanoutCount}`).join(", ")}. Each one hands tokens to several viewers at once, so the deck gives out more than the average above shows when chat is busy.
            </Alert>
          )}
        </AdminSection>
      )}

      <AdminSection
        title={events && events.length > 0 ? `Events (${events.length.toLocaleString()})` : "Events"}
        intro="Weight sets how often an event comes up: one with weight 100 comes up twice as often as one with 50 in the same deck. Turn an event off to take it out of the decks without deleting it."
      >
        {events === null ? (
          <LoadingLines label="Loading the chat events" />
        ) : events.length === 0 ? (
          !loadError && (
            <EmptyState
              variant="bordered"
              icon={<IconCards size={28} aria-hidden />}
              title="No chat events yet"
              description="Add one so !chaos and !random have something to draw."
              action={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add event</Button>}
            />
          )
        ) : (
          <>
            <div className="admin-chatbot-filter">
              <Select
                fullWidth
                floatingLabel="Show"
                options={FILTERS}
                value={surfaceFilter}
                onChange={(v) => { setSurfaceFilter((Array.isArray(v) ? v[0] : v) as "all" | Surface); setLimit(PAGE); }}
              />
            </div>
            <AdminTable label="Chat events">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Deck</TableHead>
                    <TableHead align="right">Weight</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>What it does</TableHead>
                    <TableHead>On</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <TableEmpty title="No events here" description="Set Show to All events to see the rest." />
                      </TableCell>
                    </TableRow>
                  ) : shown.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <button type="button" className="admin-chatbot-open" onClick={() => setEditing(row)}>{row.event_key}</button>
                        <span className="admin-table__sub admin-chatbot-line">{row.flavor_tmpl}</span>
                      </TableCell>
                      <TableCell>{DECK_LABEL[row.surface]}</TableCell>
                      <TableCell align="right" className="admin-num">{row.weight.toLocaleString()}</TableCell>
                      <TableCell><span className="admin-chatbot-game">{row.game_scope ? getGameName(row.game_scope) : "All games"}</span></TableCell>
                      <TableCell>
                        {row.consequences.length === 0 ? (
                          <Badge size="small" variant="warning">No effects</Badge>
                        ) : (
                          <span className="admin-chatbot-effects">
                            {row.consequences.map((c) => <span key={c.id}>{effectText(c)}</span>)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch aria-label={`${row.event_key} in the decks`} checked={row.enabled} onChange={() => void toggleEnabled(row)} />
                      </TableCell>
                      <TableCell align="right">
                        <span className="admin-row-actions">
                          <Button variant="ghost" size="small" onClick={() => setEditing(row)} aria-label={`Edit ${row.event_key}`}>Edit</Button>
                          <AdminRowMenu label={`More for ${row.event_key}`} items={[{ label: "Delete", onClick: () => void handleDelete(row) }]} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            {filtered.length > 0 && (
              <div className="admin-chatbot-more">
                <p className="admin-updated">Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()}</p>
                {filtered.length > limit && <Button variant="secondary" size="small" onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>}
              </div>
            )}
          </>
        )}
      </AdminSection>

      {editing && (
        <EventEditorModal
          row={editing === "new" ? null : editing}
          isOpen={!!editing}
          onClose={() => {
            // Effects save as they go inside the modal, so closing without
            // saving the event itself can still have changed them: reload so
            // "What it does" stays right.
            setEditing(null);
            void load();
          }}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
