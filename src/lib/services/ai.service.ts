import { quizRepository } from "@/lib/repositories/quiz.repository";
import { logger } from "@/lib/logger";
import { AIServiceError, ValidationError } from "@/lib/errors/app-error";
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

export interface GenerateQuizParams {
  topic: string;
  difficulty: string;
  numQuestions: number;
  model: string;
  language: string;
  timeLimitSeconds?: number;
  userId: number;
}

export interface GenerateQuizResult {
  quiz: { id: number; title: string };
  questionsCreated: number;
  totalRequested: number;
}

function validateParams(params: GenerateQuizParams): void {
  const { topic, difficulty, numQuestions, model, language, timeLimitSeconds } = params;

  if (!topic || typeof topic !== "string" || topic.length < 1 || topic.length > 200) {
    throw new ValidationError("Invalid topic");
  }
  if (!VALID_DIFFICULTIES.includes(difficulty as any)) {
    throw new ValidationError("Invalid difficulty");
  }
  if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > 200) {
    throw new ValidationError("Invalid question count");
  }
  if (!VALID_MODELS.includes(model as any)) {
    throw new ValidationError("Invalid model");
  }
  if (!VALID_LANGUAGES.includes(language as any)) {
    throw new ValidationError("Invalid language");
  }
  if (timeLimitSeconds !== undefined && (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 0)) {
    throw new ValidationError("Invalid time limit");
  }
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

CRITICAL RULES FOR "isCorrect" VALUES:
1. multiple_choice: EXACTLY 1 choice MUST have "isCorrect": true, all others MUST be false
2. true_false: EXACTLY 2 choices total (one "${tf[0]}" and one "${tf[1]}"), EXACTLY 1 MUST have "isCorrect": true
3. multi_select: AT LEAST 2 choices MUST have "isCorrect": true (can be more, but minimum 2)
4. text_input: ALL choices MUST have "isCorrect": true (they are all accepted answers)
5. ordering: ALL choices MUST have "isCorrect": true (they are listed in correct order)

