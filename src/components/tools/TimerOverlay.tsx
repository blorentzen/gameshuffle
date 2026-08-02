"use client";

import { useEffect, useState } from "react";
import { fmtTime } from "./StreamTimerTool";

/** OBS browser-source countdown — counts down `mins` from load; refresh to
 *  restart. Transparent (the page sets body transparent). */
export function TimerOverlay({ mins, label }: { mins: number; label: string }) {
  const [remaining, setRemaining] = useState(mins * 60);

  useEffect(() => {
    const end = Date.now() + mins * 60 * 1000;
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, (end - Date.now()) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [mins]);

  return (
    <div className="timer-overlay">
      <span className="timer-overlay__time">{fmtTime(remaining)}</span>
      {label && <span className="timer-overlay__label">{label}</span>}
    </div>
  );
}
