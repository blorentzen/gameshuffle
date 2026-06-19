"use client";

/**
 * PlatformStaffTab — staff/admin-only directory for managing
 * platform roles.
 *
 * Surfaces:
 *   - Current staff/admin list with role selector + Remove
 *   - User search to find candidates for promotion
 *   - Last 20 role changes from gs_role_audit_log
 *
 * Authority asymmetry baked in:
 *   - Staff-tier callers see the page read-only
 *   - Only admin-tier callers see editable selectors
 *
 * The server enforces the same gate on PUT — UI hides controls
 * but never trusts the client.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Card,
  Input,
  Select,
} from "@empac/cascadeds";

/** Operational role only (the `users.role` column). Subscription
 *  tier is on a different column and surfaces as read-only context
 *  here — never mutated through this UI. */
type OperationalRole = "staff" | "admin";
/** Sentinel sent to the API to clear the role column. */
type RoleSelectValue = OperationalRole | "none";

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

const ROLE_OPTIONS: { value: RoleSelectValue; label: string }[] = [
  { value: "none", label: "— no operational role" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE: Record<
  "none" | OperationalRole,
  { label: string; variant: "default" | "success" | "warning" }
> = {
  none: { label: "—", variant: "default" },
  staff: { label: "Staff", variant: "success" },
  admin: { label: "Admin", variant: "warning" },
};

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  member: "Member",
  creator: "Creator",
  pro: "Pro",
};

function displayUser(u: {
  display_name: string | null;
  username: string | null;
  email: string | null;
}): string {
  return u.display_name ?? u.username ?? u.email ?? "(unknown)";
}

export function PlatformStaffTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(
    async (searchTerm: string) => {
      setLoadError(null);
      try {
        const url = searchTerm
          ? `/api/admin/staff?search=${encodeURIComponent(searchTerm)}`
          : "/api/admin/staff";
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 403) {
          setLoadError("Forbidden — staff only.");
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setLoadError(body.error || `Load failed (${res.status}).`);
          return;
        }
        setData(body as ApiResponse);
      } catch {
        setLoadError("Network error while loading.");
      }
    },
    [],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  // Debounce searches — 250ms after the last keystroke. Spares the
  // search endpoint from one query per character.
  useEffect(() => {
    const handle = setTimeout(() => {
      void load(search.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [search, load]);

  const setRole = async (userId: string, role: RoleSelectValue) => {
    if (!data?.canMutate) return;
    setSavingUserId(userId);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      await load(search.trim());
    } finally {
      setSavingUserId(null);
    }
  };

  const renderUserRow = (u: UserRow) => {
    const display = displayUser(u);
    const isSaving = savingUserId === u.id;
    // role column is null for "no special role" — UI uses the
    // 'none' sentinel so the Select has a valid value to render.
    const roleKey: "none" | OperationalRole = u.role ?? "none";
    const badge = ROLE_BADGE[roleKey];
    const tierLabel = u.subscription_tier
      ? TIER_LABEL[u.subscription_tier] ?? u.subscription_tier
      : "Free";
    return (
      <Card key={u.id} variant="outlined" padding="medium">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 100px 240px",
            gap: "var(--spacing-16)",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-16)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {display}
            </p>
            <p
              style={{
                margin: "var(--spacing-4) 0 0",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {u.username ?? "—"} · {u.email ?? "—"}
            </p>
          </div>
          {/* Subscription tier — read-only context. Comes from
              Stripe via users.subscription_tier; never mutated
              through this surface. */}
          <Badge variant="info" size="small">
            {tierLabel}
          </Badge>
          {/* Operational role — what this tab actually mutates. */}
          <Badge variant={badge.variant} size="default">
            {badge.label}
          </Badge>
          <div>
            {data?.canMutate ? (
              <Select
                value={roleKey}
                onChange={(v) =>
                  void setRole(u.id, v as RoleSelectValue)
                }
                options={ROLE_OPTIONS}
                disabled={isSaving}
                fullWidth
              />
            ) : (
              <span
                style={{
                  fontSize: "var(--font-size-12)",
                  color: "var(--text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                Read-only (admin role required to mutate)
              </span>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="account-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--spacing-16)",
          flexWrap: "wrap",
          marginBottom: "var(--spacing-32)",
        }}
      >
        <div>
          <h2 className="account-tab__heading">Staff & roles</h2>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            Manage the staff/admin pool. <strong>Admin-only</strong>{" "}
            for mutations — staff-tier accounts see the page
            read-only. Every role change is logged to{" "}
            <code>gs_role_audit_log</code> with who changed it,
            when, and the before/after.
          </p>
        </div>
      </div>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {data === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : (
        <>
          {/* ── Current staff & admins ─────────────────────────── */}
          <section style={{ marginBottom: "var(--spacing-32)" }}>
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
              Current staff & admins ({data.staff.length})
            </h3>
            {data.staff.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No one has the staff or admin role yet. Search
                below to promote the first one.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-12)",
                }}
              >
                {data.staff.map(renderUserRow)}
              </div>
            )}
          </section>

          {/* ── Search for a user ──────────────────────────────── */}
          <section style={{ marginBottom: "var(--spacing-32)" }}>
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
              Find someone to promote
            </h3>
            <Input
              placeholder="Search by email, username, or display name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
            />
            {search.trim().length >= 2 && (
              <div
                style={{
                  marginTop: "var(--spacing-12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-12)",
                }}
              >
                {data.searchResults.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--font-size-14)",
                      color: "var(--text-tertiary)",
                      fontStyle: "italic",
                    }}
                  >
                    No matches.
                  </p>
                ) : (
                  data.searchResults.map(renderUserRow)
                )}
              </div>
            )}
            {search.trim().length > 0 && search.trim().length < 2 && (
              <p
                style={{
                  margin: "var(--spacing-8) 0 0",
                  fontSize: "var(--font-size-12)",
                  color: "var(--text-tertiary)",
                }}
              >
                Type at least 2 characters to search.
              </p>
            )}
          </section>

          {/* ── Recent role changes ────────────────────────────── */}
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
              Recent role changes
            </h3>
            {data.audit.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No role changes recorded yet.
              </p>
            ) : (
              <Card variant="outlined" padding="medium">
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-12)",
                  }}
                >
                  {data.audit.map((a) => (
                    <li
                      key={a.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "var(--spacing-16)",
                        fontSize: "var(--font-size-14)",
                        color: "var(--text-secondary)",
                        lineHeight:
                          "var(--line-height-relaxed)",
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong
                          style={{
                            color:
                              "var(--text-primary)",
                          }}
                        >
                          {a.changed_by}
                        </strong>{" "}
                        changed{" "}
                        <strong
                          style={{
                            color:
                              "var(--text-primary)",
                          }}
                        >
                          {a.target}
                        </strong>
                        : <code>{a.old_role ?? "(none)"}</code>{" "}
                        → <code>{a.new_role ?? "(none)"}</code>
                        {a.note && (
                          <>
                            {" "}
                            <span
                              style={{
                                color:
                                  "var(--text-tertiary)",
                                fontStyle: "italic",
                              }}
                            >
                              — {a.note}
                            </span>
                          </>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--font-size-12)",
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                        }}
                      >
                        {new Date(a.changed_at).toLocaleString(
                          undefined,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          },
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
