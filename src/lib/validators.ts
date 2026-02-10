import { z } from "zod";

function isAbsoluteOrRelativeAssetUrl(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (/^https?:\/\/.+/i.test(trimmed)) return true;
  if (trimmed.startsWith("/uploads/")) return true;
  return false;
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  customSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens")
    .min(3)
    .max(50)
    .optional()
    .nullable(),
});

export const questionSchema = z
  .object({
    questionText: z.string().min(1).max(500),
    questionType: z.enum([
      "multiple_choice",
      "true_false",
      "multi_select",
      "text_input",
      "ordering",
    ]),
    timeLimitSeconds: z.number().int().min(5).max(120),
    basePoints: z.number().int().min(100).max(5000),
    deductionPoints: z.number().int().min(0).max(1000),
    deductionInterval: z.number().int().min(1).max(60),
    mediaUrl: z
      .string()
      .trim()
      .refine(isAbsoluteOrRelativeAssetUrl, "Invalid media URL")
      .optional()
      .nullable(),
    backgroundUrl: z
      .string()
      .trim()
      .refine(isAbsoluteOrRelativeAssetUrl, "Invalid background URL")
      .optional()
      .nullable(),
    choices: z
      .array(
        z.object({
          choiceText: z.string().min(1).max(200),
          isCorrect: z.boolean(),
        })
      )
      .min(1)
      .max(8),
  })
  .superRefine((data, ctx) => {
    if (data.questionType === "true_false" && data.choices.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "True/False question must have exactly 2 choices",
        path: ["choices"],
      });
    }

    if (data.questionType !== "text_input" && data.choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least 2 choices required",
        path: ["choices"],
      });
    }

    if (
      data.questionType === "multiple_choice" ||
      data.questionType === "true_false"
    ) {
      const correctCount = data.choices.filter((c) => c.isCorrect).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exactly one correct choice required",
          path: ["choices"],
        });
      }
    }

    if (data.questionType === "multi_select") {
      const correctCount = data.choices.filter((c) => c.isCorrect).length;
      if (correctCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one correct choice required",
          path: ["choices"],
        });
      }
    }
  });

export const playerJoinSchema = z.object({
  pin: z.string().length(6),
  nickname: z.string().min(1).max(20),
});
