import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

/**
 * The site's one arrow link (design round 3, Britton's picks 2026-10-20): the
 * label and a real arrow icon (never a typed "→"). Hover and keyboard focus
 * slide the arrow 4px right and underline the label; with reduced motion only
 * the underline shows. Styles in globals.css (`.arrow-link`). Colour is the
 * brand ink unless the class you pass sets its own. Server-safe.
 *
 * For a whole card that is one link, put `ARROW_HOST_CLASS` on the card's
 * link and an `<ArrowCue>` inside it: the cue's arrow moves when the card is
 * hovered or focused.
 */
export const ARROW_ICON_CLASS = "arrow-link__icon";
export const ARROW_LABEL_CLASS = "arrow-link__label";
export const ARROW_HOST_CLASS = "arrow-host";

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;

export function ArrowLink({ href, children, className, external = false, plain = false, ...rest }: AnchorProps & {
  href: string;
  children: ReactNode;
  className?: string;
  /** Another site: opens in a new tab. */
  external?: boolean;
  /** A plain `<a>` instead of Next's Link (a hash on the same page, an API download). */
  plain?: boolean;
}) {
  const cls = `arrow-link${className ? ` ${className}` : ""}`;
  const inner = (
    <>
      <span className={ARROW_LABEL_CLASS}>{children}</span>
      <IconArrowRight className={ARROW_ICON_CLASS} aria-hidden stroke={2} />
    </>
  );
  if (external) {
    return <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>{inner}</a>;
  }
  if (plain) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <Link href={href} className={cls} {...rest}>{inner}</Link>;
}

/**
 * The label and arrow without a link of their own, for inside a link that
 * covers a whole card (give that link `ARROW_HOST_CLASS`).
 */
export function ArrowCue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`arrow-link${className ? ` ${className}` : ""}`}>
      <span className={ARROW_LABEL_CLASS}>{children}</span>
      <IconArrowRight className={ARROW_ICON_CLASS} aria-hidden stroke={2} />
    </span>
  );
}
