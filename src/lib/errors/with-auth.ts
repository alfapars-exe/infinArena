import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import { UnauthorizedError } from "./app-error";
import { handleApiError } from "./error-handler";

export interface AuthSession {
  userId: number;
  email: string;
  name: string;
}

type AuthHandler = (
  request: NextRequest,
  session: AuthSession,
  params?: Record<string, string>
) => Promise<NextResponse>;

export function withAuth(handler: AuthHandler, context?: string) {
  return async (request: NextRequest, routeContext?: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user) {
        throw new UnauthorizedError();
      }

      const authSession: AuthSession = {
        userId: parseInt((session.user as { id?: string }).id || "1"),
        email: session.user.email || "",
        name: session.user.name || "",
      };

      const params = routeContext?.params ? await routeContext.params : undefined;
      return await handler(request, authSession, params);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}
