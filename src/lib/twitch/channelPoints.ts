/**
 * Channel point reward + redemption helpers.
 *
 * Reward management requires the broadcaster's user access token with
 * `channel:manage:redemptions` (granted in our OAuth bundle). The
 * helpers here go through `withUserTokenRetry` so an expired token
 * refreshes transparently mid-call.
 *
 * Affiliate or Partner status is required by Twitch for any of this
 * to work. Calls against a non-affiliate channel will fail with 403.
 */

import { withUserTokenRetry } from "./userToken";

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";

function clientId(): string {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error("TWITCH_CLIENT_ID env var is not set");
  return id;
}

export interface ChannelPointReward {
  id: string;
  title: string;
  cost: number;
  is_enabled: boolean;
  prompt: string | null;
  background_color: string | null;
}

export interface CreateRewardArgs {
  userId: string;
  broadcasterTwitchId: string;
  title: string;
  cost: number;
  prompt?: string;
}

/**
 * List rewards in this channel that are manageable by THIS app's client_id.
 * `only_manageable_rewards=true` filters to rewards we (or another app
 * with the same client_id) created — Twitch refuses PATCH/DELETE on
 * rewards owned by a different client.
 *
 * Used by the find-or-create flow to adopt an existing GameShuffle
 * reward instead of failing with `CREATE_CUSTOM_REWARD_DUPLICATE_REWARD`.
 */
export async function listManageableRewards(args: {
  userId: string;
  broadcasterTwitchId: string;
}): Promise<ChannelPointReward[]> {
  const url = new URL(`${TWITCH_HELIX_BASE}/channel_points/custom_rewards`);
  url.searchParams.set("broadcaster_id", args.broadcasterTwitchId);
  url.searchParams.set("only_manageable_rewards", "true");

  const res = await withUserTokenRetry(args.userId, (token) =>
    fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
      },
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix list rewards failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: ChannelPointReward[] };
  return data.data ?? [];
}

export interface UpdateRewardArgs {
  userId: string;
  broadcasterTwitchId: string;
  rewardId: string;
  /** Any subset of fields supported by the Helix PATCH endpoint. */
  patch: Partial<{
    title: string;
    cost: number;
    prompt: string;
    is_enabled: boolean;
    is_paused: boolean;
    background_color: string;
  }>;
}

/**
 * Update an existing reward in place via Helix PATCH. Avoids the
 * delete+create cycle that hits CREATE_CUSTOM_REWARD_DUPLICATE_REWARD
 * when another reward with the same title still lingers.
 */
export async function updateCustomReward(
  args: UpdateRewardArgs
): Promise<ChannelPointReward> {
  const url = new URL(`${TWITCH_HELIX_BASE}/channel_points/custom_rewards`);
  url.searchParams.set("broadcaster_id", args.broadcasterTwitchId);
  url.searchParams.set("id", args.rewardId);

  const res = await withUserTokenRetry(args.userId, (token) =>
    fetch(url.toString(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.patch),
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix update reward failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: ChannelPointReward[] };
  if (!data.data?.[0]) throw new Error("Helix update reward returned no row");
  return data.data[0];
}

export async function createCustomReward(
  args: CreateRewardArgs
): Promise<ChannelPointReward> {
  const url = new URL(`${TWITCH_HELIX_BASE}/channel_points/custom_rewards`);
  url.searchParams.set("broadcaster_id", args.broadcasterTwitchId);

  const res = await withUserTokenRetry(args.userId, (token) =>
    fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: args.title,
        cost: args.cost,
        prompt: args.prompt,
        is_user_input_required: false,
        is_enabled: true,
        background_color: "#0E75C1",
      }),
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix create reward failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: ChannelPointReward[] };
  if (!data.data?.[0]) throw new Error("Helix create reward returned no row");
  return data.data[0];
}

export async function deleteCustomReward(args: {
  userId: string;
  broadcasterTwitchId: string;
  rewardId: string;
}): Promise<void> {
  const url = new URL(`${TWITCH_HELIX_BASE}/channel_points/custom_rewards`);
  url.searchParams.set("broadcaster_id", args.broadcasterTwitchId);
  url.searchParams.set("id", args.rewardId);

  const res = await withUserTokenRetry(args.userId, (token) =>
    fetch(url.toString(), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
      },
    })
  );

  // 404 = already gone; treat as success
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Helix delete reward failed (${res.status}): ${body}`);
  }
}

export type RedemptionStatus = "FULFILLED" | "CANCELED";

export async function updateRedemptionStatus(args: {
  userId: string;
  broadcasterTwitchId: string;
  rewardId: string;
  redemptionId: string;
  status: RedemptionStatus;
}): Promise<void> {
  const url = new URL(`${TWITCH_HELIX_BASE}/channel_points/custom_rewards/redemptions`);
  url.searchParams.set("broadcaster_id", args.broadcasterTwitchId);
  url.searchParams.set("reward_id", args.rewardId);
  url.searchParams.set("id", args.redemptionId);

  const res = await withUserTokenRetry(args.userId, (token) =>
    fetch(url.toString(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: args.status }),
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix update redemption status failed (${res.status}): ${body}`);
  }
}
