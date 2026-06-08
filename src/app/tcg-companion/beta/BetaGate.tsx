"use client";

/**
 * Beta passcode form.
 *
 * The form's only job is to collect a string, POST it via the server
 * action, and on success set localStorage + send the tester to the
 * Companion. The passcode is never displayed back, logged, or
 * persisted — it leaves the client the instant the user clicks Submit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyBetaPasscodeAction } from "./actions";

const BETA_ACCESS_KEY = "gs_companion_beta_access";

export function BetaGate() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const submitted = passcode;
    startTransition(async () => {
      const result = await verifyBetaPasscodeAction(submitted);
      if (!result.ok) {
        setError(
          result.reason === "beta_off"
            ? "Beta access is closed."
            : "That's not it. Try again.",
        );
        return;
      }
      try {
        window.localStorage.setItem(BETA_ACCESS_KEY, "1");
      } catch {
        // localStorage can throw in private-mode + storage-disabled
        // contexts. The next page will fall back to the regular guest
        // chooser if so — beta testers may need to re-enter, which is
        // an acceptable downgrade for a temporary scaffold.
      }
      router.replace("/tcg-companion");
    });
  };

  return (
    <div className="companion-beta">
      <div className="companion-beta__card">
        <h1 className="companion-beta__title">
          GameShuffle TCG Companion — Early Beta
        </h1>
        <p className="companion-beta__lede">Thanks for helping us shape this. A few things to know:</p>
        <ul className="companion-beta__points">
          <li>This is early. Things will break. That&apos;s the point — tell us when they do.</li>
          <li>Games don&apos;t save yet. If you refresh, you&apos;ll start over. (Saving is coming.)</li>
          <li>Found something rough? Hit the feedback button anytime.</li>
        </ul>

        <form className="companion-beta__form" onSubmit={handleSubmit}>
          <label className="companion-beta__field">
            <span>Passphrase</span>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
          </label>
          {error && (
            <p className="companion-beta__error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="companion-beta__btn"
            disabled={pending || passcode.length === 0}
          >
            {pending ? "Checking…" : "Let's go"}
          </button>
        </form>
      </div>
    </div>
  );
}
