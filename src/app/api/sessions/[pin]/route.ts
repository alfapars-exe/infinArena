import { NextRequest, NextResponse } from "next/server";
import { getSessionByPin } from "@/lib/services/session-query.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { pin: string } }
) {
  const result = await getSessionByPin(params.pin);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data);
}

