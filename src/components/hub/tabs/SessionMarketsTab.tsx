/**
 * Hub session detail — Markets & Bounties tab.
 *
 * Two stacked panels:
 *   1. MarketsAdminPanel — tactile open/lock/close/resolve markets +
 *      open/cancel/award bounties for the streamer's community
 *   2. MarketsHistoryPanel — recent awards (`award_mint`), settled
 *      bounties, and cancelled markets so the streamer has
 *      visibility into what's been distributed
 *
 * The history is server-rendered (SSR via this server component);
 * the admin panel is client-side with polling.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { MarketsAdminPanel } from "@/components/hub/MarketsAdminPanel";

interface Props {
  streamerSlug: string;
  ownerUserId: string;
}

interface AwardRow {
  id: number;
  amount: number;
  created_at: string;
  recipient_display_name: string | null;
}

interface BountyHistoryRow {
  id: string;
  amount: number;
  description: string;
  status: "open" | "settled" | "cancelled";
  settled_to_display_name: string | null;
  created_at: string;
  settled_at: string | null;
  cancelled_at: string | null;
  resolved_value: string | null;
}

async function loadHistory(ownerUserId: string): Promise<{
  awards: AwardRow[];
  bounties: BountyHistoryRow[];
}> {
  const admin = createServiceClient();

  // Streamer's community via owner identity.
  const { data: identityRow } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", ownerUserId)
    .eq("platform", "twitch")
    .maybeSingle();
  if (!identityRow) return { awards: [], bounties: [] };

  const { data: communityRow } = await admin
    .from("gs_communities")
    .select("id")
    .eq("owner_identity_id", (identityRow as { id: string }).id)
    .maybeSingle();
  if (!communityRow) return { awards: [], bounties: [] };
  const communityId = (communityRow as { id: string }).id;

  // Last 25 award_mint events in this community.
  const { data: awardsRaw } = await admin
    .from("token_events")
    .select("id, amount, created_at, identity_id")
    .eq("type", "award_mint")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(25);
  const awardRows =
    (awardsRaw as Array<{
      id: number;
      amount: number;
      created_at: string;
      identity_id: string;
    }> | null) ?? [];

  // Resolve recipient display names in a single fetch.
  const recipientIds = Array.from(new Set(awardRows.map((a) => a.identity_id)));
  const displayNamesById = new Map<string, string>();
  if (recipientIds.length > 0) {
    const { data: namesData } = await admin
      .from("gs_identities")
      .select("id, display_name")
      .in("id", recipientIds);
    for (const r of (namesData as Array<{ id: string; display_name: string | null }> | null) ?? []) {
      displayNamesById.set(r.id, r.display_name ?? "—");
    }
  }
  const awards: AwardRow[] = awardRows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    created_at: r.created_at,
    recipient_display_name: displayNamesById.get(r.identity_id) ?? null,
  }));

  // Bounties (any status) for this community, latest 25.
  const { data: bountiesRaw } = await admin
    .from("gs_bounties")
    .select(
      "id, amount, description, status, settled_to, created_at, settled_at, cancelled_at, resolved_value",
    )
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(25);
  const bountyRows =
    (bountiesRaw as Array<{
      id: string;
      amount: number;
      description: string;
      status: "open" | "settled" | "cancelled";
      settled_to: string | null;
      created_at: string;
      settled_at: string | null;
      cancelled_at: string | null;
      resolved_value: string | null;
    }> | null) ?? [];

  const settledIds = Array.from(
    new Set(bountyRows.map((b) => b.settled_to).filter((id): id is string => !!id)),
  );
  const settledNamesById = new Map<string, string>();
  if (settledIds.length > 0) {
    const { data: namesData } = await admin
      .from("gs_identities")
      .select("id, display_name")
      .in("id", settledIds);
    for (const r of (namesData as Array<{ id: string; display_name: string | null }> | null) ?? []) {
      settledNamesById.set(r.id, r.display_name ?? "—");
    }
  }
  const bounties: BountyHistoryRow[] = bountyRows.map((b) => ({
    id: b.id,
    amount: Number(b.amount),
    description: b.description,
    status: b.status,
    settled_to_display_name: b.settled_to
      ? settledNamesById.get(b.settled_to) ?? null
      : null,
    created_at: b.created_at,
    settled_at: b.settled_at,
    cancelled_at: b.cancelled_at,
    resolved_value: b.resolved_value,
  }));

  return { awards, bounties };
}

export async function SessionMarketsTab({ streamerSlug, ownerUserId }: Props) {
  const history = await loadHistory(ownerUserId);

  return (
    <>
      <MarketsAdminPanel streamerSlug={streamerSlug} />

      <section className="hub-markets-history">
        <h2 className="hub-markets-history__heading">History</h2>

        <div className="hub-markets-history__group">
          <h3>Recent awards (last 25)</h3>
          {history.awards.length === 0 ? (
            <p className="hub-markets-history__empty">
              No awards yet. Use <code>!gs award @viewer N</code> in chat or the
              Markets tab admin to mint from your monthly allowance.
            </p>
          ) : (
            <table className="hub-markets-history__table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Amount</th>
                  <th>Recipient</th>
                </tr>
              </thead>
              <tbody>
                {history.awards.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.created_at)}</td>
                    <td>{a.amount.toLocaleString("en-US")}🪙</td>
                    <td>{a.recipient_display_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="hub-markets-history__group">
          <h3>Bounty log (last 25)</h3>
          {history.bounties.length === 0 ? (
            <p className="hub-markets-history__empty">
              No bounties yet. Open one with <code>!gs bounty N description</code>{" "}
              in chat or from the panel above.
            </p>
          ) : (
            <table className="hub-markets-history__table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Awarded to / Resolved value</th>
                </tr>
              </thead>
              <tbody>
                {history.bounties.map((b) => (
                  <tr key={b.id}>
                    <td>{formatDate(b.created_at)}</td>
                    <td>{b.amount.toLocaleString("en-US")}🪙</td>
                    <td>{b.description}</td>
                    <td>{b.status}</td>
                    <td>
                      {b.settled_to_display_name ?? "—"}
                      {b.resolved_value && (
                        <span className="hub-markets-history__hint">
                          {" "}
                          (resolved: {b.resolved_value})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}
