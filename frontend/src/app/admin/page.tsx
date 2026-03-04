"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation, useI18n } from "@/lib/i18n";
import { authedFetch } from "@/lib/services/auth-client";

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  status: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const [showAIModal, setShowAIModal] = useState(false);
  const router = useRouter();
  const fetchQuizzesRequestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchQuizzes({ signal: controller.signal, updateLoading: true });
    return () => {
      controller.abort();
    };
  }, []);

  const fetchQuizzes = async (options?: {
    signal?: AbortSignal;
    updateLoading?: boolean;
  }) => {
    const signal = options?.signal;
    const updateLoading = options?.updateLoading ?? false;
    const requestId = ++fetchQuizzesRequestIdRef.current;

    if (updateLoading) {
      setLoading(true);
    }

    try {
      const res = await authedFetch("/api/quizzes", { signal });
      if (signal?.aborted || requestId !== fetchQuizzesRequestIdRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (signal?.aborted || requestId !== fetchQuizzesRequestIdRef.current) return;
        setQuizzes(data);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error("Failed to fetch quizzes:", err);
    } finally {
      if (
        updateLoading &&
        !signal?.aborted &&
        requestId === fetchQuizzesRequestIdRef.current
      ) {
        setLoading(false);
      }
    }
  };

  const createQuiz = async () => {
    if (!newTitle.trim()) return;
    setCreateError("");

    try {
      const res = await authedFetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDescription }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = Array.isArray(data?.error)
          ? data.error.map((e: { message?: string }) => e.message).join(", ")
          : data?.error;
        setCreateError(msg ? String(msg).slice(0, 200) : t("dashboard.createError"));
        return;
      }

      const quiz = data;
      setShowNewModal(false);
      setNewTitle("");
      setNewDescription("");
      router.push(`/infinarenapanel/quizzes/${quiz.id}`);
    } catch (err: any) {
      setCreateError(
        t("dashboard.createError") + (err?.message ? ` (${err.message})` : "")
      );
    }
  };

  const deleteQuiz = async (id: number) => {
    if (!confirm(t("dashboard.deleteConfirm"))) return;

    await authedFetch(`/api/quizzes/${id}`, { method: "DELETE" });
    await fetchQuizzes();
  };

  const statusColors: Record<string, string> = {
    draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    published: "bg-green-500/20 text-green-300 border-green-500/30",
    archived: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };

  const statusLabels: Record<string, string> = {
    draft: t("dashboard.status.draft"),
    published: t("dashboard.status.published"),
    archived: t("dashboard.status.archived"),
  };

  return (
    <div className="container-fluid px-0">
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3 mb-4 mb-md-5">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("dashboard.myQuizzes")}</h1>
          <p className="text-gray-400 mt-1">
            {t("dashboard.manageQuizzes")}
          </p>
        </div>
        <div className="d-flex gap-2 gap-md-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAIModal(true)}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all"
          >
            ✨ {t("ai.generateWithAI")}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNewModal(true)}
            className="bg-inf-green hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors"
          >
            {t("dashboard.newQuiz")}
          </motion.button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-10 h-10 border-4 border-white/20 border-t-inf-red rounded-full"
          />
        </div>
      ) : quizzes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="text-6xl mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {t("dashboard.noQuizzes")}
          </h2>
          <p className="text-gray-400 mb-6">
            {t("dashboard.createFirst")}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNewModal(true)}
            className="bg-inf-red hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl"
          >
            {t("dashboard.createFirstQuiz")}
          </motion.button>
        </motion.div>
      ) : (
        <div className="row g-3 g-lg-4">
          <AnimatePresence>
            {quizzes.map((quiz, i) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                className="col-12 col-md-6 col-xl-4"
              >
                <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden hover:border-white/20 transition-all group h-100">
                <div className="p-6">
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-white group-hover:text-inf-yellow transition-colors">
                      {quiz.title}
                    </h3>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full border ${statusColors[quiz.status]}`}
                    >
                      {statusLabels[quiz.status] || quiz.status}
                    </span>
                  </div>

                  {quiz.description && (
                    <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                      {quiz.description}
                    </p>
                  )}

                  <div className="d-flex align-items-center gap-4 text-sm text-gray-500">
                    <span>{quiz.questionCount} {t("dashboard.questions")}</span>
                  </div>
                </div>

                <div className="border-top border-white/10 px-6 py-3 d-flex align-items-center gap-2 flex-wrap">
                  <Link
                    href={`/infinarenapanel/quizzes/${quiz.id}`}
                    className="text-inf-blue hover:text-blue-300 text-sm font-medium transition-colors"
                  >
                    {t("dashboard.edit")}
                  </Link>
                  <span className="text-gray-600">|</span>
                  <Link
                    href={`/infinarenapanel/quizzes/${quiz.id}/publish`}
                    className="text-inf-green hover:text-green-300 text-sm font-medium transition-colors"
                  >
                    {t("dashboard.publish")}
                  </Link>
                  <span className="text-gray-600">|</span>
                  <Link
                    href={`/infinarenapanel/quizzes/${quiz.id}/results`}
                    className="text-inf-yellow hover:text-yellow-300 text-sm font-medium transition-colors"
                  >
                    {t("editor.results")}
                  </Link>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={() => deleteQuiz(quiz.id)}
                    className="text-inf-red hover:text-red-300 text-sm font-medium transition-colors"
                  >
                    {t("editor.delete")}
                  </button>
                </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* AI Generate Modal */}
      <AnimatePresence>
        {showAIModal && (
          <AIGenerateModal
            onClose={() => setShowAIModal(false)}
            onSuccess={(quizId: number) => {
              setShowAIModal(false);
              router.push(`/infinarenapanel/quizzes/${quizId}`);
            }}
          />
        )}
      </AnimatePresence>

      {/* New Quiz Modal */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm d-flex align-items-start justify-content-center z-50 p-3 p-md-4 overflow-y-auto"
            onClick={() => setShowNewModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-4 p-md-5 w-full border border-white/10 mt-2 mt-md-3"
              style={{ maxWidth: "560px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">
                {t("dashboard.newQuizTitle")}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    {t("editor.title")} *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="input-field bg-white/10"
                    placeholder={t("dashboard.newQuizTitle")}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    {t("editor.description")}
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="input-field bg-white/10 resize-none h-24"
                    placeholder={t("editor.description")}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 transition-colors font-medium"
                >
                  {t("dashboard.cancel")}
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={createQuiz}
                  disabled={!newTitle.trim()}
                  className="flex-1 bg-inf-red hover:bg-red-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {t("dashboard.create")}
                </motion.button>
              </div>
              {createError && (
                <p className="text-sm text-red-300 mt-3">{createError}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (En Güçlü)" },
  { id: "zai-org/GLM-4.7", name: "GLM-4.7" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B (En Hızlı)" },
];

const AI_TIME_LIMIT_MIN = 5;
const AI_TIME_LIMIT_MAX = 120;

function parseAiTimeLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < AI_TIME_LIMIT_MIN || parsed > AI_TIME_LIMIT_MAX) return null;
  return parsed;
}

function AIGenerateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (quizId: number) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [numQuestions, setNumQuestions] = useState(10);
  const [timeLimitDraft, setTimeLimitDraft] = useState("30");
  const [timeLimitTouched, setTimeLimitTouched] = useState(false);
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [language, setLanguage] = useState<"en" | "tr">(locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const parsedTimeLimit = parseAiTimeLimit(timeLimitDraft);
  const timeLimitError =
    timeLimitTouched && parsedTimeLimit === null
      ? t("ai.timeLimitRange", { min: AI_TIME_LIMIT_MIN, max: AI_TIME_LIMIT_MAX })
      : "";

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    if (parsedTimeLimit === null) {
      setTimeLimitTouched(true);
      setError(t("ai.timeLimitRange", { min: AI_TIME_LIMIT_MIN, max: AI_TIME_LIMIT_MAX }));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await authedFetch("/api/ai/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          difficulty,
          numQuestions,
          model,
          language,
          timeLimitSeconds: parsedTimeLimit,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail = data.details ? ` (${String(data.details).slice(0, 200)})` : "";
        setError((data.error || t("ai.error")) + detail);
        setLoading(false);
        return;
      }

      onSuccess(data.quiz.id);
    } catch (err: any) {
      setError(t("ai.error") + (err?.message ? ` (${err.message})` : ""));
      setLoading(false);
    }
  };

  const difficulties = [
    { key: "easy" as const, label: t("ai.difficultyEasy") },
    { key: "medium" as const, label: t("ai.difficultyMedium") },
    { key: "hard" as const, label: t("ai.difficultyHard") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm d-flex align-items-start justify-content-center z-50 p-3 p-md-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-2xl p-4 p-md-5 w-full border border-white/10 mt-2 mt-md-3"
        style={{ maxWidth: "560px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white mb-1">
          ✨ {t("ai.generateQuiz")}
        </h2>
        <p className="text-gray-400 text-sm mb-5">{t("ai.generatingDesc").replace("...", "")}</p>

        <div className="space-y-4">
          {/* Topic */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("ai.topic")} *
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="input-field bg-white/10"
              placeholder={t("ai.topicPlaceholder")}
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("ai.difficulty")}
            </label>
            <div className="d-flex gap-2">
              {difficulties.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDifficulty(d.key)}
                  disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    difficulty === d.key
                      ? d.key === "easy"
                        ? "bg-green-600 text-white"
                        : d.key === "medium"
                        ? "bg-yellow-600 text-white"
                        : "bg-red-600 text-white"
                      : "bg-white/10 text-white/60 hover:bg-white/20"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Number of Questions */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("ai.numQuestions")}
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
              className="input-field bg-white/10 w-full"
              disabled={loading}
            />
          </div>

          {/* Time Limit */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("editor.timeLimit")}
            </label>
            <input
              type="number"
              min={AI_TIME_LIMIT_MIN}
              max={AI_TIME_LIMIT_MAX}
              value={timeLimitDraft}
              onChange={(e) => {
                setTimeLimitDraft(e.target.value);
                setError("");
              }}
              onBlur={() => setTimeLimitTouched(true)}
              className="input-field bg-white/10 w-full"
              disabled={loading}
            />
            {timeLimitError && (
              <p className="text-xs text-red-300 mt-1">{timeLimitError}</p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("ai.model")}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input-field bg-white/10 w-full"
              disabled={loading}
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("ai.language")}
            </label>
            <div className="d-flex gap-2">
              <button
                onClick={() => setLanguage("en")}
                disabled={loading}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  language === "en"
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage("tr")}
                disabled={loading}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  language === "tr"
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                Türkçe
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
            {error}
            <p className="text-red-400/70 text-xs mt-1">{t("ai.errorRetry")}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 transition-colors font-medium disabled:opacity-50"
          >
            {t("ai.cancel")}
          </button>
          <motion.button
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            onClick={handleGenerate}
            disabled={!topic.trim() || loading || parsedTimeLimit === null}
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-all d-flex align-items-center justify-content-center gap-2"
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
                {t("ai.generating")}
              </>
            ) : (
              <>✨ {t("ai.generate")}</>
            )}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
