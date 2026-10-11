import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_LATER_COOKIE } from "@/lib/auth/passwordNudge";
import { ACTIVITY_PATH, isActivityHost, isActivityPath } from "@/lib/activity/hosts";
import { hasPasswordFrom } from "@/lib/auth/passwordRules";

const PROTECTED_ROUTES = ["/account", "/twitch", "/messages", "/comms"];

/** The root layout reads this to decide whether the current request is
 *  a marketing surface (force light) or an app surface (honor theme
 *  cookie). Next.js server components have no first-class API to read
 *  the current pathname, so we write it into a request header here. */
const PATHNAME_HEADER = "x-pathname";

/**
 * Per gs-connections-architecture.md §5, every account should have a backup
 * password. Since 2026-10-10 it's a strong recommendation rather than a wall:
 * a passwordless account (Twitch / Discord sign-up) is sent to
 * /signup/set-password, which offers "Not now"; that sets the
 * PASSWORD_LATER_COOKIE for 30 days and the redirect stops until it
 * expires. Staff and admins can't choose "Not now".
 *
 * Allowlist: paths a signed-in-but-passwordless user is still allowed
 * to load (so they can complete the flow + sign out + read public docs
 * + view legal pages without a redirect loop).
 */
const PASSWORDLESS_ALLOWED_PREFIXES = [
  "/signup/set-password",
  // API routes always proceed — they enforce their own auth/state
  "/api/",
];

/**
 * Two-factor gate. Supabase puts the session's assurance level in the JWT's
 * `aal` claim, so a password-only session on an account that has a verified
 * factor reads `aal1` and never reaches a protected page — the check can't be
 * skipped by the client. Nothing to do for accounts without a factor.
 */
const MFA_ALLOWED_PREFIXES = ["/login", "/signup", "/auth", "/api/"];

function sessionAal(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()) as { aal?: string; amr?: { method: string }[] };
    return payload.aal ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  // Carry the pathname forward so server components can branch on it
  // (used by the root layout's theme decision — marketing vs. app).
  // We thread it through `request.headers` so `headers()` in a server
  // component surfaces it; setting on `response.headers` would only
  // reach the client.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);

  // The Discord Activity host serves one page at "/" (Discord always loads the
  // root of its URL mapping). No sign-in, no redirects to /login: inside
  // Discord's frame a redirect would break the connection to the client. Any
  // other page on that host belongs on the main site.
  if (isActivityHost(request.headers.get("host"))) {
    requestHeaders.set(PATHNAME_HEADER, ACTIVITY_PATH);
    const path = request.nextUrl.pathname;
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = ACTIVITY_PATH;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    if (isActivityPath(path)) return NextResponse.next({ request: { headers: requestHeaders } });
    return NextResponse.redirect(new URL(`${path}${request.nextUrl.search}`, process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co"));
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Auth check only runs for the protected prefixes (existing matcher
  // behavior). For everything else, return early after the header is
  // set — no Supabase round-trip needed just to render a marketing page.
  const path = request.nextUrl.pathname;
  const isProtectedPath = PROTECTED_ROUTES.some((r) => path.startsWith(r));
  const isAuthFlow = path === "/login" || path === "/signup";
  if (!isProtectedPath && !isAuthFlow) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          // Recreate with the same modified request headers so the
          // x-pathname we set above survives this re-init.
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — important for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect account routes
  const isProtected = PROTECTED_ROUTES.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Two-factor: a session that stopped at aal1 while the account has a
  // verified factor is only half signed in. A factor someone started setting
  // up and never verified doesn't count (it used to lock them out of /account).
  const onAuthPage = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup";
  let needsSecondStep = false;
  if (user && (isProtected || onAuthPage)) {
    const { data: session } = await supabase.auth.getSession();
    const aal = sessionAal(session.session?.access_token);
    const enrolledAal = (user.app_metadata as { aal?: string } | undefined)?.aal;
    const factors = (user as { factors?: { status?: string }[] }).factors;
    const hasFactor = Array.isArray(factors) && factors.some((f) => f.status === "verified");
    needsSecondStep = aal === "aal1" && (hasFactor || enrolledAal === "aal2");
  }

  // Signed-in people skip login/signup, unless they still owe the second step:
  // /login?mfa=1 is where they finish it (sending them on to /account looped
  // straight back here).
  if (user && onAuthPage) {
    if (needsSecondStep && request.nextUrl.pathname === "/login") {
      if (request.nextUrl.searchParams.get("mfa") !== "1") {
        const finish = new URL(request.url);
        finish.searchParams.set("mfa", "1");
        return NextResponse.redirect(finish);
      }
    } else {
      return NextResponse.redirect(new URL("/account", request.url));
    }
  }

  // Send a half-signed-in session back to finish the second step.
  if (user && isProtected) {
    if (needsSecondStep && !MFA_ALLOWED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
      loginUrl.searchParams.set("mfa", "1");
      return NextResponse.redirect(loginUrl);
    }
  }

  // Backup-password prompt: has_password (or, until the trigger has run, the
  // providers list) from the user object, no admin call in the hot path.
  if (user && isProtected) {
    const path = request.nextUrl.pathname;
    const isAllowed = PASSWORDLESS_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
    if (!isAllowed) {
      const hasPassword = hasPasswordFrom(user.app_metadata);
      const putOff = !!request.cookies.get(PASSWORD_LATER_COOKIE)?.value;
      if (!hasPassword && !putOff) {
        const setPasswordUrl = new URL("/signup/set-password", request.url);
        setPasswordUrl.searchParams.set("return_to", path + request.nextUrl.search);
        return NextResponse.redirect(setPasswordUrl);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  // Run on every request that hits a real page so we can write the
  // x-pathname header for the theme branch. Exclude Next internals,
  // static assets, and API routes — none of them render the root
  // layout, so the header would be wasted. The middleware body itself
  // gates the expensive Supabase work behind the protected-route check
  // so this expansion doesn't add a JWT round-trip to marketing pages.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|images/|files/|api/).*)",
  ],
};
