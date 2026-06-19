import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/account", "/twitch"];

/** The root layout reads this to decide whether the current request is
 *  a marketing surface (force light) or an app surface (honor theme
 *  cookie). Next.js server components have no first-class API to read
 *  the current pathname, so we write it into a request header here. */
const PATHNAME_HEADER = "x-pathname";

/**
 * Per gs-connections-architecture.md §5 — every account MUST have a
 * password set. Routes that require a session also require a password;
 * users without one get bounced to /signup/set-password until they
 * comply.
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

export async function middleware(request: NextRequest) {
  // Carry the pathname forward so server components can branch on it
  // (used by the root layout's theme decision — marketing vs. app).
  // We thread it through `request.headers` so `headers()` in a server
  // component surfaces it; setting on `response.headers` would only
  // reach the client.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);

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

  // Redirect logged-in users away from login/signup
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  // Passwordless gate — protected routes require a password set. Read
  // app_metadata.providers from the JWT-derived user object directly
  // (no admin call needed in the hot middleware path). Empty/missing
  // providers list = treat as having a password to avoid false bounces.
  if (user && isProtected) {
    const path = request.nextUrl.pathname;
    const isAllowed = PASSWORDLESS_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
    if (!isAllowed) {
      const providers = Array.isArray(user.app_metadata?.providers)
        ? (user.app_metadata.providers as string[])
        : [];
      const hasPassword = providers.length === 0 || providers.includes("email");
      if (!hasPassword) {
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
