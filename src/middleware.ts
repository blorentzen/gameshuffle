import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/account", "/twitch"];

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
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
  matcher: ["/account/:path*", "/twitch/:path*", "/login", "/signup"],
};
