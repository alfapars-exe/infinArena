import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const admins = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const quizzes = sqliteTable("quizzes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id")
    .notNull()
    .references(() => admins.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),
  customSlug: text("custom_slug").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizId: integer("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  questionType: text("question_type", {
    enum: [
      "multiple_choice",
      "true_false",
      "multi_select",
      "text_input",
      "ordering",
    ],
  })
    .notNull()
    .default("multiple_choice"),
  orderIndex: integer("order_index").notNull(),
  timeLimitSeconds: integer("time_limit_seconds").notNull().default(20),
  basePoints: integer("base_points").notNull().default(1000),
  deductionPoints: integer("deduction_points").notNull().default(50),
  deductionInterval: integer("deduction_interval").notNull().default(1),
  mediaUrl: text("media_url"),
  backgroundUrl: text("background_url"),
});

export const answerChoices = sqliteTable("answer_choices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  choiceText: text("choice_text").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" })
    .notNull()
    .default(false),
  orderIndex: integer("order_index").notNull(),
});

export const quizSessions = sqliteTable("quiz_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizId: integer("quiz_id")
    .notNull()
    .references(() => quizzes.id),
  pin: text("pin").notNull().unique(),
  status: text("status", { enum: ["lobby", "in_progress", "completed"] })
    .notNull()
    .default("lobby"),
  currentQuestionIndex: integer("current_question_index").default(-1),
  isLive: integer("is_live", { mode: "boolean" }).notNull().default(false),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => quizSessions.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  avatar: text("avatar"),
  socketId: text("socket_id"),
  totalScore: integer("total_score").notNull().default(0),
  isConnected: integer("is_connected", { mode: "boolean" })
    .notNull()
    .default(true),
  joinedAt: integer("joined_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playerAnswers = sqliteTable("player_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  sessionId: integer("session_id")
    .notNull()
    .references(() => quizSessions.id),
  choiceId: integer("choice_id").references(() => answerChoices.id),
  isCorrect: integer("is_correct", { mode: "boolean" })
    .notNull()
    .default(false),
  responseTimeMs: integer("response_time_ms").notNull(),
  pointsAwarded: integer("points_awarded").notNull().default(0),
  answeredAt: integer("answered_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Relations
export const adminsRelations = relations(admins, ({ many }) => ({
  quizzes: many(quizzes),
}));

export const quizzesRelations = relations(quizzes, ({ many, one }) => ({
  questions: many(questions),
  sessions: many(quizSessions),
  admin: one(admins, { fields: [quizzes.adminId], references: [admins.id] }),
}));

export const questionsRelations = relations(questions, ({ many, one }) => ({
  choices: many(answerChoices),
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
}));

export const answerChoicesRelations = relations(answerChoices, ({ one }) => ({
  question: one(questions, {
    fields: [answerChoices.questionId],
    references: [questions.id],
  }),
}));

export const quizSessionsRelations = relations(
  quizSessions,
  ({ many, one }) => ({
    players: many(players),
    quiz: one(quizzes, {
      fields: [quizSessions.quizId],
      references: [quizzes.id],
    }),
  })
);

export const playersRelations = relations(players, ({ many, one }) => ({
  answers: many(playerAnswers),
  session: one(quizSessions, {
    fields: [players.sessionId],
    references: [quizSessions.id],
  }),
}));

export const playerAnswersRelations = relations(playerAnswers, ({ one }) => ({
  player: one(players, {
    fields: [playerAnswers.playerId],
    references: [players.id],
  }),
  question: one(questions, {
    fields: [playerAnswers.questionId],
    references: [questions.id],
  }),
  session: one(quizSessions, {
    fields: [playerAnswers.sessionId],
    references: [quizSessions.id],
  }),
  choice: one(answerChoices, {
    fields: [playerAnswers.choiceId],
    references: [answerChoices.id],
  }),
}));


