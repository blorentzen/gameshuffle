"use client";

import { useEffect, useState } from "react";
import { Button, Input, Switch, Textarea } from "@empac/cascadeds";
import { ToolLayout, ToolSetting } from "@/components/tools/ToolLayout";

const KEY = "gs-namepicker";

export function NamePickerTool() {
  const [text, setText] = useState("");
  const [count, setCount] = useState(1);
  const [removeWinners, setRemoveWinners] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setText(raw);
    } catch {
      // Storage refused: start empty.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, text);
    } catch {
      // Not remembered in this browser.
    }
  }, [text]);

  const names = text.split("\n").map((s) => s.trim()).filter(Boolean);

  function pick() {
    if (!names.length) return;
    window.plausible?.("Tool Used", { props: { tool: "name-picker" } });
    const n = Math.max(1, Math.min(count, names.length));
    setPicking(true);
    window.setTimeout(() => {
      const idx = names.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const chosen = idx.slice(0, n);
      setWinners(chosen.map((i) => names[i]));
      if (removeWinners) {
        const drop = new Set(chosen);
        setText(names.filter((_, i) => !drop.has(i)).join("\n"));
      }
      setPicking(false);
    }, 550);
  }

  const stage = (
    <>
      <div className={`picker-tool__stage${winners.length && !picking ? " has-winners" : ""}`} aria-live="polite">
        {picking ? (
          <p className="picker-tool__idle">Picking…</p>
        ) : winners.length > 0 ? (
          <>
            <h2 className="picker-tool__winners-head">{winners.length > 1 ? "Winners" : "Winner"}</h2>
            <ul className="picker-tool__winner-list">
              {winners.map((w, i) => <li key={i} className="picker-tool__winner">{w}</li>)}
            </ul>
          </>
        ) : (
          <p className="picker-tool__idle">{names.length ? "Ready when you are." : "Add names to draw from."}</p>
        )}
      </div>
      <div className="tool-stage__action">
        <Button variant="primary" size="large" fullWidth onClick={pick} disabled={picking || names.length === 0}>
          {picking ? "Picking…" : count > 1 ? `Pick ${count}` : "Pick a winner"}
        </Button>
        <p className="tool-stage__tally">{names.length} {names.length === 1 ? "entry" : "entries"}</p>
      </div>
    </>
  );

  const settings = (
    <>
      <Textarea floatingLabel="Names or entries, one per line" value={text} onChange={(e) => setText(e.target.value)} rows={9} fullWidth />
      <ToolSetting label="Winners">
        <Input
          type="number"
          aria-label="Number of winners"
          min={1}
          max={Math.max(1, names.length)}
          value={String(count)}
          onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          className="picker-tool__num"
        />
      </ToolSetting>
      <Switch label="Remove winners after drawing" checked={removeWinners} onChange={(e) => setRemoveWinners(e.target.checked)} />
    </>
  );

  return <ToolLayout className="picker-tool" stage={stage} settings={settings} settingsLabel="Name picker settings" />;
}
