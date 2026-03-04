import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { quizRepository } from "@/lib/repositories/quiz.repository";
import { sessionRepository } from "@/lib/repositories/session.repository";
import { NotFoundError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import { ensureDbMigrations } from "@/lib/db/migrations";

type ExportSession = {
  id: number;
  pin: string;
};

function addSessionLeaderboardSheet(
  workbook: ExcelJS.Workbook,
  session: ExportSession,
  playerDetails: any[]
): void {
  const sheetName = `Leaderboard ${session.pin}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  sheet.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Player", key: "player", width: 20 },
    { header: "Avatar", key: "avatar", width: 8 },
    { header: "Total Score", key: "score", width: 15 },
    { header: "Correct", key: "correct", width: 10 },
    { header: "Total Questions", key: "total", width: 15 },
    { header: "Accuracy %", key: "accuracy", width: 12 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };

  for (let i = 0; i < playerDetails.length; i++) {
    const player = playerDetails[i] as any;
    const accuracy =
      player.totalQuestions > 0
        ? Math.round((player.correctCount / player.totalQuestions) * 100)
        : 0;

    const row = sheet.addRow({
      rank: i + 1,
      player: player.nickname,
      avatar: player.avatar || "",
      score: player.totalScore,
      correct: player.correctCount,
      total: player.totalQuestions,
      accuracy,
    });

    if (i < 3) {
      const colors = ["FFFFD700", "FFC0C0C0", "FFCD7F32"];
      row.getCell("rank").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colors[i] },
      };
      row.getCell("rank").font = { bold: true };
    }
  }
}

function addSessionQuestionAnalysisSheet(
  workbook: ExcelJS.Workbook,
  session: ExportSession,
  playerDetails: any[]
): void {
  const sheetName = `Analysis ${session.pin}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  sheet.columns = [
    { header: "Question #", key: "questionNumber", width: 12 },
    { header: "Question", key: "questionText", width: 52 },
    { header: "Answers", key: "answers", width: 12 },
    { header: "Correct", key: "correct", width: 12 },
    { header: "Wrong", key: "wrong", width: 12 },
    { header: "Accuracy %", key: "accuracy", width: 12 },
    { header: "Avg Time (s)", key: "avgTimeSeconds", width: 14 },
    { header: "Avg Points", key: "avgPoints", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF5B8E7D" },
  };

  const statsByQuestionId = new Map<
    number,
    {
      questionId: number;
      questionText: string;
      totalAnswers: number;
      correctAnswers: number;
      totalResponseTimeMs: number;
      totalPointsAwarded: number;
    }
  >();

  for (const player of playerDetails) {
    const answers = Array.isArray((player as any).answers) ? (player as any).answers : [];
    for (const answer of answers) {
      const questionId = Number(answer.questionId);
      const existing = statsByQuestionId.get(questionId);
      if (!existing) {
        statsByQuestionId.set(questionId, {
          questionId,
          questionText: String(answer.questionText || "-"),
          totalAnswers: 1,
          correctAnswers: answer.isCorrect ? 1 : 0,
          totalResponseTimeMs: Number(answer.responseTimeMs || 0),
          totalPointsAwarded: Number(answer.pointsAwarded || 0),
        });
        continue;
      }

      existing.totalAnswers += 1;
      existing.correctAnswers += answer.isCorrect ? 1 : 0;
      existing.totalResponseTimeMs += Number(answer.responseTimeMs || 0);
      existing.totalPointsAwarded += Number(answer.pointsAwarded || 0);
    }
  }

  const sortedStats = Array.from(statsByQuestionId.values()).sort(
    (left, right) => left.questionId - right.questionId
  );

  sortedStats.forEach((stat, index) => {
    const wrongAnswers = stat.totalAnswers - stat.correctAnswers;
    const accuracy =
      stat.totalAnswers > 0 ? Math.round((stat.correctAnswers / stat.totalAnswers) * 100) : 0;
    const avgTimeSeconds =
      stat.totalAnswers > 0 ? Number((stat.totalResponseTimeMs / stat.totalAnswers / 1000).toFixed(2)) : 0;
    const avgPoints =
      stat.totalAnswers > 0 ? Number((stat.totalPointsAwarded / stat.totalAnswers).toFixed(2)) : 0;

    sheet.addRow({
      questionNumber: index + 1,
      questionText: stat.questionText,
      answers: stat.totalAnswers,
      correct: stat.correctAnswers,
      wrong: wrongAnswers,
      accuracy,
      avgTimeSeconds,
      avgPoints,
    });
  });
}

function addSessionAnswerDetailsSheet(
  workbook: ExcelJS.Workbook,
  session: ExportSession,
  playerDetails: any[]
): void {
  const sheetName = `Answers ${session.pin}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  sheet.columns = [
    { header: "Player", key: "player", width: 24 },
    { header: "Question", key: "question", width: 52 },
    { header: "Answer", key: "answer", width: 30 },
    { header: "Correct", key: "isCorrect", width: 10 },
    { header: "Response Time (s)", key: "timeSeconds", width: 18 },
    { header: "Points", key: "points", width: 12 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF7A5AA6" },
  };

  for (const player of playerDetails) {
    const answers = Array.isArray((player as any).answers) ? (player as any).answers : [];
    for (const answer of answers) {
      sheet.addRow({
        player: player.nickname,
        question: answer.questionText || "-",
        answer: answer.choiceText || "No answer",
        isCorrect: answer.isCorrect ? "Yes" : "No",
        timeSeconds: Number(((answer.responseTimeMs || 0) / 1000).toFixed(2)),
        points: answer.pointsAwarded || 0,
      });
    }
  }
}

async function appendSessionExportSheets(
  workbook: ExcelJS.Workbook,
  session: ExportSession
): Promise<void> {
  const playerDetails = await sessionRepository.getSessionResults(session.id);
  addSessionLeaderboardSheet(workbook, session, playerDetails as any[]);
  addSessionQuestionAnalysisSheet(workbook, session, playerDetails as any[]);
  addSessionAnswerDetailsSheet(workbook, session, playerDetails as any[]);
}

export async function exportQuizDraftAsExcel(quizId: number): Promise<Buffer> {
  await ensureDbMigrations();
  const quiz = await quizRepository.findWithQuestions(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "infinArena";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Questions");

  // Header row
  sheet.columns = [
    { header: "#", key: "index", width: 5 },
    { header: "Question", key: "question", width: 50 },
    { header: "Type", key: "type", width: 15 },
    { header: "Time (s)", key: "time", width: 10 },
    { header: "Points", key: "points", width: 10 },
    { header: "Choice 1", key: "c1", width: 20 },
    { header: "Choice 2", key: "c2", width: 20 },
    { header: "Choice 3", key: "c3", width: 20 },
    { header: "Choice 4", key: "c4", width: 20 },
    { header: "Choice 5", key: "c5", width: 20 },
    { header: "Choice 6", key: "c6", width: 20 },
    { header: "Choice 7", key: "c7", width: 20 },
    { header: "Choice 8", key: "c8", width: 20 },
    { header: "Correct Answer(s)", key: "correct", width: 30 },
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { horizontal: "center" };

  // Add question rows
  const questionsData = (quiz as any).questions || [];
  for (let i = 0; i < questionsData.length; i++) {
    const q = questionsData[i];
    const choices = q.choices || [];
    const correctChoices = choices
      .filter((c: any) => c.isCorrect)
      .map((c: any) => c.choiceText)
      .join(", ");

    const rowData: Record<string, any> = {
      index: i + 1,
      question: q.questionText,
      type: q.questionType,
      time: q.timeLimitSeconds,
      points: q.basePoints,
      correct: correctChoices,
    };

    for (let j = 0; j < Math.min(choices.length, 8); j++) {
      rowData[`c${j + 1}`] = choices[j].choiceText;
    }

    const row = sheet.addRow(rowData);

    // Highlight correct choices green
    for (let j = 0; j < Math.min(choices.length, 8); j++) {
      if (choices[j].isCorrect) {
        const cell = row.getCell(`c${j + 1}`);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" },
        };
        cell.font = { bold: true };
      }
    }
  }

  logger.export.info(`Exported quiz draft as Excel`, { quizId, questions: questionsData.length });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportQuizDraftAsWord(quizId: number): Promise<Buffer> {
  await ensureDbMigrations();
  const quiz = await quizRepository.findWithQuestions(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);

  const questionsData = (quiz as any).questions || [];
  const children: any[] = [];

  // Title
  children.push(
    new Paragraph({
      text: (quiz as any).title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  if ((quiz as any).description) {
    children.push(
      new Paragraph({
        text: (quiz as any).description,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  children.push(
    new Paragraph({
      text: `Total Questions: ${questionsData.length}`,
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER,
    })
  );

  // Questions
  for (let i = 0; i < questionsData.length; i++) {
    const q = questionsData[i];
    const choices = q.choices || [];

    // Question header
    children.push(
      new Paragraph({
        text: `Question ${i + 1} (${q.questionType}) - ${q.timeLimitSeconds}s - ${q.basePoints} pts`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      })
    );

    children.push(
      new Paragraph({
        text: q.questionText,
        spacing: { after: 200 },
      })
    );

    // Choices
    for (let j = 0; j < choices.length; j++) {
      const c = choices[j];
      const prefix = q.questionType === "ordering" ? `${j + 1}.` : `${String.fromCharCode(65 + j)})`;
      const correctMark = c.isCorrect && q.questionType !== "ordering" ? " ✓" : "";

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `  ${prefix} ${c.choiceText}${correctMark}`,
              bold: c.isCorrect,
              color: c.isCorrect ? "00AA00" : "000000",
            }),
          ],
          spacing: { after: 50 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  logger.export.info(`Exported quiz draft as Word`, { quizId, questions: questionsData.length });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

export async function exportSessionResultsAsExcel(quizId: number): Promise<Buffer> {
  await ensureDbMigrations();
  const sessions = await sessionRepository.findByQuizId(quizId);
  if (!sessions || sessions.length === 0) {
    throw new NotFoundError("Quiz sessions");
  }

  const quiz = await quizRepository.findById(quizId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "infinArena";
  workbook.created = new Date();

  for (const session of sessions as any[]) {
    await appendSessionExportSheets(workbook, {
      id: Number(session.id),
      pin: String(session.pin),
    });
  }

  logger.export.info(`Exported session results as Excel`, { quizId, sessions: sessions.length });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportSingleSessionResultsAsExcel(
  quizId: number,
  sessionId: number
): Promise<Buffer> {
  await ensureDbMigrations();

  const session = await sessionRepository.findById(sessionId);
  if (!session || session.quizId !== quizId) {
    throw new NotFoundError("Quiz session", sessionId);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "infinArena";
  workbook.created = new Date();

  await appendSessionExportSheets(workbook, {
    id: Number(session.id),
    pin: String(session.pin),
  });

  logger.export.info(`Exported single session results as Excel`, {
    quizId,
    sessionId,
    pin: session.pin,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
