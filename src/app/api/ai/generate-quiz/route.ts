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
  language: string,
  timeLimitOverride?: number
): string {
  const lang = language === "tr" ? "Turkish" : "English";
  const tf = language === "tr" ? ["Doğru", "Yanlış"] : ["True", "False"];
  const timeLimit =
    typeof timeLimitOverride === "number"
      ? timeLimitOverride
      : difficulty === "easy"
      ? 30
      : difficulty === "medium"
      ? 20
      : 15;
  const basePoints = difficulty === "easy" ? 800 : difficulty === "medium" ? 1000 : 1200;

  // Calculate distribution
  const perType = Math.floor(numQuestions / 5);
  const remainder = numQuestions % 5;
  const dist = {
    multiple_choice: perType + (remainder >= 1 ? 1 : 0),
    true_false: perType + (remainder >= 2 ? 1 : 0),
    multi_select: perType + (remainder >= 3 ? 1 : 0),
    text_input: perType + (remainder >= 4 ? 1 : 0),
    ordering: perType,
  };

  return `You are a quiz generator. Generate EXACTLY ${numQuestions} questions about "${topic}" at ${difficulty} difficulty. Write everything in ${lang}.

You MUST use ALL 5 question types with this EXACT distribution:
- multiple_choice: ${dist.multiple_choice} question(s)
- true_false: ${dist.true_false} question(s)
- multi_select: ${dist.multi_select} question(s)
- text_input: ${dist.text_input} question(s)
- ordering: ${dist.ordering} question(s)

Return ONLY a JSON object. Here is an example with one of each type:

{
  "questions": [
    {
      "questionText": "What is the capital of France?",
      "questionType": "multiple_choice",
      "timeLimitSeconds": ${timeLimit},
      "basePoints": ${basePoints},
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "London", "isCorrect": false },
        { "choiceText": "Paris", "isCorrect": true },
        { "choiceText": "Berlin", "isCorrect": false },
        { "choiceText": "Madrid", "isCorrect": false }
      ]
    },
    {
      "questionText": "The Earth is flat.",
      "questionType": "true_false",
      "timeLimitSeconds": ${timeLimit},
      "basePoints": ${basePoints},
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "${tf[0]}", "isCorrect": false },
        { "choiceText": "${tf[1]}", "isCorrect": true }
      ]
    },
    {
      "questionText": "Which are primary colors?",
      "questionType": "multi_select",
      "timeLimitSeconds": ${timeLimit},
      "basePoints": ${basePoints},
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "Red", "isCorrect": true },
        { "choiceText": "Green", "isCorrect": false },
        { "choiceText": "Blue", "isCorrect": true },
        { "choiceText": "Yellow", "isCorrect": true }
      ]
    },
    {
      "questionText": "What is 2+2?",
      "questionType": "text_input",
      "timeLimitSeconds": ${timeLimit},
      "basePoints": ${basePoints},
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "4", "isCorrect": true },
        { "choiceText": "four", "isCorrect": true }
      ]
    },
    {
      "questionText": "Order these planets from closest to farthest from the Sun:",
      "questionType": "ordering",
      "timeLimitSeconds": ${timeLimit},
      "basePoints": ${basePoints},
      "deductionPoints": 50,
      "deductionInterval": 1,
      "choices": [
        { "choiceText": "Mercury", "isCorrect": true },
        { "choiceText": "Venus", "isCorrect": true },
        { "choiceText": "Earth", "isCorrect": true },
        { "choiceText": "Mars", "isCorrect": true }
      ]
    }
  ]
}

CRITICAL RULES:
- Generate EXACTLY ${numQuestions} questions total
- true_false: EXACTLY 2 choices, one "${tf[0]}" and one "${tf[1]}"
- text_input: ALL choices MUST have "isCorrect": true (they are accepted answers)
- ordering: ALL choices MUST have "isCorrect": true (they are in correct order)
- multi_select: at least 2 choices must have "isCorrect": true
- multiple_choice: EXACTLY 1 choice with "isCorrect": true
- Do NOT include any text outside the JSON object`;
}

