"use client";

/**
 * Platform ▸ Token economy ▸ Rules (staff/admin): the region rules catalog
 * (`gs_compliance_rules`).
 *
 * The token-economy dispatcher checks these before letting a viewer use a
 * classed surface (prediction pools today; casino-style is dormant in the
 * schema). Each rule maps (region × class × optional genre) to one of three
 * behaviors: `full` (no restriction), `spectator` (no-stakes participation),
 * `unavailable` (silent reject in chat). A known region with no rule gets full
 * access; a viewer whose region can't be told watches only.
 *
 * NOT LEGAL ADVICE: the seed list mirrors comparable platforms' public
 * restrictions. Final mapping is a counsel question; this surface lets admins
 * update without a deploy.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Modal, Radio, RadioGroup, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea,
} from "@empac/cascadeds";
import { IconMapPin, IconPencil, IconPlus, IconWorld } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminRowMenu, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";

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

const PAGE = 25;

const CLASS_LABEL: Record<ComplianceClass, string> = {
  prediction_pool: "Predictions",
  casino_style: "Casino-style games",
};
const CLASS_HELP: Record<ComplianceClass, string> = {
  prediction_pool: "Token predictions on stream, like betting on who wins a race.",
  casino_style: "Nothing uses this today. It's kept in case a future game needs it.",
};

const BEHAVIOR_LABEL: Record<Behavior, string> = {
  full: "Full access",
  spectator: "Watch only",
  unavailable: "Turned off",
};
const BEHAVIOR_HELP: Record<Behavior, string> = {
  full: "No restriction. Viewers there take part normally.",
  spectator: "Viewers can make picks but can't put tokens in, and don't share in the winnings.",
  unavailable: "Hidden for viewers there, and their chat commands for it are ignored without a reply.",
};
const BEHAVIOR_BADGE: Record<Behavior, "success" | "warning" | "error"> = { full: "success", spectator: "warning", unavailable: "error" };

const CLASS_FILTERS: Array<{ value: "all" | ComplianceClass; label: string }> = [
  { value: "all", label: "Every rule" },
  { value: "prediction_pool", label: "Predictions only" },
  { value: "casino_style", label: "Casino-style games only" },
];

const REGION_RE = /^[A-Z]{2}(-[A-Z0-9]{2,3})?$/;

let regionNames: Intl.DisplayNames | null = null;
/** "US" → "United States", "CA-QC" → "Canada (QC)". Falls back to the code. */
function regionName(code: string): string {
  const [country, sub] = code.toUpperCase().split("-");
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    const name = regionNames.of(country);
    if (!name || name === country) return code;
    return sub ? `${name} (${sub})` : name;
  } catch {
    return code;
  }
}

