"use client";

/**
 * PlatformEconomyTab — staff/admin-only editor for the
 * `gs_economy_config` levers.
 *
 * Every numeric constant the token economy reads (grants, earn
 * defaults, daily ceilings, chaos price band, streamer allowance,
 * stream-end grace) lives here. Today changes require a SQL Editor
 * session; this tab is the UI alternative.
 *
 * Layout: levers grouped by domain (Onboarding / Earns / Chaos /
 * Streamer / Lifecycle) with per-row helper text explaining what
 * each one controls and which surface reads it. Unknown keys (rare
 * — would only appear if staff seeded a custom key via SQL) bucket
 * into a fallback section with a generic input.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input } from "@empac/cascadeds";

interface ConfigRow {
  key: string;
  value: number;
  updated_at: string;
}

type LeverCategory =
  | "onboarding"
  | "earns"
  | "chaos"
  | "streamer"
  | "lifecycle";

interface LeverMeta {
  key: string;
  label: string;
  helper: string;
  unit: "tokens" | "seconds" | "count";
  category: LeverCategory;
}

const LEVERS: LeverMeta[] = [
  // ── Onboarding ────────────────────────────────────────────────
  {
    key: "grant_start",
    label: "New viewer grant",
    helper:
      "Tokens credited to a new identity on first contact. Sets every viewer's starting wallet. Bumping it makes early gameplay feel richer — at the cost of inflating supply on every signup.",
    unit: "tokens",
    category: "onboarding",
  },
  {
    key: "new_community_bonus",
    label: "New community bonus",
    helper:
      "Bonus when a viewer first touches a new community (different streamer). Encourages cross-stream participation — small by design.",
    unit: "tokens",
    category: "onboarding",
  },
  {
    key: "bust_recovery_amount",
    label: "Bust recovery",
    helper:
      "Tokens credited when a viewer's balance drops to the bust floor. Keeps wallets from sticking at zero. Pair with bust_floor.",
    unit: "tokens",
    category: "onboarding",
  },
  {
    key: "bust_floor",
    label: "Bust floor",
    helper:
      "Balance threshold at which a viewer becomes eligible for bust recovery. Set too high and recovery loops indefinitely; set too low and viewers stay stuck.",
    unit: "tokens",
    category: "onboarding",
  },
  // ── Earns ─────────────────────────────────────────────────────
  {
    key: "earn_t1_default",
    label: "T1 earn (in-game)",
    helper:
      "Base earn for in-game payouts (race finishes, tournament wins). Per-streamer multipliers stack on this. T1 is the higher-value channel.",
    unit: "tokens",
    category: "earns",
  },
  {
    key: "earn_t2_default",
    label: "T2 earn (chat)",
    helper:
      "Base earn for chat engagement — first N messages per session count. Smaller than T1 to keep chat farming below in-game contribution.",
    unit: "tokens",
    category: "earns",
  },
  {
    key: "t2_first_n_per_session",
    label: "T2 cap per session",
    helper:
      "How many T2 earns a single viewer can accumulate per session. Caps spam farming without punishing genuine chatters.",
    unit: "count",
    category: "earns",
  },
  {
    key: "daily_earn_ceiling",
    label: "Daily earn ceiling",
    helper:
      "Per-viewer daily cap across all earn types. The inflation thermostat — pulls down individual flow without affecting one-time grants.",
    unit: "tokens",
    category: "earns",
  },
  // ── Chaos ─────────────────────────────────────────────────────
  {
    key: "chaos_price_min",
    label: "Chaos price floor",
    helper:
      "Minimum cost a streamer can set for !chaos. Caller's request below this is rejected. Pair with chaos_price_max.",
    unit: "tokens",
    category: "chaos",
  },
  {
    key: "chaos_price_max",
    label: "Chaos price ceiling",
    helper:
      "Maximum cost a streamer can set for !chaos. Caps how punishing a streamer can make their disruption pool — preserves the platform feel.",
    unit: "tokens",
    category: "chaos",
  },
  // ── Streamer ──────────────────────────────────────────────────
  {
    key: "streamer_monthly_allowance",
    label: "Default monthly allowance",
    helper:
      "Default monthly mint-on-award ceiling per paying streamer. Tier-specific overrides snapshot at billing period start. Never exposed to streamers (per Spec 05 §5).",
    unit: "tokens",
    category: "streamer",
  },
  // ── Lifecycle ─────────────────────────────────────────────────
  {
    key: "stream_end_grace_seconds",
    label: "Stream-end grace",
    helper:
      "Seconds after Twitch reports stream.offline before we flip to ended state. A brief disconnect-and-reconnect within this window keeps open markets alive instead of triggering refunds.",
    unit: "seconds",
    category: "lifecycle",
  },
];

const CATEGORY_LABEL: Record<LeverCategory, string> = {
  onboarding: "Onboarding & welcome",
  earns: "Daily earns",
  chaos: "Chaos pricing",
  streamer: "Streamer allowance",
  lifecycle: "Session lifecycle",
};

const CATEGORY_ORDER: LeverCategory[] = [
  "onboarding",
  "earns",
  "chaos",
  "streamer",
  "lifecycle",
];

const UNIT_LABEL: Record<LeverMeta["unit"], string> = {
  tokens: "🪙 tokens",
  seconds: "seconds",
  count: "count",
};

export function PlatformEconomyTab() {
  const [config, setConfig] = useState<ConfigRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/economy-config", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError("Forbidden — staff only.");
        setConfig([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setConfig([]);
        return;
      }
      const rows = (body.config as ConfigRow[]) ?? [];
      setConfig(rows);
      const seeded: Record<string, string> = {};
      for (const r of rows) seeded[r.key] = String(r.value);
      setDrafts(seeded);
    } catch {
      setLoadError("Network error while loading.");
      setConfig([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: string) => {
    const value = parseInt(drafts[key] ?? "", 10);
    if (!Number.isInteger(value) || value < 0) {
      setLoadError("Value must be a non-negative integer.");
      return;
    }
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/economy-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  // Bucket rows: known levers (with metadata) vs. unknown keys
  // (custom additions via SQL). Unknown keys still get rendered so
  // staff can edit them, just without rich helper text.
  const knownByKey = new Map(LEVERS.map((l) => [l.key, l]));
  const knownByCategory = new Map<LeverCategory, LeverMeta[]>();
  for (const cat of CATEGORY_ORDER) knownByCategory.set(cat, []);
  for (const l of LEVERS) knownByCategory.get(l.category)?.push(l);

  const unknownKeys =
    config?.filter((r) => !knownByKey.has(r.key)).map((r) => r.key) ?? [];

  const renderLever = (lever: LeverMeta) => {
    const row = config?.find((r) => r.key === lever.key);
    const draft = drafts[lever.key] ?? "";
    const dirty = row ? draft !== String(row.value) : true;
    const isSaving = savingKey === lever.key;
    return (
      <Card key={lever.key} variant="outlined" padding="medium">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 200px auto",
            gap: "var(--spacing-16)",
            alignItems: "flex-start",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-primary)",
              }}
            >
              {lever.label}
            </p>
            <p
              style={{
                margin: "var(--spacing-4) 0 0",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {lever.key}
            </p>
            <p
              style={{
                margin: "var(--spacing-8) 0 0",
                fontSize: "var(--font-size-14)",
                color: "var(--text-secondary)",
                lineHeight: "var(--line-height-relaxed)",
              }}
            >
              {lever.helper}
            </p>
          </div>
          <label
            className="hub-form__field"
            style={{ minWidth: 0 }}
          >
            <span className="hub-form__label">{UNIT_LABEL[lever.unit]}</span>
            <Input
              type="number"
              min={0}
              value={draft}
              onChange={(e) =>
                setDrafts((prev) => ({
                  ...prev,
                  [lever.key]: e.target.value,
                }))
              }
              fullWidth
            />
            {row && (
              <p
                style={{
                  margin: "var(--spacing-4) 0 0",
                  fontSize: "var(--font-size-12)",
                  color: "var(--text-tertiary)",
                }}
              >
                Updated{" "}
                {new Date(row.updated_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: "100%",
              paddingTop: "var(--spacing-20)",
            }}
          >
            <Button
              variant="primary"
              size="small"
              onClick={() => void save(lever.key)}
              disabled={!dirty || isSaving}
              loading={isSaving}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Economy levers</h2>
      <p className="account-tab__intro">
        Every numeric constant the token economy reads — grants,
        earn defaults, daily ceilings, chaos band, streamer
        allowance, stream-end grace. Edits land instantly; the
        engine reads from{" "}
        <code>gs_economy_config_value(key, default)</code> on every
        interaction. The fallback default in code is the safety net
        when the row is missing or unreadable.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {config === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-32)",
          }}
        >
          {CATEGORY_ORDER.map((cat) => {
            const list = knownByCategory.get(cat) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={cat}>
                <h3
                  style={{
                    fontSize: "var(--font-size-14)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--text-secondary)",
                    margin: "0 0 var(--spacing-12)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {CATEGORY_LABEL[cat]}
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-12)",
                  }}
                >
                  {list.map(renderLever)}
                </div>
              </section>
            );
          })}

          {unknownKeys.length > 0 && (
            <section>
              <h3
                style={{
                  fontSize: "var(--font-size-14)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--text-secondary)",
                  margin: "0 0 var(--spacing-12)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Custom keys (no metadata)
              </h3>
              <p
                style={{
                  margin: "0 0 var(--spacing-12)",
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-tertiary)",
                  lineHeight: "var(--line-height-relaxed)",
                }}
              >
                Keys that exist in <code>gs_economy_config</code> but
                aren&rsquo;t in the metadata catalog above. Usually
                this means a new feature seeded a key via SQL; add
                metadata to this component when adopting it.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-12)",
                }}
              >
                {unknownKeys.map((key) => {
                  const row = config!.find((r) => r.key === key)!;
                  const draft = drafts[key] ?? "";
                  const dirty = draft !== String(row.value);
                  const isSaving = savingKey === key;
                  return (
                    <Card
                      key={key}
                      variant="outlined"
                      padding="medium"
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "1fr 200px auto",
                          gap: "var(--spacing-16)",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <code
                            style={{
                              fontSize: "var(--font-size-14)",
                            }}
                          >
                            {key}
                          </code>
                        </div>
                        <label
                          className="hub-form__field"
                          style={{ minWidth: 0 }}
                        >
                          <span className="hub-form__label">
                            Value
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={draft}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            fullWidth
                          />
                        </label>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            height: "100%",
                            paddingTop:
                              "var(--spacing-20)",
                          }}
                        >
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => void save(key)}
                            disabled={!dirty || isSaving}
                            loading={isSaving}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
