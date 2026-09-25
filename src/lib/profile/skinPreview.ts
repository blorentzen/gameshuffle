/**
 * Paint a skin onto a live page element, and put it back.
 *
 * The owner editors used to be modals: you picked a background in a dialog
 * that covered the page you were picking it for, saved, and only then found
 * out. Appearance is the one kind of edit you cannot judge from a form, so the
 * drawer applies every change to the real page as you make it.
 *
 * Only custom properties and the background go through here. Those are the
 * whole visual layer on an owner surface (`skinCssVars` + `skinBackground`
 * being what the server writes on the same element), so previewing them needs
 * no second render path that could drift from the real one.
 */

import { skinCssVars, skinBackground, skinBackgroundLayout, hasCustomBackground, type ProfileSkin } from "./skin";

/** Everything needed to undo a preview, captured before the first paint. */
export interface SkinSnapshot {
  inline: string;
  skinned: boolean;
}

export function snapshotSkin(el: HTMLElement): SkinSnapshot {
  return { inline: el.getAttribute("style") ?? "", skinned: el.classList.contains("gs-skinned") };
}

export function restoreSkin(el: HTMLElement, snap: SkinSnapshot) {
  el.setAttribute("style", snap.inline);
  el.classList.toggle("gs-skinned", snap.skinned);
}

/**
 * @param accent The owner's chosen accent, or null to clear the override and
 *   fall back to the brand colour, which is what the server does.
 */
export function previewSkin(
  el: HTMLElement,
  skin: ProfileSkin,
  opts: { brandPrimary?: string | null; accent?: string | null; accentOn?: string | null } = {},
) {
  const vars = skinCssVars(skin, opts.brandPrimary) as Record<string, string>;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);

  // A skin that no longer sets a var must clear the one the last paint left
  // behind, or the page keeps a foreground colour for a background it no
  // longer has.
  for (const k of ["--skin-on", "--skin-on-muted", "--skin-rule", "--skin-plate", "--skin-shadow", "--skin-cta", "--skin-cta-on"]) {
    if (!(k in vars)) el.style.removeProperty(k);
  }

  if (opts.accent) {
    el.style.setProperty("--profile-accent", opts.accent);
    el.style.setProperty("--profile-accent-on", opts.accentOn ?? "#fff");
  } else {
    el.style.removeProperty("--profile-accent");
    el.style.removeProperty("--profile-accent-on");
  }

  const bg = skinBackground(skin);
  el.style.background = bg ?? "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

  // Layout props only mean anything for an image, and have to be cleared when
  // the owner switches away from one.
  const layout = skinBackgroundLayout(skin) as Record<string, string>;
  for (const k of ["backgroundSize", "backgroundPosition", "backgroundAttachment", "backgroundRepeat"]) {
    if (k in layout) el.style.setProperty(kebab(k), layout[k]);
    else el.style.removeProperty(kebab(k));
  }

  el.classList.toggle("gs-skinned", hasCustomBackground(skin));
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
