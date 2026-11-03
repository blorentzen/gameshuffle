"use client";

/**
 * Staff page ▸ Settings (pick 6A): where staff work (Discord, the web or both), what checks itself, and the discipline
 * numbers. Admins change them; updaters see them. Saves itself a moment after a change, like every setting on the site.
 */

import { useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { Select } from "@/components/ui/Select";
import type { DisciplineSettings, PenaltyKind } from "@/lib/ladders/discipline";
import type { StaffSettings as Staff } from "@/lib/ladders/types";
import type { StaffTabProps } from "./RankedStaffHub";
import { StaffQueues } from "./StaffQueues";

const KINDS: PenaltyKind[] = ["late", "drop_before", "drop_during", "tag", "other"];
type Numbers = { penalties: Record<PenaltyKind, { mmr: string; strikes: string; label: string }>; strikeDays: string; breakAt: string; breakDays: string; reduced: boolean };

const toNumbers = (d: DisciplineSettings): Numbers => ({
  penalties: Object.fromEntries(KINDS.map((k) => [k, { mmr: String(d.penalties[k].mmr), strikes: String(d.penalties[k].strikes), label: d.penalties[k].label }])) as Numbers["penalties"],
  strikeDays: String(d.strikeDays), breakAt: String(d.breakAt), breakDays: String(d.breakDays), reduced: !!d.reducedLoss,
});
const toDiscipline = (n: Numbers, was: DisciplineSettings) => ({
  penalties: Object.fromEntries(KINDS.map((k) => [k, { mmr: Number(n.penalties[k].mmr) || 0, strikes: Number(n.penalties[k].strikes) || 0, label: n.penalties[k].label }])),
  strikeDays: Number(n.strikeDays) || was.strikeDays, breakAt: Number(n.breakAt) || 0, breakDays: Number(n.breakDays) || 0,
  reducedLoss: n.reduced ? (was.reducedLoss ?? { from: 3, none: 8 }) : null,
});

export function StaffSettings(props: StaffTabProps) {
  const { data, act, reload } = props;
  const admin = data.you.role === "admin";
  const was = data.ladder.settings;
  const [staff, setStaff] = useState<Staff>(was.staff);
  const [numbers, setNumbers] = useState<Numbers>(() => toNumbers(was.discipline));
  const [rolesOn, setRolesOn] = useState(was.rolesOn);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const value = { staff, numbers, rolesOn };
  useAutosave(value, async (v) => {
    const res = await act({ action: "settings", staff: v.staff, discipline: toDiscipline(v.numbers, was.discipline), rolesOn: v.rolesOn });
    if (res.ok) reload();
    return res.ok;
  }, { ready: admin });
  const setPen = (k: PenaltyKind, field: "mmr" | "strikes", v: string) => setNumbers((n) => ({ ...n, penalties: { ...n.penalties, [k]: { ...n.penalties[k], [field]: v } } }));
  return (
    <div className="ranked-staff__panel">
      {!admin && <p className="ladder-status">Only the server&apos;s admins change these. You can see them here.</p>}
      <section className="ranked-staff__sec" aria-labelledby="staff-work">
        <h2 id="staff-work">How staff work</h2>
        <div className="ranked-form">
          <Select
            floatingLabel="Where waiting tables show"
            value={staff.workIn}
            disabled={!admin}
            onChange={(v) => setStaff((s) => ({ ...s, workIn: v === "discord" || v === "web" ? v : "both" }))}
            options={[
              { value: "both", label: "Both: a card in the results channel and this page" },
              { value: "discord", label: "Discord: a card in the results channel" },
              { value: "web", label: "The web: this page only" },
            ]}
          />
          <p className="ladder-muted">Whatever staff press shows in both places. Verified tables and send backs always post in the results channel, so players see their numbers and reporters hear back.</p>
          <Switch
            label="Clean tables verify themselves"
            helperText="After 10 minutes, when the screenshot agrees with the text, every name is known and nobody asked for a penalty or reduced loss."
            checked={staff.autoVerify}
            disabled={!admin}
            onChange={(e) => setStaff((s) => ({ ...s, autoVerify: e.target.checked }))}
          />
          <Switch
            label="New players verify themselves"
            helperText="When MKCentral has their Discord on one profile, with a Switch friend code and no ban. Anything else comes to the Players tab."
            checked={staff.autoJoin}
            disabled={!admin}
            onChange={(e) => setStaff((s) => ({ ...s, autoJoin: e.target.checked }))}
          />
          <Switch
            label="Name changes approve themselves"
            helperText="Clean names that nobody else has, 60 days apart. Anything else comes to the Players tab."
            checked={staff.autoNames}
            disabled={!admin}
            onChange={(e) => setStaff((s) => ({ ...s, autoNames: e.target.checked }))}
          />
          <p className="ladder-muted">MMR rules: {data.ladder.rules === "lounge200" ? "the 200 Lounge's rules" : "MKCentral's model"}.</p>
        </div>
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-roles">
        <h2 id="staff-roles">Division roles</h2>
        <div className="ranked-form">
          <Switch
            label="Division roles in Discord"
            helperText="Each player tied to a Discord account gets their division's role in this server, kept up to date after every table. The roles are made the first time; give GameShuffle Competitive Manage Roles, with its own role above them."
            checked={rolesOn}
            disabled={!admin}
            onChange={(e) => setRolesOn(e.target.checked)}
          />
          {admin && was.rolesOn && (
            <div className="ranked-staff__bar">
              <Button variant="secondary" loading={syncing} onClick={async () => {
                setSyncing(true);
                const res = await act({ action: "roles_sync" });
                setSyncing(false);
                if (res.ok) toast.success(`Roles are up to date (${Number(res.changed ?? 0)} changed).`);
                else toast.error(res.error === "no_access" ? "The bot can't manage roles here. Give GameShuffle Competitive Manage Roles, with its own role above the division roles." : "That didn't work. Try again.");
              }}>Sync everyone now</Button>
            </div>
          )}
        </div>
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-queues">
        <h2 id="staff-queues">Queues</h2>
        <StaffQueues {...props} />
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-penalties">
        <h2 id="staff-penalties">Penalties</h2>
        <div className="ranked-pens">
          {KINDS.map((k) => (
            <fieldset key={k} className="ranked-pens__row" disabled={!admin}>
              <legend>{numbers.penalties[k].label}</legend>
              <Input floatingLabel="MMR off" type="number" min={0} max={5000} value={numbers.penalties[k].mmr} onChange={(e) => setPen(k, "mmr", e.target.value)} />
              <Input floatingLabel="Strikes" type="number" min={0} max={5} value={numbers.penalties[k].strikes} onChange={(e) => setPen(k, "strikes", e.target.value)} />
            </fieldset>
          ))}
        </div>
        <div className="ranked-form__three">
          <Input floatingLabel="Strikes last (days)" type="number" min={1} max={365} value={numbers.strikeDays} disabled={!admin} onChange={(e) => setNumbers((n) => ({ ...n, strikeDays: e.target.value }))} />
          <Input floatingLabel="Strikes for a break" type="number" min={0} max={10} value={numbers.breakAt} disabled={!admin} onChange={(e) => setNumbers((n) => ({ ...n, breakAt: e.target.value }))} />
          <Input floatingLabel="Break length (days)" type="number" min={0} max={365} value={numbers.breakDays} disabled={!admin} onChange={(e) => setNumbers((n) => ({ ...n, breakDays: e.target.value }))} />
        </div>
        <p className="ladder-muted">0 strikes for a break means strikes never start one.</p>
        <Switch
          label="Reduced loss"
          helperText="When a teammate misses 3 to 7 races, the others lose less; 8 or more and they lose nothing. Gains are untouched."
          checked={numbers.reduced}
          disabled={!admin}
          onChange={(e) => setNumbers((n) => ({ ...n, reduced: e.target.checked }))}
        />
      </section>
    </div>
  );
}
