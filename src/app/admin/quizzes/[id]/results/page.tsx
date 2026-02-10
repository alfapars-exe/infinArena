"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function ResultsPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const quizId = params?.id ?? "";
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  useEffect(() => {
    fetchResults();
  }, [quizId]);

  const fetchResults = async () => {
    const res = await fetch(`/api/quizzes/${quizId}/results`);
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
      if (data.length > 0) setSelectedSession(data[0]);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-4 border-white/20 border-t-inf-red rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <div className="mx-auto" style={{ maxWidth: "1200px" }}>
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3 mb-4 mb-md-5">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("results.title")}</h1>
          <p className="text-gray-400 mt-1">
            {t("results.subtitle")}
          </p>
        </div>
        <Link
          href={`/infinarenapanel/quizzes/${quizId}`}
          className="text-inf-blue hover:text-blue-300 text-sm font-medium"
        >
          {t("results.backToEditor")}
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-white mb-2">{t("results.noResults")}</h2>
          <p className="text-gray-400">
            {t("results.runQuiz")}
          </p>
        </div>
      ) : (
        <div className="row g-3 g-lg-4">
          {/* Session selector */}
          <div className="col-12 col-lg-4 col-xl-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
              {t("results.sessions")}
            </h2>
            <div className="space-y-2">
              {sessions.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSession(s);
                    setSelectedPlayer(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedSession?.id === s.id
                      ? "bg-inf-red/20 border border-inf-red"
                      : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-mono font-bold">
                      {t("results.pin")}: {s.pin}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "completed"
                          ? "bg-green-500/20 text-green-300"
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    {t("results.playersCount", { count: s.players?.length || 0 })}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Player scores */}
          <div className="col-12 col-lg-8 col-xl-9">
            {selectedSession && (
              <>
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
                  {t("results.leaderboardPin", { pin: selectedSession.pin })}
                </h2>

                <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden table-responsive">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/60 text-sm font-medium p-4">
                          {t("results.rank")}
                        </th>
                        <th className="text-left text-white/60 text-sm font-medium p-4">
                          {t("results.player")}
                        </th>
                        <th className="text-right text-white/60 text-sm font-medium p-4">
                          {t("results.score")}
                        </th>
                        <th className="text-right text-white/60 text-sm font-medium p-4">
                          {t("results.correctCount")}
                        </th>
                        <th className="text-right text-white/60 text-sm font-medium p-4">
                          {t("results.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSession.players?.map(
                        (p: any, i: number) => (
                          <tr
                            key={p.id}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          >
                            <td className="p-4">
                              <span
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  i === 0
                                    ? "bg-yellow-500 text-black"
                                    : i === 1
                                    ? "bg-gray-400 text-black"
                                    : i === 2
                                    ? "bg-amber-700 text-white"
                                    : "bg-white/10 text-white"
                                }`}
                              >
                                {i + 1}
                              </span>
                            </td>
                            <td className="p-4 text-white font-medium">
                              {p.nickname}
                            </td>
                            <td className="p-4 text-right text-white font-bold">
                              {p.totalScore.toLocaleString()}
                            </td>
                            <td className="p-4 text-right text-gray-400">
                              {p.correctCount}/{p.totalQuestions}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() =>
                                  setSelectedPlayer(
                                    selectedPlayer?.id === p.id ? null : p
                                  )
                                }
                                className="text-inf-blue hover:text-blue-300 text-sm font-medium"
                              >
                                {selectedPlayer?.id === p.id
                                  ? t("results.hide")
                                  : t("results.details")}
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Player detail */}
                <AnimatePresence>
                  {selectedPlayer && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 bg-white/5 rounded-2xl border border-white/10 p-6 overflow-hidden"
                    >
                      <h3 className="text-lg font-bold text-white mb-4">
                        {selectedPlayer.nickname} - {t("results.answerDetails")}
                      </h3>
                      <div className="space-y-2">
                        {selectedPlayer.answers?.map(
                          (a: any, i: number) => (
                            <div
                              key={a.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                a.isCorrect
                                  ? "bg-green-500/10 border border-green-500/20"
                                  : "bg-red-500/10 border border-red-500/20"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`text-lg ${
                                    a.isCorrect
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {a.isCorrect ? "✓" : "✗"}
                                </span>
                                <div>
                                  <p className="text-white text-sm font-medium">
                                    {a.questionText}
                                  </p>
                                  <p className="text-gray-400 text-xs">
                                    {t("results.answer")}: {a.choiceText}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-white font-bold text-sm">
                                  +{a.pointsAwarded}
                                </p>
                                <p className="text-gray-500 text-xs">
                                  {(a.responseTimeMs / 1000).toFixed(1)}{t("results.secondsShort")}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}