async function callHuggingFaceAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  topic: string,
  numQuestions: number,
  useJsonFormat: boolean
): Promise<{ content: string | null; error: string | null; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate ${numQuestions} quiz questions about "${topic}".${!useJsonFormat ? " Return ONLY valid JSON, no other text." : ""}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 20000,
    };

    if (useJsonFormat) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(HUGGINGFACE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return { content: null, error: String(errText), status: res.status };
    }

    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { content: rawText || null, error: null, status: res.status };
    }

    if (Array.isArray(data)) {
      return {
        content:
          typeof data?.[0]?.generated_text === "string"
            ? data?.[0]?.generated_text
            : data?.[0]?.generated_text == null
              ? null
              : JSON.stringify(data?.[0]?.generated_text),
        error: null,
        status: res.status,
      };
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.generated_text ??
      data?.content ??
      null;
    return {
      content:
        typeof content === "string"
          ? content
          : content == null
            ? null
            : JSON.stringify(content),
      error: null,
      status: res.status,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === "AbortError";
    return {
      content: null,
      error: isTimeout
        ? "Request timed out (2 min)"
        : err?.message || String(err),
      status: isTimeout ? 504 : 0,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureDbMigrations();

    const body = await request.json();
    const { topic, difficulty, numQuestions, model, language, timeLimitSeconds } = body;

    // Validate inputs
    if (!topic || typeof topic !== "string" || topic.length < 1 || topic.length > 200) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }
    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
    }
    if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > 200) {
      return NextResponse.json({ error: "Invalid question count" }, { status: 400 });
    }
    if (!VALID_MODELS.includes(model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    if (!VALID_LANGUAGES.includes(language)) {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }
    if (
      timeLimitSeconds !== undefined &&
      (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 0)
    ) {
      return NextResponse.json({ error: "Invalid time limit" }, { status: 400 });
    }

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey || apiKey === "hf_xxxxxxxxxxxxxxxxxxxx") {
      return NextResponse.json(
        { error: "HuggingFace API key not configured" },
        { status: 500 }
      );
    }

    // Call HuggingFace API
    const systemPrompt = buildSystemPrompt(
      topic,
      difficulty,
      numQuestions,
      language,
      timeLimitSeconds
    );

    console.log(`[AI] Generating ${numQuestions} questions about "${topic}" with model ${model}`);

    // Try with response_format first, fall back without it
    let result = await callHuggingFaceAPI(apiKey, model, systemPrompt, topic, numQuestions, true);

    if (!result.content && result.status === 400) {
      console.log("[AI] Retrying without response_format...");
      result = await callHuggingFaceAPI(apiKey, model, systemPrompt, topic, numQuestions, false);
    }

    if (result.error && !result.content) {
      console.error("[AI] API error:", result.status, result.error);
      return NextResponse.json(
        { error: "AI service error", details: result.error },
        { status: result.status >= 400 ? result.status : 502 }
      );
    }

    if (!result.content) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    const rawContent =
      typeof result.content === "string" ? result.content : String(result.content);

    // Parse JSON response
    let parsed: { questions: AIQuestion[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from the response
      const match = rawContent.match(/\{[\s\S]*\}/);
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

    // Auto-fix common AI mistakes before validation
    for (const q of parsed.questions) {
      if (typeof timeLimitSeconds === "number") {
        q.timeLimitSeconds = timeLimitSeconds;
      }

      if (!q.choices || !Array.isArray(q.choices)) continue;

      // text_input and ordering: all choices must be isCorrect=true
      if (q.questionType === "text_input" || q.questionType === "ordering") {
        q.choices = q.choices.map((c) => ({ ...c, isCorrect: true }));
      }

      // true_false: ensure exactly 2 choices
      if (q.questionType === "true_false" && q.choices.length !== 2) {
        q.choices = q.choices.slice(0, 2);
      }

      // multi_select: if only 1 correct, make it multiple_choice instead
      if (q.questionType === "multi_select") {
        const correctCount = q.choices.filter((c) => c.isCorrect).length;
        if (correctCount < 2) {
          q.questionType = "multiple_choice";
        }
      }
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
    const quizTitle = topic;

    const dbAny = db as typeof db & { insert: (table: unknown) => any };
    const [newQuiz] = await dbAny
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
      const [newQuestion] = await dbAny
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
        await dbAny.insert(answerChoices).values(choiceValues);
      }
    }

    console.log(`[AI] Successfully created quiz with ${validQuestions.length}/${numQuestions} questions`);

    const status = validQuestions.length < numQuestions ? 201 : 200;
    return NextResponse.json(
      {
        quiz: { id: newQuiz.id, title: newQuiz.title },
        questionsCreated: validQuestions.length,
        totalRequested: numQuestions,
      },
      { status }
    );
  } catch (err: any) {
    console.error("[AI] Generate error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to generate quiz", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
