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
    const playerDetails = await sessionRepository.getSessionResults(session.id);
    const sheetName = `Session ${session.pin}`;
    const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

    // Leaderboard
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
      const p = playerDetails[i] as any;
      const accuracy = p.totalQuestions > 0 ? Math.round((p.correctCount / p.totalQuestions) * 100) : 0;

      const row = sheet.addRow({
        rank: i + 1,
        player: p.nickname,
        avatar: p.avatar || "",
        score: p.totalScore,
        correct: p.correctCount,
        total: p.totalQuestions,
        accuracy,
      });

      // Medal colors for top 3
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

  logger.export.info(`Exported session results as Excel`, { quizId, sessions: sessions.length });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
