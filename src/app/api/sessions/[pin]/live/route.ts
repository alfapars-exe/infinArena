import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { markSessionLiveByPin } from "@/lib/services/session-query.service";

export const POST = withAuth(async (_request: NextRequest, _session, params) => {
  const pin = params?.pin;
  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const result = await markSessionLiveByPin(pin);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data);
}, "Session Go Live");

