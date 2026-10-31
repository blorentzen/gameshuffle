"use client";

/**
 * Platform admin ▸ People ▸ Staff & roles.
 *
 *   - Everyone with a role (staff, admin, beta tester), with a Change role
 *     window for admins
 *   - A search to find someone new to give a role to
 *   - The last 20 role changes
 *
 * Authority asymmetry: staff see the page read-only; only admins get the
 * Change role buttons. The server enforces the same gate on PUT (the UI hides
 * controls but never trusts the client). Every change is logged with who made
 * it, when, the before/after and an optional note.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Modal, Select, StatCard, Textarea,
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCrown, IconFlask, IconHistory, IconShieldCheck } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { normalizeTier } from "@/lib/subscription";

/** Operational role only (separate from the paid plan, which Stripe sets and
 *  this screen never changes). `beta` = GS Pro for testing, no admin powers. */
type OperationalRole = "staff" | "admin" | "beta";
/** Sent to the API to clear the role. */
type RoleValue = OperationalRole | "none";

interface UserRow {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: OperationalRole | null;
  subscription_tier: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  changed_by_user_id: string | null;
  target_user_id: string;
  old_role: string | null;
  new_role: string | null;
  note: string | null;
  changed_at: string;
  changed_by: string;
  target: string;
}

interface ApiResponse {
  ok: true;
  callerRole: string | null;
  canMutate: boolean;
  staff: UserRow[];
  searchResults: UserRow[];
  audit: AuditRow[];
}

const ROLES: Record<RoleValue, { label: string; does: string; variant: "default" | "success" | "warning" | "info" | "outline"; action: string }> = {
  none: { label: "No role", does: "An ordinary account. Their own plan decides what they get.", variant: "outline", action: "Remove role" },
  beta: { label: "Beta tester", does: "GS Pro for free to test new features. No admin screens.", variant: "info", action: "Make beta tester" },
  staff: { label: "Staff", does: "GS Pro, plus Platform admin to see everything and run day-to-day tools. Can't change roles or switches.", variant: "success", action: "Make staff" },
  admin: { label: "Admin", does: "Everything staff can do, plus changing roles, switches, bans and appeals.", variant: "warning", action: "Make admin" },
};
const ROLE_OPTIONS = (["none", "beta", "staff", "admin"] as RoleValue[]).map((value) => ({ value, label: ROLES[value].label }));

const ERRORS: Record<string, string> = {
  admin_only_for_role_mutations: "Only admins can change roles.",
  cannot_demote_self: "You can't take admin away from yourself. Ask another admin.",
};

