"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

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
  const router = useRouter();

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    const res = await fetch("/api/quizzes");
    if (res.ok) {
      const data = await res.json();
      setQuizzes(data);
    }
    setLoading(false);
  };

  const createQuiz = async () => {
    if (!newTitle.trim()) return;

    const res = await fetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, description: newDescription }),
    });

    if (res.ok) {
      const quiz = await res.json();
      setShowNewModal(false);
      setNewTitle("");
      setNewDescription("");
      router.push(`/infinarenapanel/quizzes/${quiz.id}`);
    }
  };

  const deleteQuiz = async (id: number) => {
    if (!confirm(t("dashboard.deleteConfirm"))) return;

    await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    fetchQuizzes();
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
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNewModal(true)}
          className="bg-inf-green hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors"
        >
          {t("dashboard.newQuiz")}
        </motion.button>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



