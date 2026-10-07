"use client";

import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";

/** What free accounts see in place of the brand theme, skin and CSS editors (Account › Theme). */
export function ThemeProPrompt() {
  return (
    <ProTrialPrompt title="Brand themes, skins and custom CSS are part of GS Pro" from="theme">
      <p>
        Put your own colours on your profile, your live page and your stream overlay, give your profile a background
        and card style, and fine-tune it with CSS. Anything you saved before stays put and comes back when you start GS Pro.
      </p>
    </ProTrialPrompt>
  );
}
