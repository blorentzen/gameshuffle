"use client";

/**
 * Platform ▸ People ▸ Time trials (round 2): the reviewers' queue (clips to check, report tickets) and
 * the time trial reviewers. Reviewers who aren't staff use the same queue at /time-trials/review.
 */

import { AdminScreen } from "@/components/account/admin/AdminKit";
import { TtReviewQueue } from "@/components/timeTrials/TtReviewQueue";
import "@/styles/time-trials.css";

export function PlatformTimeTrialsTab() {
  return (
    <AdminScreen title="Time trials" intro="Check clips so times show as Verified, decide reported times, and choose who else can review.">
      <TtReviewQueue />
    </AdminScreen>
  );
}
