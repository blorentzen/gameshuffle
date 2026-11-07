"use client";

/**
 * The strip's button. Clears the View as cookies and reloads; with `back`
 * (a dev test persona account) it signs the staff account back in instead.
 * Client component because it dispatches a fetch + reload — the rest of the
 * banner is server-rendered.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";

export function ImpersonationExitButton({ back = false }: { back?: boolean }) {
  const [working, setWorking] = useState(false);
  return (
    <Button
      variant="ghost"
      size="small"
      loading={working}
      onClick={async () => {
        setWorking(true);
        try {
          await fetch(back ? "/api/staff/persona-account" : "/api/staff/impersonate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(back ? { back: true } : { option: "default" }),
          });
        } finally {
          window.location.assign(back ? "/account" : window.location.href);
        }
      }}
      className="staff-impersonation-banner__exit"
    >
      {back ? "Back to my account" : "Exit"}
    </Button>
  );
}