OTHER RULES:
- Generate EXACTLY ${numQuestions} questions total
- Follow the exact distribution of question types shown above
- Do NOT include any text outside the JSON object
- Each question must have meaningful and accurate content`;
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
  const timeoutId = setTimeout(() => controller.abort(), 120000);

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
      // Use arrayBuffer + TextDecoder to avoid "Received type number" error
      let errText: string;
      try {
        const buffer = await res.arrayBuffer();
        errText = new TextDecoder("utf-8").decode(buffer);
      } catch {
        errText = `HTTP ${res.status}`;
      }
      return { content: null, error: errText, status: res.status };
    }

    // Use arrayBuffer + TextDecoder for safe response reading
    let rawText: string;
    try {
      const buffer = await res.arrayBuffer();
      rawText = new TextDecoder("utf-8").decode(buffer);
    } catch (decodeErr) {
      logger.ai.error("Failed to decode response body", decodeErr);
      return { content: null, error: "Failed to decode response", status: res.status };
    }

    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { content: rawText || null, error: null, status: res.status };
    }

    if (Array.isArray(data)) {
      const generated = data?.[0]?.generated_text;
      return {
        content: typeof generated === "string" ? generated : generated == null ? null : JSON.stringify(generated),
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
      content: typeof content === "string" ? content : content == null ? null : JSON.stringify(content),
      error: null,
      status: res.status,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === "AbortError";
    return {
      content: null,
      error: isTimeout ? "Request timed out (2 min)" : (typeof err?.message === "string" ? err.message : String(err)),
      status: isTimeout ? 504 : 0,
    };
  }
}

function autoFixQuestions(questions: AIQuestion[], timeLimitSeconds?: number): void {
  for (const q of questions) {
    if (typeof timeLimitSeconds === "number") {
      q.timeLimitSeconds = timeLimitSeconds;
    }

    if (!q.choices || !Array.isArray(q.choices)) continue;

    // Fix text_input and ordering - all choices should be correct
    if (q.questionType === "text_input" || q.questionType === "ordering") {
      q.choices = q.choices.map((c) => ({ ...c, isCorrect: true }));
    }

    // Fix true_false - ensure exactly 2 choices
    if (q.questionType === "true_false" && q.choices.length !== 2) {
      q.choices = q.choices.slice(0, 2);
    }

    // Fix multiple_choice and true_false - ensure exactly 1 correct answer
    if (q.questionType === "multiple_choice" || q.questionType === "true_false") {
      const correctCount = q.choices.filter((c) => c.isCorrect).length;
      
      if (correctCount === 0) {
        // No correct answer - mark the first one as correct
        if (q.choices.length > 0) {
          q.choices[0].isCorrect = true;
        }
      } else if (correctCount > 1) {
        // Multiple correct answers - keep only the first correct one
        let foundFirst = false;
        q.choices = q.choices.map((c) => {
          if (c.isCorrect && !foundFirst) {
            foundFirst = true;
            return c;
          }
          return { ...c, isCorrect: false };
        });
      }
    }

    // Fix multi_select - ensure at least 2 correct answers
    if (q.questionType === "multi_select") {
      const correctCount = q.choices.filter((c) => c.isCorrect).length;
      
      if (correctCount === 0) {
        // No correct answers - mark first 2 as correct
        if (q.choices.length >= 2) {
          q.choices[0].isCorrect = true;
          q.choices[1].isCorrect = true;
        } else if (q.choices.length === 1) {
          q.choices[0].isCorrect = true;
          q.questionType = "multiple_choice";
        }
      } else if (correctCount === 1) {
        // Only 1 correct - change to multiple_choice
        q.questionType = "multiple_choice";
      }
    }
  }
}

function parseAIResponse(rawContent: string): AIQuestion[] {
  let parsed: { questions: AIQuestion[] };

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        throw new AIServiceError("Could not parse AI response");
      }
    } else {
      throw new AIServiceError("Could not parse AI response");
    }
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new AIServiceError("AI returned no questions");
  }

  return parsed.questions;
}

export async function generateQuiz(params: GenerateQuizParams): Promise<GenerateQuizResult> {
  validateParams(params);

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey || apiKey === "hf_xxxxxxxxxxxxxxxxxxxx") {
    throw new AIServiceError("HuggingFace API key not configured");
  }

  await ensureDbMigrations();

  const systemPrompt = buildSystemPrompt(
    params.topic,
    params.difficulty,
    params.numQuestions,
    params.language,
    params.timeLimitSeconds
  );

  logger.ai.info(`Generating ${params.numQuestions} questions about "${params.topic}" with model ${params.model}`);

  // Try with response_format first, fall back without it
  let result = await callHuggingFaceAPI(
    apiKey, params.model, systemPrompt, params.topic, params.numQuestions, true
  );

  if (!result.content && result.status === 400) {
    logger.ai.info("Retrying without response_format...");
    result = await callHuggingFaceAPI(
      apiKey, params.model, systemPrompt, params.topic, params.numQuestions, false
    );
  }

  if (result.error && !result.content) {
    logger.ai.error("API error", { status: result.status, error: result.error });
    throw new AIServiceError("AI service error", result.error);
  }

  if (!result.content) {
    throw new AIServiceError("Empty response from AI");
  }

  const rawContent = typeof result.content === "string" ? result.content : String(result.content);
  const aiQuestions = parseAIResponse(rawContent);

  // DIAGNOSTIC: Log what LLM returned before fixing
  logger.ai.info(`LLM returned ${aiQuestions.length} questions BEFORE autoFix`);
  aiQuestions.forEach((q, idx) => {
    const correctCount = q.choices.filter(c => c.isCorrect).length;
    logger.ai.info(`Q${idx + 1} [${q.questionType}]: "${q.questionText.substring(0, 50)}..." has ${correctCount}/${q.choices.length} correct choices`);
  });

  autoFixQuestions(aiQuestions, params.timeLimitSeconds);

  // DIAGNOSTIC: Log what changed after autoFix
  logger.ai.info(`After autoFix: ${aiQuestions.length} questions`);
  aiQuestions.forEach((q, idx) => {
    const correctCount = q.choices.filter(c => c.isCorrect).length;
    logger.ai.info(`Q${idx + 1} [${q.questionType}]: has ${correctCount}/${q.choices.length} correct choices`);
  });

  const validQuestions = aiQuestions.filter(validateQuestion);

  if (validQuestions.length === 0) {
    throw new AIServiceError("No valid questions could be generated");
  }

  // Create quiz in DB
  const newQuiz = await quizRepository.create({
    adminId: params.userId,
    title: params.topic,
    description: `AI-generated quiz about ${params.topic}`,
  });

  // Insert questions and choices
  for (let i = 0; i < validQuestions.length; i++) {
    const q = validQuestions[i];
    const newQuestion = await quizRepository.createQuestion({
      quizId: newQuiz.id,
      questionText: q.questionText,
      questionType: q.questionType,
      orderIndex: i,
      timeLimitSeconds: q.timeLimitSeconds || 20,
      basePoints: q.basePoints || 1000,
      deductionPoints: q.deductionPoints || 50,
      deductionInterval: q.deductionInterval || 1,
    });

    const choiceValues = q.choices.map((c, ci) => ({
      questionId: newQuestion.id,
      choiceText: c.choiceText,
      isCorrect: c.isCorrect,
      orderIndex: ci,
    }));

    // FINAL SAFETY CHECK: Force correct isCorrect values before DB insert
    if (q.questionType === "multiple_choice" || q.questionType === "true_false") {
      const correctCount = choiceValues.filter(c => c.isCorrect).length;
      if (correctCount !== 1) {
        // Force ONLY the first choice to be correct
        logger.ai.warn(`[SAFETY FIX] ${q.questionType} had ${correctCount} correct answers, forcing first only`);
        for (let idx = 0; idx < choiceValues.length; idx++) {
          choiceValues[idx].isCorrect = (idx === 0);
        }
      }
    } else if (q.questionType === "multi_select") {
      const correctCount = choiceValues.filter(c => c.isCorrect).length;
      if (correctCount < 2) {
        // Force first 2 choices to be correct
        logger.ai.warn(`[SAFETY FIX] multi_select had ${correctCount} correct answers, forcing first 2`);
        for (let idx = 0; idx < Math.min(2, choiceValues.length); idx++) {
          choiceValues[idx].isCorrect = true;
        }
        for (let idx = 2; idx < choiceValues.length; idx++) {
          choiceValues[idx].isCorrect = false;
        }
      }
    } else if (q.questionType === "text_input" || q.questionType === "ordering") {
      // Force ALL choices to be correct
      for (let idx = 0; idx < choiceValues.length; idx++) {
        choiceValues[idx].isCorrect = true;
      }
    }

    if (choiceValues.length > 0) {
      await quizRepository.createChoices(choiceValues);
    }
  }

  logger.ai.info(`Successfully created quiz with ${validQuestions.length}/${params.numQuestions} questions`);

  return {
    quiz: { id: newQuiz.id, title: newQuiz.title },
    questionsCreated: validQuestions.length,
    totalRequested: params.numQuestions,
  };
}
