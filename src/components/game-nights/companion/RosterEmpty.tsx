/**
 * Shown by a companion tool when the shared roster is empty — the player list
 * lives in the RosterBar above, so this just points people up to it.
 */
export function RosterEmpty({ children }: { children?: React.ReactNode }) {
  return (
    <div className="account-card bgn-sheet__emptyprompt">
      <p>{children ?? "Add players above to start. Everyone you add is shared across every score sheet and tool."}</p>
    </div>
  );
}
