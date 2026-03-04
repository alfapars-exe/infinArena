import { NextRequest, NextResponse } from "next/server";

type FrontendRole = "all" | "admin" | "player";

function resolveFrontendRole(value: string | undefined): FrontendRole {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "player") {
    return normalized;
  }
  return "all";
}

const FRONTEND_ROLE = resolveFrontendRole(process.env.FRONTEND_ROLE);

function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname === "/infinarenapanel"
    || pathname.startsWith("/infinarenapanel/")
  );
}

function isPlayerPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/play/");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (FRONTEND_ROLE === "all") {
    return NextResponse.next();
  }

  if (FRONTEND_ROLE === "admin") {
    if (pathname === "/" || isPlayerPath(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isAdminPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
