"use client";

/**
 * Platform ▸ Token economy ▸ Levers (staff/admin): every number the token
 * economy reads from `gs_economy_config` (grants, earn defaults, daily limits,
 * chaos price band, streamer allowance, stream-end grace), grouped by what it
 * affects, each with what it does and when it last changed. Edit opens a small
 * modal; a save lands straight away (the engine reads the value on every
 * interaction, with a code default as the safety net when a row is missing).
 *
 * Keys without a description here (seeded by a later feature) still show, in
 * "Other settings", so staff can edit them.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Modal } from "@empac/cascadeds";
import { IconBroadcast, IconCoins, IconConfetti, IconHandStop, IconPencil, IconSparkles, IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminSection } from "@/components/account/admin/AdminKit";

interface ConfigRow {
  key: string;
  value: number;
  updated_at: string;
}

type LeverCategory = "onboarding" | "earns" | "chaos" | "streamer" | "lifecycle";

interface LeverMeta {
  key: string;
  label: string;
  helper: string;
  unit: "tokens" | "seconds" | "count";
  category: LeverCategory;
}

const LEVERS: LeverMeta[] = [
  // ── Welcome and recovery ──────────────────────────────────────
  { key: "grant_start", label: "Welcome grant", unit: "tokens", category: "onboarding",
    helper: "Tokens every new viewer starts with, whether they arrive from chat or make an account. More makes early games feel richer, but adds tokens with every sign-up." },
  { key: "new_community_bonus", label: "New-community bonus", unit: "tokens", category: "onboarding",
    helper: "Tokens a viewer gets the first time they join another streamer's community. Encourages trying other streams. Small on purpose." },
  { key: "grant_onboarding_default", label: "Getting-started reward", unit: "tokens", category: "onboarding",
    helper: "Tokens for each getting-started step an account completes, unless that step has its own amount. 0 turns them off." },
  { key: "bust_recovery_amount", label: "Bust recovery", unit: "tokens", category: "onboarding",
    helper: "Tokens given back when a viewer's wallet drops to the bust floor, so nobody stays stuck at zero. Works with the bust floor below." },
  { key: "bust_floor", label: "Bust floor", unit: "tokens", category: "onboarding",
    helper: "The wallet balance where bust recovery kicks in. Too high and recovery repeats forever; too low and viewers stay stuck." },
  // ── Earning ───────────────────────────────────────────────────
  { key: "earn_t1_default", label: "In-game earn", unit: "tokens", category: "earns",
    helper: "Base tokens for in-game results, like race finishes and tournament wins. A streamer's multiplier stacks on top. Worth more than chat earns." },
  { key: "earn_t2_default", label: "Chat earn", unit: "tokens", category: "earns",
    helper: "Base tokens for chatting during a stream. Kept smaller than in-game earns so chatting never pays more than playing." },
  { key: "t2_first_n_per_session", label: "Chat earns per stream", unit: "count", category: "earns",
    helper: "How many chat earns one viewer can collect in a stream. Stops spam farming without punishing real chatters." },
  { key: "daily_earn_ceiling", label: "Daily earn limit", unit: "tokens", category: "earns",
    helper: "The most a viewer can earn in a day across every kind of earn. Welcome grants don't count. This is the main brake on new tokens." },
  // ── Chaos prices ──────────────────────────────────────────────
  { key: "chaos_price_min", label: "Lowest chaos price", unit: "tokens", category: "chaos",
    helper: "The least a streamer can charge for a chaos event in chat. Works with the highest price below." },
  { key: "chaos_price_default", label: "Chaos price", unit: "tokens", category: "chaos",
    helper: "What a chaos event costs on every stream for now. Always kept between the lowest and highest price." },
  { key: "chaos_price_max", label: "Highest chaos price", unit: "tokens", category: "chaos",
    helper: "The most a streamer can charge for a chaos event, so chaos never gets too punishing." },
  // ── Streamer payouts ──────────────────────────────────────────
  { key: "streamer_monthly_allowance", label: "Monthly award allowance", unit: "tokens", category: "streamer",
    helper: "Tokens a GS Pro streamer can award each month, unless their plan sets another amount at the start of the month. Streamers never see this number." },
  { key: "party_mission_tokens_per_point", label: "Party mission payout", unit: "tokens", category: "streamer",
    helper: "Tokens per mission point when a streamer confirms a mission on a live Mario Party night (missions are worth 1 to 3 points). Paid from the streamer's monthly allowance." },
  { key: "night_mvp_tokens", label: "Live night MVP payout", unit: "tokens", category: "streamer",
    helper: "Tokens the MVP gets when the host ends a live night. Paid from the host's monthly allowance. 0 turns it off." },
  // ── Streams ───────────────────────────────────────────────────
  { key: "stream_end_grace_seconds", label: "Stream-end grace", unit: "seconds", category: "lifecycle",
    helper: "How long after Twitch says a stream went offline before we end it. A quick drop and reconnect inside this time keeps open predictions alive instead of refunding them." },
];

const CATEGORIES: { id: LeverCategory; title: string; intro: string; icon: typeof IconCoins }[] = [
  { id: "onboarding", title: "Welcome and recovery", intro: "What viewers start with, and what keeps an empty wallet from staying empty.", icon: IconUserPlus },
  { id: "earns", title: "Earning", intro: "How viewers earn tokens by playing and chatting, and the daily limit.", icon: IconSparkles },
  { id: "chaos", title: "Chaos prices", intro: "The range streamers can charge when chat spends tokens on a chaos event.", icon: IconConfetti },
  { id: "streamer", title: "Streamer payouts", intro: "Tokens streamers hand out, which come from their monthly allowance.", icon: IconCoins },
  { id: "lifecycle", title: "Streams", intro: "Timing around the end of a stream.", icon: IconBroadcast },
];

const fmt = (v: number) => v.toLocaleString("en-US");
const valueText = (v: number, unit: LeverMeta["unit"]) =>
  unit === "tokens" ? `${fmt(v)} ${v === 1 ? "token" : "tokens"}` : unit === "seconds" ? `${fmt(v)} ${v === 1 ? "second" : "seconds"}` : fmt(v);
const UNIT_FIELD: Record<LeverMeta["unit"], string> = { tokens: "tokens", seconds: "seconds", count: "a number" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const humanize = (key: string) => {
  const s = key.replace(/[._]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Editing { key: string; label: string; helper: string; unit: LeverMeta["unit"]; current: number | null; draft: string }

export function PlatformEconomyTab() {
  const [config, setConfig] = useState<ConfigRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/economy-config", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("This screen is for staff only. Sign in with a staff account.");
        setConfig([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't load the levers. Refresh the page in a moment.");
        setConfig([]);
        return;
      }
      setConfig((body.config as ConfigRow[]) ?? []);
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and refresh.");
      setConfig([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const value = Number(editing.draft);
    if (editing.draft.trim() === "" || !Number.isInteger(value) || value < 0) {
      setFieldError("Use a whole number, 0 or more.");
      return;
    }
    if (value === editing.current) { setEditing(null); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/economy-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editing.key, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(`Couldn't save ${editing.label}. Try again.`);
        return;
      }
      toast.success(`Saved: ${editing.label} is now ${valueText(value, editing.unit)}`);
      setEditing(null);
      await load();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const open = (key: string, label: string, helper: string, unit: LeverMeta["unit"]) => {
    const row = config?.find((r) => r.key === key);
    setFieldError(null);
    setEditing({ key, label, helper, unit, current: row ? row.value : null, draft: row ? String(row.value) : "" });
  };

  const known = new Set(LEVERS.map((l) => l.key));
  const unknown = config?.filter((r) => !known.has(r.key)) ?? [];

  const row = (key: string, label: string, helper: string, unit: LeverMeta["unit"]) => {
    const r = config?.find((c) => c.key === key);
    return (
      <li key={key} className="admin-money-row">
        <div className="admin-money-row__text">
          <p className="admin-money-row__name">{label}</p>
          {helper && <p className="admin-money-row__help">{helper}</p>}
          <p className="admin-money-row__meta">{r ? `Last changed ${when(r.updated_at)}` : "Not set yet: the built-in default applies"}</p>
        </div>
        <span className="admin-money-row__value admin-num">{r ? valueText(r.value, unit) : "Default"}</span>
        <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit ${label}`} onClick={() => open(key, label, helper, unit)}>Edit</Button>
      </li>
    );
  };

  return (
    <div className="account-card admin-screen admin-money">
      <AdminHeader
        title="Levers"
        intro="Every number the token economy runs on: welcome grants, earning, chaos prices and streamer payouts. A change applies straight away."
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {config === null ? (
        <LoadingLines label="Loading the levers" />
      ) : (
        <>
          {CATEGORIES.map((cat) => {
            const list = LEVERS.filter((l) => l.category === cat.id);
            if (list.length === 0) return null;
            const Icon = cat.icon;
            return (
              <AdminSection key={cat.id} title={cat.title} intro={cat.intro} icon={<Icon size={20} />}>
                <ul className="admin-money-list">{list.map((l) => row(l.key, l.label, l.helper, l.unit))}</ul>
              </AdminSection>
            );
          })}

          {unknown.length > 0 && (
            <AdminSection title="Other settings" icon={<IconHandStop size={20} />} intro="Settings a newer feature added that this page doesn't describe yet. Check with a developer what one does before changing it.">
              <ul className="admin-money-list">{unknown.map((r) => row(r.key, humanize(r.key), "", "count"))}</ul>
            </AdminSection>
          )}
        </>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => { if (!saving) setEditing(null); }}
        title={editing ? `Edit: ${editing.label}` : ""}
        size="small"
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: () => { if (!saving) void save(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setEditing(null) }}
      >
        {editing && (
          <form className="admin-form" onSubmit={(e) => { e.preventDefault(); if (!saving) void save(); }}>
            {editing.helper && <p className="admin-money-modal__note">{editing.helper}</p>}
            <AdminField
              label={`New value (${UNIT_FIELD[editing.unit]})`}
              error={fieldError}
              helper={editing.current == null ? "Not set yet: the built-in default applies." : `Now ${valueText(editing.current, editing.unit)}.`}
            >
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={fieldError ? true : undefined}
                  error={!!fieldError}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={editing.draft}
                  onChange={(e) => { setFieldError(null); setEditing({ ...editing, draft: e.target.value }); }}
                  fullWidth
                  autoFocus
                />
              )}
            </AdminField>
          </form>
        )}
      </Modal>
    </div>
  );
}
