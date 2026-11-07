/**
 * A number that rolls from where it was at your last visit to now (home look picks 2026-11-05, 7A), drawn on the
 * server: each digit is a reel that starts on the old digit and turns to the new one with CSS alone, so the first
 * paint already holds both and nothing flashes. Same length only (999 to 1,002 just shows 1,002); reduced motion,
 * no old number or no change shows the number still. Screen readers get the number once.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

export function RollNum({ value, from, className }: { value: number; from: number | null; className?: string }) {
  const to = fmt(value);
  const was = from == null ? null : fmt(from);
  if (was == null || was === to || was.length !== to.length) return <span className={className}>{to}</span>;
  return (
    <span className={`roll-num${className ? ` ${className}` : ""}`}>
      <span className="sr-only">{to}</span>
      <span className="roll-num__reels" aria-hidden="true">
        {[...to].map((ch, i) => {
          const old = was[i];
          if (!/\d/.test(ch) || !/\d/.test(old)) return <span key={i} className="roll-num__char">{ch}</span>;
          return (
            <span key={i} className="roll-num__reel" style={{ "--f": old, "--t": ch, "--d": `${(to.length - i) * 60}ms` } as React.CSSProperties}>
              <span className="roll-num__strip">{"0123456789".split("").map((d) => <span key={d}>{d}</span>)}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
