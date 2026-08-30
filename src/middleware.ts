import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const publicPaths = ["/login", "/register", "/"];

function canonicalHost(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return null;
  try {
    return new URL(appUrl).host;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Keep www / apex consistent so session cookies don't vanish between hosts.
  const wantHost = canonicalHost();
  if (
    wantHost &&
    request.nextUrl.host !== wantHost &&
    !pathname.startsWith("/api/")
  ) {
    const url = request.nextUrl.clone();
    url.host = wantHost;
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

  const isPublic =
    publicPaths.includes(pathname) ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/api/invite/") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/otp") ||
    pathname.startsWith("/api/auth/logout");

  const session = request.cookies.get(SESSION_COOKIE);

  if (!session && !isPublic && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    session &&
    (pathname === "/login" || pathname === "/register" || pathname === "/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.webmanifest).*)",
  ],
};
