"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { InviteFollowersModal } from "@/components/social/InviteFollowersModal";

/** One-line invite entry point — opens the InviteFollowersModal for a target. */
export function InviteButton({
  kind,
  targetId,
  targetName,
  link,
  label = "Invite followers",
}: {
  kind: "session" | "tournament";
  targetId: string;
  targetName: string;
  link?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="small" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <InviteFollowersModal
          kind={kind}
          targetId={targetId}
          targetName={targetName}
          link={link}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
