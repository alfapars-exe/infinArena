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
import { MagicCard } from "@/components/ui/magic-card";
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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center py-20 px-4 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm max-w-2xl mx-auto mt-10"
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="text-7xl mb-6 drop-shadow-2xl"
          >
            🎯
          </motion.div>
          <h2 className="text-3xl font-black text-white mb-3 tracking-tight">
            {t("dashboard.noQuizzes")}
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            {t("dashboard.createFirst")}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNewModal(true)}
            className="bg-gradient-to-r from-inf-red to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold py-4 px-10 rounded-2xl shadow-xl transition-all"
          >
            {t("dashboard.createFirstQuiz")}
          </motion.button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          <AnimatePresence>
            {quizzes.map((quiz, i) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                className="h-full"
              >
                <MagicCard gradientColor="rgba(251, 182, 21, 0.15)">
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-xl font-black text-white group-hover:text-inf-yellow transition-colors tracking-tight">
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

                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-auto pt-2">
                      <span className="font-semibold text-white/50">{quiz.questionCount} {t("dashboard.questions")}</span>
                    </div>
                  </div>

                  <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between gap-2 flex-wrap bg-white/[0.02]">
                    <Link
                      href={`/infinarenapanel/quizzes/${quiz.id}`}
                      className="text-inf-blue hover:text-blue-400 text-sm font-bold transition-colors flex items-center gap-1"
                    >
                      {t("dashboard.edit")}
                    </Link>
                    <Link
                      href={`/infinarenapanel/quizzes/${quiz.id}/publish`}
                      className="text-inf-green hover:text-green-400 text-sm font-bold transition-colors flex items-center gap-1"
                    >
                      {t("dashboard.publish")}
                    </Link>
                    <Link
                      href={`/infinarenapanel/quizzes/${quiz.id}/results`}
                      className="text-inf-yellow hover:text-yellow-400 text-sm font-bold transition-colors flex items-center gap-1"
                    >
                      {t("editor.results")}
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(quiz.id)}
                      className="text-inf-red hover:text-red-400 text-sm font-bold transition-colors flex items-center gap-1"
                    >
                      {t("editor.delete")}
                    </button>
                  </div>
                </MagicCard>
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
        className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full border border-white/10 mt-2 md:mt-3 shadow-2xl"
        style={{ maxWidth: "560px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
          ✨ {t("ai.generateQuiz")}
        </h2>
        <p className="text-gray-400 text-sm mb-6">{t("ai.generatingDesc").replace("...", "")}</p>

        <div className="space-y-5">
          {/* Topic */}
          <div>
            <Label className="text-white/80 font-medium mb-1.5 block">
              {t("ai.topic")} *
            </Label>
            <Input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-white/5 border-white/10 text-white rounded-xl focus:border-inf-blue transition-colors px-4 py-6"
              placeholder={t("ai.topicPlaceholder")}
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Difficulty */}
          <div>
            <Label className="text-white/80 font-medium mb-1.5 block">
              {t("ai.difficulty")}
            </Label>
            <div className="flex gap-2">
              {difficulties.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDifficulty(d.key)}
                  disabled={loading}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d.key
                      ? d.key === "easy"
                        ? "bg-inf-green text-white shadow-lg shadow-inf-green/20"
                        : d.key === "medium"
                          ? "bg-inf-yellow text-white shadow-lg shadow-inf-yellow/20"
                          : "bg-inf-red text-white shadow-lg shadow-inf-red/20"
                      : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                    }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Number of Questions */}
            <div>
              <Label className="text-white/80 font-medium mb-1.5 block">
                {t("ai.numQuestions")}
              </Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                className="bg-white/5 border-white/10 text-white rounded-xl py-6"
                disabled={loading}
              />
            </div>

            {/* Time Limit */}
            <div>
              <Label className="text-white/80 font-medium mb-1.5 block">
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
                className="bg-white/5 border-white/10 text-white rounded-xl py-6"
                disabled={loading}
              />
              {timeLimitError && (
                <p className="text-xs text-red-400 mt-2 font-medium">{timeLimitError}</p>
              )}
            </div>
          </div>

          {/* Model */}
          <div>
            <Label className="text-white/80 font-medium mb-1.5 block">
              {t("ai.model")}
            </Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-[52px] w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-inf-blue/50 focus:border-transparent transition-all"
              disabled={loading}
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-gray-800">
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <Label className="text-white/80 font-medium mb-1.5 block">
              {t("ai.language")}
            </Label>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage("en")}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${language === "en"
                    ? "bg-inf-blue text-white shadow-lg shadow-inf-blue/20"
                    : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                  }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage("tr")}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${language === "tr"
                    ? "bg-inf-blue text-white shadow-lg shadow-inf-blue/20"
                    : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                  }`}
              >
                Türkçe
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
            >
              <p className="text-red-400 font-medium text-sm">{error}</p>
              <p className="text-red-400/60 text-xs mt-1">{t("ai.errorRetry")}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-4 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 hover:text-white transition-all font-bold disabled:opacity-50"
          >
            {t("ai.cancel")}
          </button>
          <motion.button
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            onClick={handleGenerate}
            disabled={!topic.trim() || loading || parsedTimeLimit === null}
            className="flex-[2] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black py-4 rounded-xl disabled:opacity-50 transition-all shadow-xl shadow-pink-900/20 flex items-center justify-center gap-2"
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
