import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { exportQuizDraftAsExcel, exportQuizDraftAsWord } from "@/lib/services/export.service";

export const GET = withAuth(async (request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "excel";

  if (format === "word") {
    const buffer = await exportQuizDraftAsWord(quizId);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return new NextResponse(bytes as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="quiz-${quizId}.docx"`,
      },
    });
  }

  const buffer = await exportQuizDraftAsExcel(quizId);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new NextResponse(bytes as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quiz-${quizId}.xlsx"`,
    },
  });
}, "Quiz Export");
