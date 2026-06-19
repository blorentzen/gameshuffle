/**
 * TokenAllowanceBadge — server-side data fetcher for the always-on
 * token-allowance pill in the hub layout's top chrome.
 *
 * Fetches the streamer's current-month allowance row (or falls back
 * to the configured default ceiling when no row exists yet) and
 * hands off to the client `TokenAllowanceChip` for the clickable +
 * modal behavior.
 *
 * Graceful degradation: the chip always renders something so the
 * streamer can see their disbursement budget at a glance — even on
 * the first day of the month with no awards yet, even on a fresh
 * account that hasn't seeded a `gs_streamer_allowance` row.
 */

import "server-only";
import {
  defaultCeiling,
  getAllowanceForOwner,
} from "@/lib/economy/awards";
import { TokenAllowanceChip } from "./TokenAllowanceChip";

interface Props {
  ownerUserId: string;
}

export async function TokenAllowanceBadge({ ownerUserId }: Props) {
  const [allowance, fallback] = await Promise.all([
    getAllowanceForOwner(ownerUserId),
    defaultCeiling(),
  ]);
  const ceiling = allowance?.ceiling ?? fallback;
  const consumed = allowance?.consumed ?? 0;
  const remaining = allowance?.remaining ?? ceiling;
  const periodMonth = allowance?.periodMonth ?? null;
  const seeded = !!allowance;

  return (
    <TokenAllowanceChip
      ceiling={ceiling}
      consumed={consumed}
      remaining={remaining}
      periodMonth={periodMonth}
      seeded={seeded}
    />
  );
}
