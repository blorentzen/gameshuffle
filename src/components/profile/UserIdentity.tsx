"use client";

/**
 * <UserIdentity> (Spec 1 §3.1) — turns a rendered username/avatar into a door
 * to the profile card. Desktop = hover-intent popover; touch = tap → bottom
 * sheet. Same <ProfileCard> content either way. Prefetches on hover/focus.
 *
 * The call site passes the name/avatar it already has (so the trigger needs no
 * fetch to render); `userId` drives the card. `disableCard` renders a plain,
 * non-interactive label for dense contexts.
 */

import { useRef, useState, type ReactNode } from "react";
import { Popover } from "@empac/cascadeds";
import { UserAvatar, type UserAvatarUser } from "@/components/UserAvatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { prefetchProfileCard } from "@/lib/profile/useProfileCard";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { ProfileCard } from "./ProfileCard";

const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

interface Props {
  userId: string;
  name: string;
  avatar?: UserAvatarUser | null;
  variant?: "name" | "avatar" | "nameAvatar";
  /** Avatar pixel size for the avatar variants. */
  size?: number;
  /** Dense contexts (e.g. tight tables) — render a plain label, no card. */
  disableCard?: boolean;
  className?: string;
  /** Custom trigger content (e.g. a tile/row). When set, `variant` is ignored
   *  and the button is layout-neutral so the child controls its own layout. */
  children?: ReactNode;
}

export function UserIdentity({
  userId,
  name,
  avatar,
  variant = "name",
  size = 24,
  disableCard = false,
  className,
  children,
}: Props) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const inner = children ?? (
    <>
      {(variant === "avatar" || variant === "nameAvatar") && avatar && (
        <UserAvatar user={avatar} size={size} className="user-identity__avatar" />
      )}
      {(variant === "name" || variant === "nameAvatar") && (
        <span className="user-identity__name">{name}</span>
      )}
    </>
  );

  // `--custom` is layout-neutral (no forced flex) so children keep their layout.
  const variantClass = children ? "user-identity--custom" : `user-identity--${variant}`;

  if (disableCard) {
    return <span className={`user-identity user-identity--plain ${className ?? ""}`}>{inner}</span>;
  }

  const trigger = (
    <button
      type="button"
      className={`user-identity ${variantClass} ${className ?? ""}`}
      aria-label={`${name} — open profile card`}
      aria-haspopup="dialog"
      onFocus={() => prefetchProfileCard(userId)}
      onMouseEnter={
        isDesktop
          ? () => {
              prefetchProfileCard(userId);
              clearTimers();
              openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY);
            }
          : undefined
      }
      onMouseLeave={isDesktop ? scheduleClose : undefined}
      onClick={!isDesktop ? () => setOpen(true) : undefined}
    >
      {inner}
    </button>
  );

  // Touch: tap opens a bottom sheet.
  if (!isDesktop) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)}>
          <ProfileCard userId={userId} onClose={() => setOpen(false)} />
        </BottomSheet>
      </>
    );
  }

  // Desktop: hover/click popover. Keep it open while the pointer is over the card.
  return (
    <Popover
      trigger={trigger}
      position="bottom"
      open={open}
      onOpenChange={setOpen}
      closeOnClickOutside
      closeOnEscape
      className="user-identity-popover"
    >
      <div onMouseEnter={clearTimers} onMouseLeave={scheduleClose}>
        <ProfileCard userId={userId} onClose={() => setOpen(false)} />
      </div>
    </Popover>
  );
}
