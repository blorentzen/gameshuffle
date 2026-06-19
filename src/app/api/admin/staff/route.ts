/**
 * GET  /api/admin/staff
 *   List current staff/admin users + recent audit log + optional
 *   `?search=` to find any user by email or username.
 *
 *   Staff-tier callers see read-only. Admin-tier callers see the
 *   same payload plus a hint that they can mutate.
 *
 * PUT  /api/admin/staff
 *   Mutate one user's role.
 *
 *   ADMIN-ONLY. Staff cannot promote/demote — that prevents a
 *   compromised or rogue staff account from creating more staff
 *   or locking out admins. The asymmetry is enforced server-side
 *   here; the UI hides controls based on the same check but never
 *   trusts the client.
 *
 *   Writes a row to gs_role_audit_log on every mutation.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

/** Operational roles only. Subscription tier (`free` / `member` /
 *  `creator` / `pro`) lives on `users.subscription_tier` and is
 *  driven by Stripe — never set via this route. The role column
 *  on `users` is documented as the staff/admin override that
 *  `effectiveTier()` upgrades to pro-equivalent access. */
type StaffRole = "staff" | "admin";

const VALID_ROLES: StaffRole[] = ["staff", "admin"];
/** Sentinel for "no operational role" — the API accepts this from
 *  the UI and writes NULL to the column. */
const REVOKE_SENTINEL = "none";

interface UserRow {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: string | null;
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
}

async function readCallerRole(): Promise<
  | { ok: true; userId: string; role: string | null }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
  return { ok: true, userId: user.id, role };
}

export async function GET(req: NextRequest) {
  const caller = await readCallerRole();
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  if (!isStaffRole(caller.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createServiceClient();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();

  // Current staff + admin set is always returned. Search broadens
  // the result with matching users (any role) so promoting a new
  // staff member is one search away.
  //
  // Reads go through the `user_directory` view which joins
  // public.users with auth.users.email — see supabase/user-directory-view.sql.
  // Mutations (PUT below) still hit public.users since only `role`
  // is being modified.
  const staffQuery = admin
    .from("user_directory")
    .select(
      "id, email, username, display_name, role, subscription_tier, created_at",
    )
    .in("role", ["staff", "admin"])
    .order("created_at", { ascending: true });
  const [staffResult, auditResult] = await Promise.all([
    staffQuery,
    admin
      .from("gs_role_audit_log")
      .select(
        "id, changed_by_user_id, target_user_id, old_role, new_role, note, changed_at",
      )
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);
  // Surface query errors instead of silently turning them into
  // empty arrays — debugging "where did my admin row go?" with
  // no error in the logs was painful (the immediate cause: a
  // post-`security_invoker` view that service_role couldn't
  // join through auth.users). Now any future permission /
  // schema-cache miss shows up loudly in the UI.
  if (staffResult.error) {
    console.error("[staff] user_directory query failed:", staffResult.error);
    return NextResponse.json(
      { error: `staff_query_failed: ${staffResult.error.message}` },
      { status: 500 },
    );
  }
  if (auditResult.error) {
    console.error("[staff] audit log query failed:", auditResult.error);
  }
  const staffRows = staffResult.data;
  const auditRows = auditResult.data;

  let searchResults: UserRow[] = [];
  if (search.length >= 2) {
    // Email + username + display_name match against the search
    // term. Lowercased server-side via ilike — Supabase doesn't
    // need explicit casts.
    const pattern = `%${search}%`;
    const { data } = await admin
      .from("user_directory")
      .select(
      "id, email, username, display_name, role, subscription_tier, created_at",
    )
      .or(
        `email.ilike.${pattern},username.ilike.${pattern},display_name.ilike.${pattern}`,
      )
      .limit(25);
    searchResults = (data as UserRow[] | null) ?? [];
  }

  // Resolve the display names for audit log actors and targets so
  // the UI can render "Britton promoted Sam" without a second
  // round trip. Same batched join we use elsewhere.
  const audit = (auditRows as AuditRow[] | null) ?? [];
  const referencedIds = new Set<string>();
  for (const a of audit) {
    if (a.changed_by_user_id) referencedIds.add(a.changed_by_user_id);
    referencedIds.add(a.target_user_id);
  }
  const namesByid = new Map<
    string,
    { display: string; username: string | null }
  >();
  if (referencedIds.size > 0) {
    const { data: refRows } = await admin
      .from("user_directory")
      .select("id, username, display_name, email")
      .in("id", Array.from(referencedIds));
    for (const u of (refRows as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      email: string | null;
    }> | null) ?? []) {
      const display =
        u.display_name ?? u.username ?? u.email ?? "(unknown)";
      namesByid.set(u.id, { display, username: u.username });
    }
  }

  return NextResponse.json({
    ok: true,
    callerRole: caller.role,
    canMutate: caller.role === "admin",
    staff: (staffRows as UserRow[] | null) ?? [],
    searchResults,
    audit: audit.map((a) => ({
      ...a,
      changed_by:
        a.changed_by_user_id && namesByid.has(a.changed_by_user_id)
          ? namesByid.get(a.changed_by_user_id)!.display
          : "(unknown)",
      target: namesByid.has(a.target_user_id)
        ? namesByid.get(a.target_user_id)!.display
        : "(unknown)",
    })),
  });
}

export async function PUT(req: NextRequest) {
  const caller = await readCallerRole();
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  // Admin-only — staff can't mutate roles (see route header note).
  if (caller.role !== "admin") {
    return NextResponse.json(
      { error: "admin_only_for_role_mutations" },
      { status: 403 },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    user_id?: string;
    role?: string;
    note?: string;
  } | null;
  if (!body?.user_id) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }
  // Accept either a valid operational role or the revoke sentinel
  // (which writes NULL to clear the role column).
  const isRevoke = body.role === REVOKE_SENTINEL;
  if (!isRevoke && !VALID_ROLES.includes(body.role as StaffRole)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  const newRoleValue: string | null = isRevoke ? null : body.role!;
  if (body.user_id === caller.userId && newRoleValue !== "admin") {
    // Foot-gun guard — refuse self-demotion to non-admin so the
    // last admin can't accidentally lock the platform out of role
    // management.
    return NextResponse.json(
      { error: "cannot_demote_self" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  // Snapshot the old role for the audit log.
  const { data: oldRow } = await admin
    .from("users")
    .select("role")
    .eq("id", body.user_id)
    .maybeSingle();
  const oldRole = (oldRow as { role: string | null } | null)?.role ?? null;
  if (oldRole === newRoleValue) {
    return NextResponse.json({ ok: true, changed: false });
  }
  // Mutate + audit. We don't wrap in a transaction since the audit
  // row failing shouldn't roll back the role change — but log the
  // audit failure noisily so it surfaces.
  const { error: updateError } = await admin
    .from("users")
    .update({ role: newRoleValue })
    .eq("id", body.user_id);
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 },
    );
  }
  const note = body.note?.trim() ? body.note.trim() : null;
  const { error: auditError } = await admin
    .from("gs_role_audit_log")
    .insert({
      changed_by_user_id: caller.userId,
      target_user_id: body.user_id,
      old_role: oldRole,
      new_role: newRoleValue,
      note,
    });
  if (auditError) {
    console.error(
      "[staff] role updated but audit insert failed:",
      auditError.message,
    );
  }
  return NextResponse.json({
    ok: true,
    changed: true,
    user_id: body.user_id,
    old_role: oldRole,
    new_role: newRoleValue,
  });
}
