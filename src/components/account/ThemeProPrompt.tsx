"use client";

import { LooksPrompt } from "@/components/billing/LooksOnly";

/** What free accounts see in place of the brand theme, skin and CSS editors (Account › Theme). */
export function ThemeProPrompt() {
  return (
    <LooksPrompt what="Brand themes, skins and custom CSS" from="theme">
      <p>
        Put your own colors on your profile, your live page and your stream overlay, give your profile a background
        and card style, and fine-tune it with CSS. Anything you saved before stays put and comes back when your looks do.
      </p>
    </LooksPrompt>
  );
}
