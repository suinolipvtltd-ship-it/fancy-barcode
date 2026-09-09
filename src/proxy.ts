import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { getUserIdFromToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  // Verify the session token's signature and expiry here (no DB lookup, so
  // this stays cheap enough for the edge proxy). The full check — loading the
  // user from the database — happens in `getSessionUser()` in server
  // components and route handlers.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await getUserIdFromToken(token) : null;
  const isLoginPage = request.nextUrl.pathname === "/login";

  // Redirect unauthenticated users away from protected routes
  if (!userId && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from the login page
  if (userId && isLoginPage) {
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
