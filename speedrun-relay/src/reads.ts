// Reading the run and the timer from LiveSplit One. Requests are sent together and answered in order, so a whole
// batch costs one round trip.

import { LsoClient, type LsoReply } from "./lso";
import type { Observation, Phase, Segment, Snap } from "./state";
import { reachedOf } from "./state";
import { parseTime } from "./time";

export const MAX_SEGMENTS = 500;
const NAME_BATCH = 16;

const PHASES: Record<string, Phase> = { NotRunning: "idle", Running: "running", Paused: "paused", Ended: "ended" };

function timeOf(reply: LsoReply): number | null {
  return reply.ok ? parseTime(reply.value) : null;
}

/** Split names, PB splits and Best Segments, walking names by index until LiveSplit One says there are no more. */
export async function readRun(c: LsoClient): Promise<Segment[]> {
  const names: string[] = [];
  for (let from = 0; from < MAX_SEGMENTS; from += NAME_BATCH) {
    const batch = await Promise.all(
      Array.from({ length: NAME_BATCH }, (_, k) => c.request({ command: "getSegmentName", index: from + k })),
    );
    const firstMissing = batch.findIndex((r) => !r.ok || typeof r.value !== "string");
    for (const r of firstMissing < 0 ? batch : batch.slice(0, firstMissing)) names.push((r as { value: string }).value);
    if (firstMissing >= 0) break;
  }
  const times = await Promise.all(
    names.flatMap((_, index) => [
      c.request({ command: "getComparisonTime", index, comparison: "Personal Best" }),
      c.request({ command: "getComparisonTime", index, comparison: "Best Segments" }),
    ]),
  );
  return names.map((name, i) => ({ name, pbMs: timeOf(times[2 * i]), bestMs: timeOf(times[2 * i + 1]) }));
}

/** getCurrentState + getCurrentTime, plus any extra reads sent in between (still one round trip). */
export async function readSnap(c: LsoClient, extra: { command: string; [k: string]: unknown }[] = []): Promise<{ snap: Snap; extra: LsoReply[] }> {
  const all = await Promise.all([
    c.request({ command: "getCurrentState" }),
    ...extra.map((e) => c.request(e)),
    c.request({ command: "getCurrentTime" }),
  ]);
  const state = all[0];
  if (!state.ok) throw new Error(`getCurrentState failed: ${state.code}`);
  const v = state.value as { state: string; index?: unknown };
  const phase = PHASES[v.state] ?? "idle";
  const index = typeof v.index === "number" ? v.index : null;
  let timeMs = timeOf(all[all.length - 1]);
  // Game Time reads null until it is initialized; fall back to Real Time.
  if (timeMs == null) timeMs = timeOf(await c.request({ command: "getCurrentTime", timingMethod: "RealTime" })) ?? 0;
  return { snap: { phase, index, timeMs }, extra: all.slice(1, -1) };
}

export async function readTimes(c: LsoClient, indexes: number[]): Promise<Map<number, number | null>> {
  const replies = await Promise.all(indexes.map((index) => c.request({ command: "getCurrentRunSplitTime", index })));
  return new Map(indexes.map((index, k) => [index, timeOf(replies[k])]));
}

/** Split times for every index reached so far, as an array. */
export async function readReached(c: LsoClient, snap: Snap, n: number): Promise<(number | null)[]> {
  const reached = reachedOf(snap, n);
  const map = await readTimes(c, Array.from({ length: reached }, (_, i) => i));
  return Array.from({ length: reached }, (_, i) => map.get(i) ?? null);
}

export async function observe(c: LsoClient): Promise<Observation> {
  const segments = await readRun(c);
  const { snap } = await readSnap(c);
  const times = await readReached(c, snap, segments.length);
  return { segments, snap, times };
}

export { timeOf };
