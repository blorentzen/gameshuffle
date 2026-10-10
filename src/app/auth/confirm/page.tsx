/**
 * /auth/confirm: where our auth emails land (reset password, confirm signup,
 * magic link, invite, email change), once the Supabase email templates point
 * here with a token hash:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}
 *
 * (type = recovery, signup, magiclink, invite or email_change; `next` last.)
 *
 * Why not /auth/callback: that exchanges a PKCE code, which only works in the
 * browser that asked for the email, so a reset link opened on a phone failed.
 * A token hash works on any device. The link opens this page and the button
 * does the verifying (POST /auth/confirm/verify), so an email security
 * scanner that opens links on its own can't use the link up first.
 */

import type { Metadata } from "next";
import { Button, Container } from "@empac/cascadeds";

export const metadata: Metadata = { title: "Confirm", robots: { index: false, follow: false } };

const COPY: Record<string, { title: string; lede: string; button: string }> = {
  recovery: { title: "Reset your password", lede: "Continue to choose a new password for your GameShuffle account.", button: "Choose a new password" },
  signup: { title: "Confirm your email", lede: "One tap and your GameShuffle account is ready.", button: "Confirm my email" },
  email: { title: "Sign in to GameShuffle", lede: "Continue to finish signing in.", button: "Sign me in" },
  magiclink: { title: "Sign in to GameShuffle", lede: "Continue to finish signing in.", button: "Sign me in" },
  invite: { title: "Accept your invite", lede: "Continue to set up your GameShuffle account.", button: "Accept invite" },
  email_change: { title: "Confirm your new email", lede: "Continue to start using this address for GameShuffle.", button: "Confirm new email" },
};

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const tokenHash = one("token_hash");
  const type = one("type");
  const copy = COPY[type];

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page">
          {copy && tokenHash ? (
            <>
              <h1 className="auth-page__title">{copy.title}</h1>
              <p className="auth-page__lede">{copy.lede}</p>
              <form method="post" action="/auth/confirm/verify" className="auth-page__form">
                <input type="hidden" name="token_hash" value={tokenHash} />
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="next" value={one("next")} />
                <Button type="submit" variant="primary" fullWidth>{copy.button}</Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="auth-page__title">This link isn&apos;t complete</h1>
              <p className="auth-page__lede">Part of the link may have been cut off. Open the newest email from us again, or start over.</p>
              <p className="auth-page__switch"><a href="/forgot-password">Reset your password</a> · <a href="/login">Sign in</a></p>
            </>
          )}
        </div>
      </Container>
    </main>
  );
}
