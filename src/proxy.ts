import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

export async function proxy(request: NextRequest) {
  // The proxy only checks for the presence of the session cookie to avoid
  // network/database work on every request. Real verification (HMAC signature,
  // expiry, and DB lookup) happens in `getSessionUser()`, which runs in server
  // components like Navbar on the Node runtime.
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLoginPage = request.nextUrl.pathname === "/login";

  // Redirect unauthenticated users away from protected routes
  if (!hasSession && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from the login page
  if (hasSession && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and API routes.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
