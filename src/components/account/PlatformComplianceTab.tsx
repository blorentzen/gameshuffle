"use client";

/**
 * PlatformComplianceTab — staff/admin-only editor for the
 * compliance-rules catalog (`gs_compliance_rules`).
 *
 * The token-economy dispatcher checks this table before letting a
 * viewer interact with classed surfaces (prediction pools today;
 * casino-style is dormant in the schema). Each row maps a
 * (region × class × optional genre) tuple to one of three
 * behaviors: `full` (no restriction), `spectator` (no-stakes
 * participation), `unavailable` (silent reject in chat).
 *
 * NOT LEGAL ADVICE — the seed list mirrors comparable platforms'
 * public restrictions. Final mapping is a counsel question; this
 * surface lets admins update without a deploy.
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
  Textarea,
} from "@empac/cascadeds";

type ComplianceClass = "prediction_pool" | "casino_style";
type Behavior = "full" | "spectator" | "unavailable";

interface RuleRow {
  id: number;
  region_code: string;
  compliance_class: ComplianceClass;
  genre: string | null;
  behavior: Behavior;
  note: string | null;
  created_at: string;
}

const CLASS_LABEL: Record<ComplianceClass, string> = {
  prediction_pool: "Prediction pool",
  casino_style: "Casino-style",
};

const BEHAVIOR_LABEL: Record<Behavior, string> = {
  full: "Full access",
  spectator: "Spectator mode",
  unavailable: "Unavailable",
};

const BEHAVIOR_HELP: Record<Behavior, string> = {
  full: "Region has no restriction — viewers participate normally.",
  spectator:
    "Viewers can pick / signal but cannot escrow tokens. Excluded from parimutuel splits.",
  unavailable: "Silent reject — surface is hidden in chat for the region.",
};

const CLASS_FILTERS: Array<{ value: "all" | ComplianceClass; label: string }> = [
  { value: "all", label: "All classes" },
  { value: "prediction_pool", label: "Prediction pool only" },
  { value: "casino_style", label: "Casino-style only" },
];

export function PlatformComplianceTab() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<"all" | ComplianceClass>(
    "all",
  );
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/compliance-rules", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError(
          "Forbidden — this surface is for GameShuffle staff only.",
        );
        setRules([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setRules([]);
        return;
      }
      setRules(body.rules as RuleRow[]);
    } catch {
      setLoadError("Network error while loading.");
      setRules([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    rules?.filter(
      (r) => classFilter === "all" || r.compliance_class === classFilter,
    ) ?? [];

  const handleDelete = async (row: RuleRow) => {
    if (
      !confirm(
        `Delete the ${CLASS_LABEL[row.compliance_class]} rule for ${row.region_code}${row.genre ? ` / ${row.genre}` : ""}? Viewers in that region will revert to platform defaults.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/compliance-rules/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      setRules((cur) => cur?.filter((r) => r.id !== row.id) ?? null);
    } catch {
      setLoadError("Network error while deleting.");
    }
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Compliance rules</h2>
      <p className="account-tab__intro">
        Region-by-region availability for token-economy surfaces.
        Used today by markets / prediction pools (casino-style is
        dormant). The dispatcher consults this table BEFORE any
        streamer module-enable toggle — viewers can&rsquo;t opt out
        of compliance.{" "}
        <strong>Not legal advice</strong> — keep counsel in the loop
        when changing rules.
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
            options={CLASS_FILTERS.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
            value={classFilter}
            onChange={(v) =>
              setClassFilter(
                (Array.isArray(v) ? v[0] : v) as "all" | ComplianceClass,
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
          {filtered.length} / {rules?.length ?? 0} shown
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add rule
          </Button>
        </div>
      </div>

      {rules === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="account-tab__empty">
          {rules.length === 0
            ? "No compliance rules yet."
            : "No rules match the current filter."}
        </p>
      ) : (
        <table className="platform-events__table">
          <thead>
            <tr>
              <th>Region</th>
              <th>Class</th>
              <th>Genre</th>
              <th>Behavior</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.region_code}</code>
                </td>
                <td>{CLASS_LABEL[row.compliance_class]}</td>
                <td>
                  {row.genre ? (
                    <code>{row.genre}</code>
                  ) : (
                    <span
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      all
                    </span>
                  )}
                </td>
                <td>{BEHAVIOR_LABEL[row.behavior]}</td>
                <td
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "var(--font-size-12)",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.note ?? undefined}
                >
                  {row.note ?? "—"}
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
        <RuleEditorModal
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
  row: RuleRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function RuleEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {
  const isEdit = !!row;
  const [regionCode, setRegionCode] = useState(row?.region_code ?? "");
  const [complianceClass, setComplianceClass] = useState<ComplianceClass>(
    row?.compliance_class ?? "prediction_pool",
  );
  const [genre, setGenre] = useState(row?.genre ?? "");
  const [behavior, setBehavior] = useState<Behavior>(
    row?.behavior ?? "spectator",
  );
  const [note, setNote] = useState(row?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmedRegion = regionCode.trim().toUpperCase();
    if (!trimmedRegion) return setError("Region code is required.");
    if (!/^[A-Z]{2}(-[A-Z0-9]{2,3})?$/.test(trimmedRegion)) {
      return setError(
        "Region code must be ISO format (e.g. US, GB, CA-QC).",
      );
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/compliance-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          region_code: trimmedRegion,
          compliance_class: complianceClass,
          genre: genre.trim() || null,
          behavior,
          note: note.trim() || null,
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
      title={
        isEdit
          ? `Edit ${row.region_code} · ${CLASS_LABEL[row.compliance_class]}`
          : "Add compliance rule"
      }
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
            Save rule
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
            <span className="hub-form__label">Region code</span>
            <Input
              value={regionCode}
              onChange={(e) => setRegionCode(e.target.value)}
              placeholder="US, GB, CA-QC"
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              ISO 3166-1 alpha-2 (<code>US</code>, <code>GB</code>)
              optionally with a subdivision suffix (<code>CA-QC</code>,{" "}
              <code>US-NY</code>). Case-insensitive.
            </p>
          </label>

          <label className="hub-form__field">
            <span className="hub-form__label">Class</span>
            <Select
              value={complianceClass}
              onChange={(v) =>
                setComplianceClass(v as ComplianceClass)
              }
              options={[
                {
                  value: "prediction_pool",
                  label: CLASS_LABEL.prediction_pool,
                },
                {
                  value: "casino_style",
                  label: CLASS_LABEL.casino_style,
                },
              ]}
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              <code>prediction_pool</code> covers markets / live
              prediction surfaces.{" "}
              <code>casino_style</code> is dormant (no surfaces map
              to it today) but retained for future revisits.
            </p>
          </label>
        </div>

        <label className="hub-form__field">
          <span className="hub-form__label">Genre (optional)</span>
          <Input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="racing"
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Empty = applies to <strong>all genres</strong> for this
            region + class. Specify when the restriction is genre-
            specific (e.g. AU racing-game rules).
          </p>
        </label>

        <RadioGroup
          name="behavior"
          label="Behavior"
          orientation="vertical"
          value={behavior}
          onChange={(v) => setBehavior(v as Behavior)}
        >
          <Radio
            value="full"
            label={BEHAVIOR_LABEL.full}
            helperText={BEHAVIOR_HELP.full}
          />
          <Radio
            value="spectator"
            label={BEHAVIOR_LABEL.spectator}
            helperText={BEHAVIOR_HELP.spectator}
          />
          <Radio
            value="unavailable"
            label={BEHAVIOR_LABEL.unavailable}
            helperText={BEHAVIOR_HELP.unavailable}
          />
        </RadioGroup>

        <label className="hub-form__field">
          <span className="hub-form__label">Note (optional)</span>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mirrors Twitch's Denmark policy as of 2026-01."
            rows={2}
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Free-text — usually the source / date of the policy
            you&rsquo;re mirroring. Visible to admins only.
          </p>
        </label>
      </div>
    </Modal>
  );
}
