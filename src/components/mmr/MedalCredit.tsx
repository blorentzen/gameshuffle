/**
 * The credit for MKCentral's division medals (2026-10-30): on the website's own pages that show them
 * (lounge pages, the hub, the MMR card page, profiles), never on overlays or anything shared (Britton:
 * one click away is enough). A plain paragraph so it takes the footer's type.
 */
export function MedalCredit({ className }: { className?: string }) {
  return (
    <p className={className}>
      Division medals by <a href="https://mkcentral.com" target="_blank" rel="noopener noreferrer">MKCentral</a>.
    </p>
  );
}