export function PlatformComplianceTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<"all" | ComplianceClass>("all");
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/compliance-rules", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("This screen is for GameShuffle staff only. Sign in with a staff account.");
        setRules([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't load the region rules. Refresh the page in a moment.");
        setRules([]);
        return;
      }
      setRules(body.rules as RuleRow[]);
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and refresh.");
      setRules([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const filtered = rules?.filter((r) => classFilter === "all" || r.compliance_class === classFilter) ?? [];

  const ruleName = (row: RuleRow) => `${CLASS_LABEL[row.compliance_class]} in ${regionName(row.region_code)}${row.genre ? `, ${row.genre} games` : ""}`;

  const handleDelete = async (row: RuleRow) => {
    const ok = await confirm({
      title: `Delete the rule for ${ruleName(row)}?`,
      body: row.region_code.includes("-")
        ? "Viewers there go back to the country's rule, or to full access if the country has none."
        : "Viewers there go back to full access.",
      confirmLabel: "Delete rule",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/compliance-rules/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't delete the rule. Try again.");
        return;
      }
      setRules((cur) => cur?.filter((r) => r.id !== row.id) ?? null);
      toast.success("Rule deleted");
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
  };

  const addButton = <Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add rule</Button>;

  return (
    <div className="account-card admin-screen admin-money">
      <AdminHeader
        title="Region rules"
        intro="Where viewers can use tokens on predictions. A rule here comes before any streamer setting, and viewers can't turn it off. Not legal advice: check with counsel before changing one."
        actions={addButton}
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      <AdminSection
        title="Rules"
        icon={<IconWorld size={20} />}
        intro="A country or region without a rule gets full access. Viewers whose region we can't tell can only watch."
      >
        {rules === null ? (
          <LoadingLines label="Loading the region rules" />
        ) : rules.length === 0 ? (
          <EmptyState
            variant="bordered"
            icon={<IconMapPin size={28} />}
            title="No region rules yet"
            description="Every country has full access until you add a rule. Add one to make predictions watch only or turned off somewhere."
            action={addButton}
          />
        ) : (
          <>
            <div className="admin-money-filters">
              <AdminField label="Show">
                {(id) => (
                  <Select
                    id={id}
                    options={CLASS_FILTERS.map((c) => ({ value: c.value, label: c.label }))}
                    value={classFilter}
                    onChange={(v) => { setClassFilter((Array.isArray(v) ? v[0] : v) as "all" | ComplianceClass); setLimit(PAGE); }}
                    size="small"
                    fullWidth
                  />
                )}
              </AdminField>
            </div>
            <p className="admin-money-count" role="status" aria-live="polite">{filtered.length === rules.length ? `${rules.length} ${rules.length === 1 ? "rule" : "rules"}` : `${filtered.length} of ${rules.length} rules shown`}</p>
            {filtered.length === 0 ? (
              <EmptyState variant="bordered" icon={<IconMapPin size={28} />} title="No rules of this kind" description="Choose Every rule to see the others." />
            ) : (
              <>
                <AdminTable label="Region rules">
                  <Table variant="striped" dense>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Region</TableHead>
                        <TableHead>Applies to</TableHead>
                        <TableHead>Games</TableHead>
                        <TableHead>Viewers get</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, limit).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell><strong>{regionName(row.region_code)}</strong><span className="admin-table__sub">{row.region_code}</span></TableCell>
                          <TableCell>{CLASS_LABEL[row.compliance_class]}</TableCell>
                          <TableCell>{row.genre ? row.genre : "All games"}</TableCell>
                          <TableCell><Badge variant={BEHAVIOR_BADGE[row.behavior]} size="small">{BEHAVIOR_LABEL[row.behavior]}</Badge></TableCell>
                          <TableCell><span className="admin-money-note" title={row.note ?? undefined}>{row.note ?? "None"}</span></TableCell>
                          <TableCell align="right">
                            <span className="admin-row-actions">
                              <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit the rule for ${ruleName(row)}`} onClick={() => setEditing(row)}>Edit</Button>
                              <AdminRowMenu label={`More for the rule for ${ruleName(row)}`} items={[{ label: "Delete rule", danger: true, onClick: () => void handleDelete(row) }]} />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
                {filtered.length > limit && (
                  <div className="admin-money-more"><Button variant="ghost" size="small" onClick={() => setLimit((x) => x + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length}</Button></div>
                )}
              </>
            )}
          </>
        )}
      </AdminSection>

      <AdminSection title="What viewers get" intro="Each rule picks one of these.">
        <ul className="admin-money-list">
          {(Object.keys(BEHAVIOR_LABEL) as Behavior[]).map((b) => (
            <li key={b} className="admin-money-row admin-money-row--plain">
              <div className="admin-money-row__text">
                <p className="admin-money-row__name"><Badge variant={BEHAVIOR_BADGE[b]} size="small">{BEHAVIOR_LABEL[b]}</Badge></p>
                <p className="admin-money-row__help">{BEHAVIOR_HELP[b]}</p>
              </div>
            </li>
          ))}
        </ul>
      </AdminSection>

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
  const [complianceClass, setComplianceClass] = useState<ComplianceClass>(row?.compliance_class ?? "prediction_pool");
  const [genre, setGenre] = useState(row?.genre ?? "");
  const [behavior, setBehavior] = useState<Behavior>(row?.behavior ?? "spectator");
  const [note, setNote] = useState(row?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);
  const toast = useToast();

  const typed = regionCode.trim().toUpperCase();
  const preview = REGION_RE.test(typed) && regionName(typed) !== typed ? `That's ${regionName(typed)}.` : null;

  const save = async () => {
    setRegionError(null);
    if (!typed) return setRegionError("Add a country code, like US or GB.");
    if (!REGION_RE.test(typed)) {
      return setRegionError("Use a two-letter country code like US or GB, or a country and region like CA-QC.");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/compliance-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          region_code: typed,
          compliance_class: complianceClass,
          genre: genre.trim() || null,
          behavior,
          note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(/duplicate|unique/i.test(String(body.error ?? "")) ? "There's already a rule for that region, game type and kind. Edit that one instead." : "Couldn't save the rule. Check the fields and try again.");
        return;
      }
      toast.success("Rule saved");
      onSaved();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit the rule for ${regionName(row.region_code)}` : "Add a region rule"}
      size="medium"
      footer={
        <div className="admin-money-modal-footer">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving}>Save rule</Button>
        </div>
      }
    >
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); if (!saving) void save(); }}>
        <div className="admin-form-grid">
          <AdminField
            label="Country or region code"
            error={regionError}
            helper={preview ?? "Two letters for a country (US, GB), or add a state or province (CA-QC, US-NY). Upper or lower case."}
          >
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={regionError ? true : undefined} error={!!regionError}
                value={regionCode} onChange={(e) => { setRegionError(null); setRegionCode(e.target.value); }} placeholder="US, GB or CA-QC" autoComplete="off" fullWidth autoFocus={!isEdit} />
            )}
          </AdminField>

          <AdminField label="Applies to" helper={CLASS_HELP[complianceClass]}>
            {(id) => (
              <Select
                id={id}
                value={complianceClass}
                onChange={(v) => setComplianceClass((Array.isArray(v) ? v[0] : v) as ComplianceClass)}
                options={[
                  { value: "prediction_pool", label: CLASS_LABEL.prediction_pool },
                  { value: "casino_style", label: CLASS_LABEL.casino_style },
                ]}
                fullWidth
              />
            )}
          </AdminField>
        </div>

        <AdminField label="Game type (optional)" helper="Leave it empty to cover every game. Fill it in only for a rule about one kind of game, like racing.">
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="racing" autoComplete="off" fullWidth />
          )}
        </AdminField>

        <RadioGroup name="behavior" label="Viewers there get" orientation="vertical" value={behavior} onChange={(v) => setBehavior(v as Behavior)}>
          <Radio value="full" label={BEHAVIOR_LABEL.full} helperText={BEHAVIOR_HELP.full} />
          <Radio value="spectator" label={BEHAVIOR_LABEL.spectator} helperText={BEHAVIOR_HELP.spectator} />
          <Radio value="unavailable" label={BEHAVIOR_LABEL.unavailable} helperText={BEHAVIOR_HELP.unavailable} />
        </RadioGroup>

        <AdminField label="Note (optional)" helper="Where the rule comes from and when, for other staff. Only staff see it.">
          {(id, describedBy) => (
            <Textarea id={id} aria-describedby={describedBy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Matches Twitch's Denmark policy, January 2026." rows={2} fullWidth />
          )}
        </AdminField>
      </form>
    </Modal>
  );
}
