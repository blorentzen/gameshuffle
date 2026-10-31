import localFont from "next/font/local";

/**
 * Rubik Black Italic, the MMR card's default font (feedback picks 2026-10-29, M6), self-hosted like the
 * site's own fonts (src/app/layout.tsx) so an OBS source never waits on Google. Variable weight, latin
 * only (18 KB). The card's root carries the class, so `--gs-font-mmr` exists wherever a card is drawn.
 * To update: refetch the latin italic src from fonts.googleapis.com/css2?family=Rubik:ital,wght@1,900.
 */
export const mmrRubik = localFont({
  src: "../../app/fonts/rubik-italic.woff2",
  weight: "300 900",
  style: "italic",
  variable: "--gs-font-mmr",
  display: "swap",
});