const PAGE = 25;
const roleOf = (role: string | null | undefined): RoleValue => (role && role in ROLES ? (role as RoleValue) : "none");
const nameOf = (u: { display_name: string | null; username: string | null; email: string | null }) => u.display_name ?? u.username ?? u.email ?? "Unknown account";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function PlatformStaffTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The search the shown results are for, so a search in flight shows as loading, not "no matches".
  const [searchedFor, setSearchedFor] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const toast = useToast();

  const load = useCallback(async (searchTerm: string) => {
    try {
      const url = searchTerm ? `/api/admin/staff?search=${encodeURIComponent(searchTerm)}` : "/api/admin/staff";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 403) { setLoadError("Only staff and admins can see this screen."); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) { setLoadError("Couldn't load the roles. Try again in a minute."); return; }
      setData(body as ApiResponse);
      setSearchedFor(searchTerm);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't reach GameShuffle. Check your connection and try again.");
    }
  }, []);

  // One load on open, then 250ms after the last keystroke in the search.
  useEffect(() => {
    const handle = setTimeout(() => void load(search.trim()), search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [search, load]);

  const saveRole = async (user: UserRow, role: RoleValue, note: string) => {
    const res = await fetch("/api/admin/staff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, role, note: note.trim() || undefined }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok || !body?.ok) {
      toast.error(ERRORS[body?.error ?? ""] ?? "That didn't save. Try again.");
      return false;
    }
    toast.success(role === "none" ? `${nameOf(user)} no longer has a role` : `${nameOf(user)} is now ${role === "admin" ? "an admin" : role === "beta" ? "a beta tester" : "staff"}`);
    await load(search.trim());
    return true;
  };

  const header = (
    <AdminHeader
      title="Staff and roles"
      intro="Who runs GameShuffle (staff and admins) and who gets GS Pro to test new features (beta testers)."
    />
  );

  if (!data) {
    return (
      <div className="account-card admin-screen">
        {header}
        {loadError ? <Alert variant="error">{loadError}</Alert> : <LoadingLines label="Loading roles" />}
      </div>
    );
  }

  const canEdit = data.canMutate;
  const count = (r: OperationalRole) => data.staff.filter((u) => u.role === r).length;
  const term = search.trim();
  const more = Math.min(PAGE, data.staff.length - shown);

  const peopleTable = (rows: UserRow[], label: string, empty: { title: string; description: string }) => (
    <AdminTable label={label}>
      <Table variant="striped" dense>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Paid plan</TableHead>
            <TableHead>Email</TableHead>
            {canEdit && <TableHead align="right"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={canEdit ? 5 : 4}><TableEmpty title={empty.title} description={empty.description} /></TableCell></TableRow>
          ) : rows.map((u) => {
            const role = ROLES[roleOf(u.role)];
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <strong>{nameOf(u)}</strong>
                  {u.username && <span className="admin-table__sub">@{u.username}</span>}
                </TableCell>
                <TableCell><Badge variant={role.variant} size="small">{role.label}</Badge></TableCell>
                <TableCell>{normalizeTier(u.subscription_tier) === "pro" ? "GS Pro" : "Free"}</TableCell>
                <TableCell>{u.email ?? <span className="admin-table__sub">No email</span>}</TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <Button variant="ghost" size="small" onClick={() => setEditing(u)} aria-label={`Change role for ${nameOf(u)}`}>Change role</Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AdminTable>
  );

  return (
    <div className="account-card admin-screen">
      {header}
      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}
      {!canEdit && <Alert variant="info">Only admins can change roles. You can see who has one and every change made.</Alert>}

      <AdminStats label="People with a role" columns={3}>
        <StatCard label="Admins" value={count("admin").toLocaleString()} source="Change roles and switches" icon={<IconCrown size={20} />} />
        <StatCard label="Staff" value={count("staff").toLocaleString()} source="Run Platform admin" icon={<IconShieldCheck size={20} />} />
        <StatCard label="Beta testers" value={count("beta").toLocaleString()} source="GS Pro to test features" icon={<IconFlask size={20} />} />
      </AdminStats>

      <AdminSection
        title="People with a role"
        intro="A role is separate from what someone pays for: staff, admins and beta testers all get GS Pro whatever their paid plan says."
      >
        {peopleTable(data.staff.slice(0, shown), "People with a role", {
          title: "No one has a role yet",
          description: "Find someone below to give the first one.",
        })}
        {more > 0 && (
          <div><Button variant="ghost" size="small" onClick={() => setShown((s) => s + PAGE)}>Show {more} more</Button></div>
        )}
      </AdminSection>

      <AdminSection title={canEdit ? "Give someone a role" : "Look someone up"} intro="Search any account by email, username or display name.">
        <Input type="search" fullWidth floatingLabel="Email, username or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        {term.length > 0 && term.length < 2 && <p className="admin-updated">Type at least 2 characters to search.</p>}
        {term.length >= 2 && (searchedFor !== term ? <LoadingLines lines={2} label="Searching" /> : peopleTable(data.searchResults, `Search results for ${term}`, {
          title: "No one matches that search",
          description: "Check the spelling, or try their email address.",
        }))}
      </AdminSection>

      <AdminSection title="Role history" intro="The last 20 role changes, newest first.">
        {data.audit.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconHistory size={28} />} title="No role changes yet" description="Each change shows here with who made it and when." />
        ) : (
          <AdminTable label="Role history">
            <Table variant="striped" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.audit.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><strong>{a.target === "(unknown)" ? "Unknown account" : a.target}</strong></TableCell>
                    <TableCell className="admin-people-nowrap">{ROLES[roleOf(a.old_role)].label} to {ROLES[roleOf(a.new_role)].label}</TableCell>
                    <TableCell>{a.changed_by === "(unknown)" ? "Unknown" : a.changed_by}</TableCell>
                    <TableCell className="admin-people-nowrap">{when(a.changed_at)}</TableCell>
                    <TableCell>{a.note ?? <span className="admin-table__sub">None</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>

      {editing && <RoleModal user={editing} onClose={() => setEditing(null)} onSave={saveRole} />}
    </div>
  );
}

/** Change one person's role, with an optional note that goes in the history. */
function RoleModal({ user, onClose, onSave }: {
  user: UserRow;
  onClose: () => void;
  onSave: (user: UserRow, role: RoleValue, note: string) => Promise<boolean>;
}) {
  const current = roleOf(user.role);
  const [role, setRole] = useState<RoleValue>(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = role !== current;

  const save = async () => {
    setBusy(true);
    const ok = await onSave(user, role, note);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Change ${nameOf(user)}'s role`}
      size="small"
      footer={
        <div className="admin-people-modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={role === "none" ? "danger" : "primary"} loading={busy} disabled={busy || !changed} onClick={() => void save()}>
            {changed ? ROLES[role].action : "Pick a new role"}
          </Button>
        </div>
      }
    >
      <div className="admin-people-form">
        <p className="admin-people-help">Now: <strong>{ROLES[current].label}</strong></p>
        <Select floatingLabel="Role" value={role} onChange={(v) => setRole(String(v) as RoleValue)} options={ROLE_OPTIONS} fullWidth />
        <p className="admin-people-help">{ROLES[role].does}</p>
        <Textarea fullWidth floatingLabel="Note for the role history (optional)" value={note} rows={2} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
