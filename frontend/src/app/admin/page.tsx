"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslation, useI18n } from "@/lib/i18n";
import { authedFetch } from "@/lib/services/auth-client";
import { useQuizzes, useCreateQuiz, useDeleteQuiz } from "@/lib/hooks/use-quizzes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { data: quizzes = [], isLoading: loading } = useQuizzes();
  const createQuizMutation = useCreateQuiz();
  const deleteQuizMutation = useDeleteQuiz();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const [showAIModal, setShowAIModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const router = useRouter();

  const createQuiz = async () => {
    if (!newTitle.trim()) return;
    setCreateError("");

    try {
      const quiz = await createQuizMutation.mutateAsync({
        title: newTitle,
        description: newDescription,
      });
      setShowNewModal(false);
      setNewTitle("");
      setNewDescription("");
      toast.success(t("dashboard.newQuizTitle"));
      router.push(`/infinarenapanel/quizzes/${quiz.id}`);
    } catch (err: any) {
      setCreateError(
        err?.message || t("dashboard.createError")
      );
    }
  };

  const deleteQuiz = async (id: number) => {
    try {
      await deleteQuizMutation.mutateAsync(id);
      setDeleteTarget(null);
      toast.success(t("editor.delete"));
    } catch {
      toast.error(t("dashboard.createError"));
    }
  };

  const statusVariants: Record<string, "warning" | "success" | "muted"> = {
    draft: "warning",
    published: "success",
    archived: "muted",
  };

  const statusLabels: Record<string, string> = {
    draft: t("dashboard.status.draft"),
    published: t("dashboard.status.published"),
    archived: t("dashboard.status.archived"),
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4 md:mb-5">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("dashboard.myQuizzes")}</h1>
          <p className="text-gray-400 mt-1">
            {t("dashboard.manageQuizzes")}
          </p>
        </div>
        <div className="flex gap-2 md:gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          <AnimatePresence>
            {quizzes.map((quiz, i) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden hover:border-white/20 transition-all group h-full">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-white group-hover:text-inf-yellow transition-colors">
                      {quiz.title}
                    </h3>
                    <Badge variant={statusVariants[quiz.status] || "muted"}>
                      {statusLabels[quiz.status] || quiz.status}
                    </Badge>
                  </div>

                  {quiz.description && (
                    <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                      {quiz.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{quiz.questionCount} {t("dashboard.questions")}</span>
                  </div>
                </div>

                <div className="border-t border-white/10 px-6 py-3 flex items-center gap-2 flex-wrap">
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
                    onClick={() => setDeleteTarget(quiz.id)}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboard.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dashboard.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteQuiz(deleteTarget)}
              className="bg-inf-red hover:bg-red-700"
            >
              {t("editor.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.newQuizTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>
                {t("editor.title")} *
              </Label>
              <Input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-white/10"
                placeholder={t("dashboard.newQuizTitle")}
                autoFocus
              />
            </div>

            <div>
              <Label>
                {t("editor.description")}
              </Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="bg-white/10 resize-none h-24"
                placeholder={t("editor.description")}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowNewModal(false)}
              className="flex-1"
            >
              {t("dashboard.cancel")}
            </Button>
            <Button
              onClick={createQuiz}
              disabled={!newTitle.trim()}
              className="flex-1"
            >
              {t("dashboard.create")}
            </Button>
          </DialogFooter>
          {createError && (
            <p className="text-sm text-red-300 mt-1">{createError}</p>
          )}
        </DialogContent>
      </Dialog>
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-3 md:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-2xl p-4 md:p-5 w-full border border-white/10 mt-2 md:mt-3"
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
            <Label>
              {t("ai.topic")} *
            </Label>
            <Input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-white/10"
              placeholder={t("ai.topicPlaceholder")}
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Difficulty */}
          <div>
            <Label>
              {t("ai.difficulty")}
            </Label>
            <div className="flex gap-2">
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
            <Label>
              {t("ai.numQuestions")}
            </Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
              className="bg-white/10 w-full"
              disabled={loading}
            />
          </div>

          {/* Time Limit */}
          <div>
            <Label>
              {t("editor.timeLimit")}
            </Label>
            <Input
              type="number"
              min={AI_TIME_LIMIT_MIN}
              max={AI_TIME_LIMIT_MAX}
              value={timeLimitDraft}
              onChange={(e) => {
                setTimeLimitDraft(e.target.value);
                setError("");
              }}
              onBlur={() => setTimeLimitTouched(true)}
              className="bg-white/10 w-full"
              disabled={loading}
            />
            {timeLimitError && (
              <p className="text-xs text-red-300 mt-1">{timeLimitError}</p>
            )}
          </div>

          {/* Model */}
          <div>
            <Label>
              {t("ai.model")}
            </Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-11 w-full rounded-lg bg-white/10 border border-white/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-inf-turquoise/50 focus:border-transparent transition-all"
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
            <Label>
              {t("ai.language")}
            </Label>
            <div className="flex gap-2">
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
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2"
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
