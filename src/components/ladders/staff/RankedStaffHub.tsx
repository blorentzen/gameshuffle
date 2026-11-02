"use client";

/**
 * A lounge's staff page (name, web and docs picks 2026-11-01, https://claude.ai/artifact/EqB2cEaG1D2FLphwWVzaNP,
 * picks 3A to 6A): Tables, Players, Penalties, Seasons, Settings and Log as CascadeDS Tabs with the tab in the address
 * (?tab=). Everything here is the same action the Discord buttons run, and shows on the Discord card too. The page
 * checks back every 30 seconds while it's open, so a table verified in Discord leaves the list here.
 */

import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@empac/cascadeds";
import { StaffTables } from "./StaffTables";
import { StaffPlayers, StaffPenalties } from "./StaffPeople";
import { StaffSeasons } from "./StaffSeasons";
import { StaffSettings } from "./StaffSettings";
import { StaffLog } from "./StaffLog";
import { STAFF_TABS, type Act, type HubData, type StaffTab } from "./types";


export function RankedStaffHub({ ladderId, initialTab }: { ladderId: string; initialTab: StaffTab }) {
  const [data, setData] = useState<HubData | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<StaffTab>(initialTab);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ranked/${ladderId}/staff`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: HubData) => { if (alive) { setData(j); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [ladderId, version]);

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  const act: Act = useCallback(async (body) => {
    const res = await fetch(`/api/ranked/${ladderId}/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) ?? {};
    return { ok: !!res?.ok, ...json };
  }, [ladderId]);

  const select = (id: string) => {
    const next = (STAFF_TABS as readonly string[]).includes(id) ? (id as StaffTab) : "tables";
    setTab(next);
    const sp = new URLSearchParams(window.location.search);
    if (next === "tables") sp.delete("tab"); else sp.set("tab", next);
    const q = sp.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };

  if (!data) return <p className="ladder-note" role="status">{failed ? "The staff page couldn't load. Refresh to try again." : "Loading…"}</p>;

  const open = (kinds: string[]) => data.requests.filter((r) => kinds.includes(r.kind)).length;
  const count = (n: number) => (n ? n : undefined);
  const shared = { data, act, reload, ladderId };
  return (
    <div className="ranked-staff">
      <Tabs
        variant="underline"
        activeTab={tab}
        onChange={select}
        tabs={[
          { id: "tables", label: "Tables", badge: count(data.tables.waiting.length), content: <StaffTables {...shared} /> },
          { id: "players", label: "Players", badge: count(open(["join", "name", "appeal"])), content: <StaffPlayers {...shared} /> },
          { id: "penalties", label: "Penalties", badge: count(open(["penalty", "reduce"])), content: <StaffPenalties {...shared} /> },
          { id: "seasons", label: "Seasons", content: <StaffSeasons {...shared} /> },
          { id: "settings", label: "Settings", content: <StaffSettings {...shared} /> },
          { id: "log", label: "Log", content: <StaffLog {...shared} /> },
        ]}
      />
    </div>
  );
}

export interface StaffTabProps { data: HubData; act: Act; reload: () => void; ladderId: string }
