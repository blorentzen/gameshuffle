/**
 * Banana icon — vendored from Tabler Icons v3.43 (upstream
 * `icons/outline/banana.svg`).
 *
 * The version of `@tabler/icons-react` currently pinned by our CDS
 * dependency is 3.41.0, which predates the banana glyph. Rather than
 * force-bumping the whole tabler package (and risking peer-dep drift
 * with CDS), we inline the official SVG path here as a tiny React
 * component matching the same IconProps signature. Drop this file +
 * the related export once CDS ships a tabler version >= 3.43.
 *
 * Source: https://github.com/tabler/tabler-icons/blob/main/icons/outline/banana.svg
 * License: MIT (same as Tabler).
 */

import type { IconProps } from "@tabler/icons-react";

export function IconBanana(props: IconProps) {
  const {
    size = 24,
    color = "currentColor",
    stroke = 2,
    className,
    ...rest
  } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M20 6v-2a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v2a9.09 9.09 0 0 1 -4 8.08c-2 1.31 -5 1.57 -7 1.59a2 2 0 0 0 -2 2a2 2 0 0 0 1.16 1.81c2.69 1.2 9.46 3.44 14.35 -1.66c4.49 -4.74 1.49 -11.82 1.49 -11.82" />
    </svg>
  );
}
