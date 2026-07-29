/**
 * Card-grid loading skeleton — shimmering card-shaped placeholders shown while
 * TCG card data is being fetched (search results, collection loads, pickers),
 * so a surface never sits blank and then "randomly populates". Reuses the same
 * `tcg-card-shimmer` animation `CardImage` uses for its own load state.
 *
 * `containerClassName` defaults to `tcg-card-grid` but can be overridden to
 * match a host layout (e.g. the place-piece picker's own grid).
 */
export function CardGridSkeleton({
  count = 6,
  containerClassName = "tcg-card-grid",
}: {
  count?: number;
  containerClassName?: string;
}) {
  return (
    <div className={containerClassName} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tcg-card-skel" />
      ))}
    </div>
  );
}
