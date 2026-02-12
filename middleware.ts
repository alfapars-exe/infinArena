import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /infinarenapanel paths are handled by rewrite in next.config.mjs
  // so we need to check for both /admin and /infinarenapanel
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/infinarenapanel")) {
    return NextResponse.next();
  }

  const isLoginPath = pathname === "/admin/login" || pathname === "/infinarenapanel/login";
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/infinarenapanel") 
      ? "/infinarenapanel/login" 
      : "/admin/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (token && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/infinarenapanel") 
      ? "/infinarenapanel" 
      : "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/infinarenapanel/:path*"],
};

