import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const target = pathname.replace("/admin", "/infinarenapanel");
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  if (!pathname.startsWith("/infinarenapanel")) {
    return NextResponse.next();
  }

  const isLoginPath = pathname === "/infinarenapanel/login";
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/infinarenapanel/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (token && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/infinarenapanel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/infinarenapanel/:path*", "/admin/:path*"],
};

