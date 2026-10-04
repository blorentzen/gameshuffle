/**
 * Our Poké Ball drawing (SVG), used by the TCG companion's coin and as the
 * empty-slot art on the Pokémon randomizers (like Mario Kart's item box).
 * Classic proportions on a 100-unit box: a 4-unit outline, an 8-unit band and
 * a button a third of the ball wide (black ring, white ring, small inner face).
 * `great` is the Great Ball: blue top with the two red side patches.
 */

export function PokeBall({ variant = "poke", className }: { variant?: "poke" | "great"; className?: string }) {
  const top = variant === "great" ? "#2563c9" : "#e3262d";
  const topDark = variant === "great" ? "#1a4791" : "#b51b21";
  const id = `pb-${variant}`;
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={topDark} />
        </linearGradient>
        <linearGradient id={`${id}-bottom`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe2ea" />
        </linearGradient>
      </defs>
      {/* Halves */}
      <path d="M4 50a46 46 0 0 1 92 0z" fill={`url(#${id}-top)`} />
      <path d="M4 50a46 46 0 0 0 92 0z" fill={`url(#${id}-bottom)`} />
      {variant === "great" && (
        <>
          <path d="M14 24c6-7 12-11 19-14l-3 18c-5 3-9 7-12 12z" fill="#e3262d" />
          <path d="M86 24c-6-7-12-11-19-14l3 18c5 3 9 7 12 12z" fill="#e3262d" />
        </>
      )}
      {/* Shine on the top half */}
      <ellipse cx="33" cy="25" rx="11" ry="6" fill="#ffffff" opacity="0.35" transform="rotate(-28 33 25)" />
      {/* Band */}
      <rect x="4" y="46" width="92" height="8" fill="#1b1b1f" />
      {/* Outline */}
      <circle cx="50" cy="50" r="46" fill="none" stroke="#1b1b1f" strokeWidth="4" />
      {/* Button: black ring, white ring, inner face */}
      <circle cx="50" cy="50" r="17" fill="#1b1b1f" />
      <circle cx="50" cy="50" r="12" fill="#ffffff" />
      <circle cx="50" cy="50" r="7.5" fill="#f4f5f8" stroke="#c9ccd6" strokeWidth="1.5" />
    </svg>
  );
}
