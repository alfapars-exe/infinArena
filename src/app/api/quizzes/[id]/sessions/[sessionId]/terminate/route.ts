import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { terminateSession } from "@/lib/services/session-admin.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quizId = Number.parseInt(params.id, 10);
  const sessionId = Number.parseInt(params.sessionId, 10);

  if (Number.isNaN(quizId) || Number.isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  }

  const result = await terminateSession(quizId, sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    session: result.data.session,
    alreadyCompleted: result.data.alreadyCompleted || undefined,
  });
}

