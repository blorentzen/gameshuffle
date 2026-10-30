"use client";

/** Copy the MMR card's OBS link from the hub's strip. */

import { Button } from "@empac/cascadeds";
import { IconCopy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";

export function CmkCopyObs({ token }: { token: string }) {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="small"
      iconBefore={IconCopy}
      onClick={() => {
        const url = `${window.location.origin}/mmr/${token}`;
        navigator.clipboard.writeText(url).then(() => toast.success("OBS link copied")).catch(() => toast.error("Couldn't copy. Open your MMR card to get the link."));
      }}
    >
      Copy OBS link
    </Button>
  );
}
