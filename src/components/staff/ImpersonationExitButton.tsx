"use client";

/**
 * Inline "exit" link inside the impersonation banner. Clicking clears the
 * impersonation cookies and reloads. Client component because it dispatches
 * a fetch + reload — the rest of the banner is server-rendered.
 */

import { useState } from "react";

export function ImpersonationExitButton() {
  const [working, setWorking] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setWorking(true);
        try {
          await fetch("/api/staff/impersonate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ option: "default" }),
          });
        } finally {
          window.location.reload();
        }
      }}
      disabled={working}
      className="staff-impersonation-banner__exit"
    >
      {working ? "Exiting…" : "exit"}
    </button>
  );
}
