"use client";

import { useId, type ReactNode } from "react";

/**
 * One layout for every free tool with settings (approved 2026-10-20, item 9):
 * the toy and its main button on the left, its settings on the right, in one
 * panel. Phones stack: toy first, settings below. Boards (tier list, bingo)
 * keep their own full-width layout.
 */
export function ToolLayout({ stage, settings, className = "", settingsLabel = "Settings" }: {
  stage: ReactNode;
  settings: ReactNode;
  className?: string;
  /** Names the settings column for screen readers. */
  settingsLabel?: string;
}) {
  return (
    <div className={`tool-layout${className ? ` ${className}` : ""}`}>
      <div className="tool-layout__stage">{stage}</div>
      <section className="tool-layout__settings" aria-label={settingsLabel}>{settings}</section>
    </div>
  );
}

/** One setting in the settings column: a short label over its control. */
export function ToolSetting({ label, children, note, id }: { label: string; children: ReactNode; note?: ReactNode; id?: string }) {
  const auto = useId();
  const labelId = id ?? `${auto}-label`;
  return (
    <div className="tool-setting" role="group" aria-labelledby={labelId}>
      <span className="tool-setting__label" id={labelId}>{label}</span>
      {children}
      {note ? <p className="tool-setting__note">{note}</p> : null}
    </div>
  );
}
