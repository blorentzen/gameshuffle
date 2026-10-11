"use client";

/**
 * Platform ▸ Chat bot ▸ Engagement (staff/admin): how many engagement points
 * each kind of chat activity is worth (`gs_engagement_weights`). Viewers see
 * their own total with !engagement and streamers rank viewers on Streaming ▸
 * Viewers ▸ Engagement. All five activities always show: a saved row, else
 * the built-in value the code falls back to (DEFAULT_WEIGHTS in
 * src/lib/engagement/weights.ts, shared with the server).
 * The PUT upserts, so changing a built-in value saves its first row.
 * A save busts the weight cache on the server that handled it; other servers
 * pick it up within the cache's 5 minutes. Stored points never change.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";

import { DEFAULT_WEIGHTS as BUILT_IN, SIGNAL_TYPES as SIGNALS, type SignalType } from "@/lib/engagement/weights";

const SIGNAL: Record<SignalType, { label: string; help: string; counted: boolean }> = {
  command_fired: {
    label: "Uses a chat command",
    help: "A ready-made reply like !hype, !discord or !roll. Quick and frequent, so it's worth the least.",
    counted: true,
  },
  event_fired: {
    label: "Sets off an event",
    help: "A !chaos or !random event, or one aimed at someone, that changes tokens or adds a modifier or challenge.",
    counted: true,
  },
  social_action: {
    label: "Sets off a friendly event",
    help: "An event that's just a friendly chat line, like a hug, with no tokens involved.",
    counted: true,
  },
  token_earned: {
    label: "Wins tokens",
    help: "Planned: points for each token a viewer wins.",
    counted: false,
  },
  token_spent: {
    label: "Spends tokens",
    help: "Planned: points for each token a viewer spends.",
    counted: false,
  },
};

interface WeightRow {
  signal_type: SignalType;
  weight: number;
  note: string | null;
  updated_at: string;
}

interface ViewRow {
  type: SignalType;
  weight: number;
  note: string;
  saved: WeightRow | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export function PlatformEngagementTab() {
  const [rows, setRows] = useState<WeightRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ViewRow | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/engagement-weights", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("Only GameShuffle staff can see the engagement points.");
        setRows([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't load the engagement points. Try again in a moment.");
        setRows([]);
        return;
      }
      setRows((body.weights as WeightRow[]) ?? []);
    } catch {
      setLoadError("Couldn't reach GameShuffle to load the points. Check your connection and try again.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const view: ViewRow[] = SIGNALS.map((type) => {
    const saved = rows?.find((r) => r.signal_type === type) ?? null;
    return { type, weight: saved?.weight ?? BUILT_IN[type], note: saved?.note ?? "", saved };
  });
  const noneSaved = rows !== null && rows.length === 0 && !loadError;

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Engagement"
        intro="Viewers earn engagement points for being active in a streamer's chat. Viewers check their own with !engagement, and streamers see their most active viewers on their Engagement tab."
      />

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <AdminSection
        title="Points per activity"
        intro={<>New activity counts at a changed value within about 5 minutes. Points viewers already earned stay as they are.{noneSaved ? " Nothing has been changed here yet, so every activity uses its built-in value." : ""}</>}
      >
        {rows === null ? (
          <LoadingLines label="Loading the engagement points" />
        ) : loadError ? (
          <div><Button variant="secondary" size="small" onClick={() => { setRows(null); void load(); }}>Try again</Button></div>
        ) : (
          <AdminTable label="Engagement points per activity">
            <Table variant="striped" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead align="right">Points</TableHead>
                  <TableHead>Staff note</TableHead>
                  <TableHead>Last changed</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.map((row) => {
                  const s = SIGNAL[row.type];
                  return (
                    <TableRow key={row.type}>
                      <TableCell>
                        <span className="admin-chatbot-activity">
                          <button type="button" className="admin-chatbot-open" onClick={() => setEditing(row)}>{s.label}</button>
                          {!s.counted && <Badge size="small" variant="default">Not counted yet</Badge>}
                        </span>
                        <span className="admin-table__sub admin-chatbot-wrap">{s.help}</span>
                      </TableCell>
                      <TableCell align="right" className="admin-num"><strong>{row.weight.toLocaleString()}</strong></TableCell>
                      <TableCell>{row.note ? <span className="admin-chatbot-wrap">{row.note}</span> : <span className="admin-table__sub">None</span>}</TableCell>
                      <TableCell>{row.saved ? when(row.saved.updated_at) : <span className="admin-table__sub">Never (built-in value)</span>}</TableCell>
                      <TableCell align="right">
                        <Button variant="ghost" size="small" onClick={() => setEditing(row)} aria-label={`Change points: ${s.label}`}>Change</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>

      {editing && (
        <PointsModal
          row={editing}
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

function PointsModal({ row, onClose, onSaved }: { row: ViewRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s = SIGNAL[row.type];
  const [weight, setWeight] = useState(String(row.weight));
  const [note, setNote] = useState(row.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = weight !== String(row.weight) || note !== row.note || !row.saved;

  const save = async () => {
    setError(null);
    const n = Number(weight);
    if (!/^\d+$/.test(weight.trim()) || !Number.isInteger(n) || n < 1) {
      setError("Use a whole number, 1 or more.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/engagement-weights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal_type: row.type, weight: n, note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError("That didn't save. Try again in a moment.");
        return;
      }
      toast.success("Points saved");
      onSaved();
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      title={`Change points: ${s.label}`}
      size="small"
      footer={
        <div className="admin-chatbot-modal-actions">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving || !changed}>Save points</Button>
        </div>
      }
    >
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); if (changed) void save(); }}>
        <p className="admin-chatbot-modal-note">{s.help}</p>
        {!s.counted && (
          <Alert variant="info" title="Not counted yet">
            Nothing records this activity yet, so a change here has no effect until it does.
          </Alert>
        )}
        <AdminField
          label="Points"
          error={error}
          helper={`A whole number, 1 or more. Built-in value: ${BUILT_IN[row.type]}.`}
        >
          {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="numeric" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} fullWidth />}
        </AdminField>
        <AdminField label="Staff note (optional)" helper="Only staff see this. Say why it's set this way.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} rows={3} fullWidth />}
        </AdminField>
      </form>
    </Modal>
  );
}
