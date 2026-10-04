/**
 * Shared text filter (client-safe). Catches profanity, slurs and sexual terms,
 * including look-alike spellings ("sh1t"), using the `obscenity` English
 * dataset. Used where short public-facing text is typed in (Chat Brain answers
 * and prompt suggestions first). A pass here doesn't mean publishable: anything
 * that ends up public still goes through review.
 */

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

let matcher: RegExpMatcher | null = null;
function get(): RegExpMatcher {
  matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  return matcher;
}

/** True when the text contains blocked language. */
export function isBlockedText(text: string): boolean {
  return !!text && get().hasMatch(text);
}
