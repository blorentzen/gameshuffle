"use client";

/**
 * Settings ▸ Privacy: "Show me on the Daily leaderboards" (src/lib/daily/boards.ts,
 * /api/account/daily-boards). On by default; off keeps the account's name off
 * every Daily board while its games still earn tokens. Hidden until the boards
 * exist (daily-boards-m1); a staff hide shows as a note instead of a switch.
 * Below it, "Show me in winners videos" (the morning top 5 post, src/lib/daily/
 * winners.ts): off, you appear as "A player". Hidden until daily-winners-m1.
 */

import { useEffect, useState } from "react";
import { Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function DailyBoardsSwitch() {
  const toast = useToast();
  const [state, setState] = useState<{ ready: boolean; hidden: boolean; byStaff: boolean; video: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/account/daily-boards").then((r) => (r.ok ? r.json() : null)).then((s) => { if (alive && s) setState(s); }).catch(() => { /* stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!state?.ready) return null;
  if (state.byStaff) return <p className="admin-field__help">Your name has been taken off the Daily leaderboards by our team. Your games still count and earn tokens.</p>;

  const save = async (body: { hidden: boolean } | { video: boolean }) => {
    setBusy(true);
    const res = await fetch("/api/account/daily-boards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setState({ ...state, ...body }); toast.success("Saved"); }
    else toast.error("Couldn't save that. Try again.");
  };

  return (
    <>
      <Switch
        checked={!state.hidden}
        disabled={busy}
        onChange={(e) => void save({ hidden: !e.target.checked })}
        label="Show me on the Daily leaderboards"
        helperText="Your name and points on the Daily Shuffle and Daily Dex boards. Off, your games still count for your streak and earn tokens."
      />
      {state.video != null && !state.hidden && (
        <Switch
          checked={state.video}
          disabled={busy}
          onChange={(e) => void save({ video: e.target.checked })}
          label="Show me in winners videos"
          helperText={"Each morning GameShuffle posts yesterday's top 5 on its social accounts. Off, you appear there as \u201cA player\u201d."}
        />
      )}
    </>
  );
}
