import { Skeleton } from "@empac/cascadeds";

/**
 * What a card or tab shows while its content loads: a few CDS Skeleton rows
 * shaped like text (a short heading line, body lines), in place of a bare
 * "Loading…" line. Screen readers hear `label` once, politely.
 */
export function LoadingLines({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="loading-lines" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" height={i === 0 ? 18 : 14} width={i === 0 ? "40%" : i === lines - 1 ? "65%" : "100%"} />
      ))}
    </div>
  );
}
