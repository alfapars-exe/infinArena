import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes, questions, answerChoices } from "@/lib/db/schema";
import { ensureDbMigrations } from "@/lib/db/migrations";

const HUGGINGFACE_API_URL =
  "https://router.huggingface.co/together/v1/chat/completions";

const VALID_MODELS = [
  "openai/gpt-oss-120b",
  "zai-org/GLM-4.7",
  "openai/gpt-oss-20b",
] as const;

const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;
const VALID_LANGUAGES = ["en", "tr"] as const;
const QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "multi_select",
  "text_input",
  "ordering",
] as const;

type QuestionType = (typeof QUESTION_TYPES)[number];

interface AIQuestion {
  questionText: string;
  questionType: QuestionType;
  timeLimitSeconds: number;
  basePoints: number;
  deductionPoints: number;
  deductionInterval: number;
  choices: { choiceText: string; isCorrect: boolean }[];
}

function validateQuestion(q: AIQuestion): boolean {
  if (!q.questionText || typeof q.questionText !== "string") return false;
  if (!QUESTION_TYPES.includes(q.questionType)) return false;
  if (!Array.isArray(q.choices) || q.choices.length === 0) return false;

  const correctCount = q.choices.filter((c) => c.isCorrect).length;

  switch (q.questionType) {
    case "multiple_choice":
      return q.choices.length >= 2 && q.choices.length <= 8 && correctCount === 1;
    case "true_false":
      return q.choices.length === 2 && correctCount === 1;
    case "multi_select":
      return q.choices.length >= 2 && q.choices.length <= 8 && correctCount >= 2;
    case "text_input":
      return q.choices.length >= 1 && q.choices.every((c) => c.isCorrect);
    case "ordering":
      return q.choices.length >= 2 && q.choices.every((c) => c.isCorrect);
    default:
      return false;
  }
}

function buildSystemPrompt(
  topic: string,
  difficulty: string,
  numQuestions: number,
  language: string
): string {
  const lang = language === "tr" ? "Turkish" : "English";
  return `You are a quiz generator. Generate exactly ${numQuestions} quiz questions about "${topic}" at ${difficulty} difficulty level. Write all questions and answers in ${lang}.

Use ALL of these question types, distributed as evenly as possible:
- multiple_choice: 2-4 choices, exactly 1 correct
- true_false: exactly 2 choices ("True"/"False" or "Doğru"/"Yanlış"), 1 correct
- multi_select: 3-4 choices, 2-3 correct
- text_input: 1-3 accepted answers, ALL marked isCorrect=true
- ordering: 3-5 items in the CORRECT order, ALL marked isCorrect=true

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "questionText": "The question text",
      "questionType": "multiple_choice",
      "timeLimitSeconds": 20,
      "basePoints": 1000,
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "Option A", "isCorrect": false },
        { "choiceText": "Option B", "isCorrect": true },
        { "choiceText": "Option C", "isCorrect": false },
        { "choiceText": "Option D", "isCorrect": false }
      ]
    }
  ]
}

Rules:
- timeLimitSeconds: easy=30, medium=20, hard=15
- basePoints: easy=800, medium=1000, hard=1200
- deductionPoints: always 50
- deductionInterval: always 1
- Do NOT include any text outside the JSON object`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureDbMigrations();

    const body = await request.json();
    const { topic, difficulty, numQuestions, model, language } = body;

    // Validate inputs
    if (!topic || typeof topic !== "string" || topic.length < 1 || topic.length > 200) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }
    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
    }
    if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > 30) {
      return NextResponse.json({ error: "Invalid question count" }, { status: 400 });
    }
    if (!VALID_MODELS.includes(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    if (!VALID_LANGUAGES.includes(language)) {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey || apiKey === "hf_xxxxxxxxxxxxxxxxxxxx") {
      return NextResponse.json(
        { error: "HuggingFace API key not configured" },
        { status: 500 }
      );
    }

    // Call HuggingFace API
    const systemPrompt = buildSystemPrompt(topic, difficulty, numQuestions, language);

    const hfResponse = await fetch(HUGGINGFACE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate ${numQuestions} quiz questions about "${topic}".`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text().catch(() => "Unknown error");
      console.error("HuggingFace API error:", hfResponse.status, errText);
      return NextResponse.json(
        { error: "AI service error", details: errText },
        { status: 502 }
      );
    }

    const hfData = await hfResponse.json();
    const content = hfData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    // Parse JSON response
    let parsed: { questions: AIQuestion[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON from the response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return NextResponse.json(
            { error: "Could not parse AI response" },
            { status: 422 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Could not parse AI response" },
          { status: 422 }
        );
      }
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json(
        { error: "AI returned no questions" },
        { status: 422 }
      );
    }

    // Filter valid questions
    const validQuestions = parsed.questions.filter(validateQuestion);

    if (validQuestions.length === 0) {
      return NextResponse.json(
        { error: "No valid questions could be generated" },
        { status: 422 }
      );
    }

    // Create quiz in DB
    const userId = parseInt((session.user as { id?: string }).id || "1");
    const diffLabel =
      difficulty === "easy" ? "Easy" : difficulty === "medium" ? "Medium" : "Hard";
    const quizTitle = `${topic} (${diffLabel}) - AI`;

    const [newQuiz] = await db
      .insert(quizzes)
      .values({
        adminId: userId,
        title: quizTitle,
        description: `AI-generated quiz about ${topic}`,
        status: "draft",
      })
      .returning();

    // Insert questions and choices
    for (let i = 0; i < validQuestions.length; i++) {
      const q = validQuestions[i];
      const [newQuestion] = await db
        .insert(questions)
        .values({
          quizId: newQuiz.id,
          questionText: q.questionText,
          questionType: q.questionType,
          orderIndex: i,
          timeLimitSeconds: q.timeLimitSeconds || 20,
          basePoints: q.basePoints || 1000,
          deductionPoints: q.deductionPoints || 50,
          deductionInterval: q.deductionInterval || 1,
        })
        .returning();

      // Insert choices
      const choiceValues = q.choices.map((c, ci) => ({
        questionId: newQuestion.id,
        choiceText: c.choiceText,
        isCorrect: c.isCorrect,
        orderIndex: ci,
      }));

      if (choiceValues.length > 0) {
        await db.insert(answerChoices).values(choiceValues);
      }
    }

    const status = validQuestions.length < numQuestions ? 201 : 200;
    return NextResponse.json(
      {
        quiz: { id: newQuiz.id, title: newQuiz.title },
        questionsCreated: validQuestions.length,
        totalRequested: numQuestions,
      },
      { status }
    );
  } catch (err) {
    console.error("AI generate error:", err);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 }
    );
  }
}
