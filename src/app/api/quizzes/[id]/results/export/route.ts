import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { exportSessionResultsAsExcel } from "@/lib/services/export.service";

export const GET = withAuth(async (_request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const buffer = await exportSessionResultsAsExcel(quizId);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  return new NextResponse(bytes as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quiz-${quizId}-results.xlsx"`,
    },
  });
}, "Results Export");
