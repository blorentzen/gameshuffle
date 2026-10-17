"use client";

/**
 * Settings ▸ Privacy: "Show me on the Daily leaderboards" (src/lib/daily/boards.ts,
 * /api/account/daily-boards). On by default; off keeps the account's name off
 * every Daily board while its games still earn tokens. Hidden until the boards
 * exist (daily-boards-m1); a staff hide shows as a note instead of a switch.
 */

import { useEffect, useState } from "react";
import { Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function DailyBoardsSwitch() {
  const toast = useToast();
  const [state, setState] = useState<{ ready: boolean; hidden: boolean; byStaff: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/account/daily-boards").then((r) => (r.ok ? r.json() : null)).then((s) => { if (alive && s) setState(s); }).catch(() => { /* stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!state?.ready) return null;
  if (state.byStaff) return <p className="admin-field__help">Your name has been taken off the Daily leaderboards by our team. Your games still count and earn tokens.</p>;

  const change = async (show: boolean) => {
    setBusy(true);
    const res = await fetch("/api/account/daily-boards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !show }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setState({ ...state, hidden: !show }); toast.success("Saved"); }
    else toast.error("Couldn't save that. Try again.");
  };

  return (
    <Switch
      checked={!state.hidden}
      disabled={busy}
      onChange={(e) => void change(e.target.checked)}
      label="Show me on the Daily leaderboards"
      helperText="Your name and points on the Daily Shuffle and Daily Dex boards. Off, your games still count for your streak and earn tokens."
    />
  );
}
