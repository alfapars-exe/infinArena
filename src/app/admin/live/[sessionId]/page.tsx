"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { useTranslation } from "@/lib/i18n";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  QuestionPayload,
  PlayerRanking,
  QuestionStats,
} from "@/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CHOICE_COLORS = [
  "bg-inf-red",
  "bg-inf-blue",
  "bg-inf-yellow",
  "bg-inf-green",
  "bg-purple-700",
  "bg-teal-700",
  "bg-orange-700",
  "bg-slate-600",
];
const CHOICE_SHAPES = ["A", "B", "C", "D"];

function getChoiceColor(index: number): string {
  return CHOICE_COLORS[index % CHOICE_COLORS.length];
}

function getChoiceShape(index: number): string {
  return CHOICE_SHAPES[index % CHOICE_SHAPES.length];
}

type Phase = "pre-live" | "lobby" | "countdown" | "question" | "stats" | "leaderboard" | "ended";

export default function LiveControlPage() {
  const { t } = useTranslation();
  const params = useParams<{ sessionId: string }>();
  const pin = params?.sessionId ?? "";

  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("pre-live");
  const [lobbyPlayers, setLobbyPlayers] = useState<
    { id: number; nickname: string; avatar: string }[]
  >([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionPayload | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<PlayerRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<PlayerRanking[]>([]);
  const [quizTitle, setQuizTitle] = useState(t("live.quizDefault"));
  const [countdownNumber, setCountdownNumber] = useState(0);
  const [notifications, setNotifications] = useState<
    { id: number; message: string }[]
  >([]);


  const pushNotification = (message: string) => {
    const id = Date.now();
    setNotifications((prev) => [ { id, message }, ...prev ].slice(0, 5));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  // Fetch session info
  useEffect(() => {
    fetch(`/api/sessions/${pin}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) {
          setSessionId(data.sessionId);
          setQuizTitle(data.quizTitle);
          if (data.isLive) {
            setPhase("lobby");
          }
        }
      });
  }, [pin]);

  // Socket connection
  useEffect(() => {
    const s: TypedSocket = io({ path: "/api/socketio" });
    setSocket(s);

    s.on("connect", () => {
      if (sessionId) {
        s.emit("admin:join-session", { sessionId });
      }
    });

    s.on("session:live", () => {
      setPhase("lobby");
    });

    s.on("lobby:player-joined", ({ playerId, nickname, avatar, playerCount: count }) => {
      setLobbyPlayers((prev) => [...prev, { id: playerId, nickname, avatar }]);
      setPlayerCount(count);
    });

    s.on("lobby:player-left", ({ playerId, playerCount: count }) => {
      setLobbyPlayers((prev) => prev.filter((p) => p.id !== playerId));
      setPlayerCount(count);
    });

    s.on("lobby:player-left", ({ nickname }) => {
      pushNotification(
        t("live.playerDisconnected", {
          name: nickname || t("live.unknownPlayer"),
        })
      );
    });

    s.on("game:countdown", ({ count }) => {
      setCountdownNumber(count);
      setPhase("countdown");
    });

    s.on("game:question-start", ({ question, questionNumber: qn, totalQuestions: tq, serverStartTime }) => {
      setCurrentQuestion(question);
      setQuestionNumber(qn);
      setTotalQuestions(tq);
      setPhase("question");
      setStats(null);
      startSyncedTimer(serverStartTime, question.timeLimitSeconds);
    });

    s.on("game:time-up", () => {
      setTimeLeft(0);
      if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    });

    s.on("game:question-stats", (data) => {
      setStats(data);
      setPhase("stats");
    });

    s.on("game:leaderboard", ({ rankings }) => {
      setLeaderboard(rankings);
      setPhase("leaderboard");
    });

    s.on("game:quiz-ended", ({ finalRankings: fr }) => {
      setFinalRankings(fr);
      setPhase("ended");
    });

    s.on("error", (data) => {
      const message =
        typeof data === "string"
          ? data
          : data?.message || t("live.unexpectedError");
      window.alert(message);
      pushNotification(message);
    });

    return () => {
      s.disconnect();
    };
  }, [sessionId]);

  // Join session when sessionId is available
  useEffect(() => {
    if (socket && sessionId) {
      socket.emit("admin:join-session", { sessionId });
    }
  }, [socket, sessionId]);

  // Server-synced timer refs
  const serverEndTimeRef = useRef<number>(0);
  const timerRafRef = useRef<number>(0);

  const startSyncedTimer = useCallback((serverStart: number, timeLimitSeconds: number) => {
    if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    serverEndTimeRef.current = serverStart + timeLimitSeconds * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((serverEndTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0) {
        timerRafRef.current = requestAnimationFrame(tick);
      }
    };
    timerRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    };
  }, []);


  const startLive = () => {
    if (socket && sessionId) {
      socket.emit("admin:start-live", { sessionId });
    }
  };

  const startQuiz = () => {
    if (socket && sessionId) {
      socket.emit("admin:start-quiz", { sessionId });
    }
  };

  const nextQuestion = () => {
    if (socket && sessionId) {
      socket.emit("admin:next-question", { sessionId });
    }
  };

  const endQuiz = () => {
    if (socket && sessionId) {
      socket.emit("admin:end-quiz", { sessionId });
    }
  };

  const questionBackgroundStyle =
    phase === "question" && currentQuestion?.backgroundUrl
      ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.6)), url(${currentQuestion.backgroundUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black p-3 p-md-4"
      style={questionBackgroundStyle}
    >
      <div className="container-fluid app-container px-0">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white">{quizTitle}</h1>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-2">
            <span className="bg-white/20 text-white px-4 py-1 rounded-full text-sm font-medium">
              {t("live.pinCode")}: {pin}
            </span>
            <span className="text-white/60 text-sm">
              {playerCount} {t("live.players")}
            </span>
            
          </div>
        </div>

        <div className="position-fixed end-0 top-0 translate-middle-y-0 z-50 w-100 px-3 px-md-4 space-y-2" style={{ maxWidth: "360px", marginTop: "80px" }}>
          <AnimatePresence>
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-inf-red/90 text-white text-sm rounded-lg px-3 py-2 shadow-lg border border-white/20"
              >
                {n.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Pre-live: admin must click Start Live first */}
        {phase === "pre-live" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 p-md-5 mb-4 mb-md-6">
              <h2 className="text-2xl font-bold text-white mb-4">
                {t("live.readyToGoLive")}
              </h2>
              <p className="text-white/60 mb-2">
                {t("live.pinCode")}: <span className="text-4xl font-black text-white">{pin}</span>
              </p>
              <p className="text-white/40 text-sm mb-8">
                {t("live.playersCannotJoin")}
              </p>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startLive}
                className="bg-inf-green hover:bg-green-700 text-white font-bold py-4 px-12 rounded-xl text-xl transition-colors shadow-xl"
              >
                {t("live.startLive")}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Lobby */}
        {phase === "lobby" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 p-md-5 mb-4 mb-md-6">
              <h2 className="text-2xl font-bold text-white mb-4">
                {t("live.waitingForPlayers")}
              </h2>
              <p className="text-white/60 mb-6">
                {t("live.sharePinCode")}:{" "}
                <span className="text-3xl font-black text-white">{pin}</span>
              </p>

              <div className="flex flex-wrap gap-2 justify-center mb-8">
                <AnimatePresence>
                  {lobbyPlayers.map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="bg-inf-green/30 text-white px-4 py-2 rounded-full text-sm font-medium border border-green-500/30 flex items-center gap-1"
                    >
                      <span>{p.avatar}</span>
                      {p.nickname}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startQuiz}
                disabled={playerCount === 0}
                className="bg-inf-red hover:bg-red-700 text-white font-bold py-4 px-12 rounded-xl text-xl disabled:opacity-50 transition-colors shadow-xl"
              >
                {t("live.startQuiz")}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* 3-2-1 Countdown */}
        {phase === "countdown" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-20"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={countdownNumber}
                initial={{ scale: 3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="text-center"
              >
                <div
                  className={`text-[14rem] font-black leading-none ${
                    countdownNumber === 3
                      ? "text-inf-red"
                      : countdownNumber === 2
                      ? "text-inf-yellow"
                      : "text-inf-green"
                  }`}
                >
                  {countdownNumber}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Question Display */}
        {phase === "question" && currentQuestion && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-4"
          >
            <div className="text-center mb-6">
              <span className="text-white/60 text-sm">
                {t("live.questionOf", { current: questionNumber, total: totalQuestions })}
              </span>
            </div>

            {/* Timer */}
            <div className="flex justify-center mb-6">
              <motion.div
                className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black border-4 ${
                  timeLeft > 10
                    ? "border-green-400 text-green-400"
                    : timeLeft > 5
                    ? "border-yellow-400 text-yellow-400"
                    : "border-red-400 text-red-400"
                }`}
                animate={timeLeft <= 5 ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                {timeLeft}
              </motion.div>
            </div>

            {/* Question Text + Media */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-6 text-center">
              {currentQuestion.mediaUrl && (
                <img
                  src={currentQuestion.mediaUrl}
                  alt="Question media"
                  className="w-full max-w-4xl max-h-[420px] mx-auto mb-5 rounded-xl object-contain"
                />
              )}
              <h2 className="text-3xl font-bold text-white">
                {currentQuestion.questionText}
              </h2>
            </div>

            {/* Choices */}
            <div className="grid grid-cols-2 gap-4">
              {currentQuestion.choices.map((c, i) => (
                <div
                  key={c.id}
                  className={`${getChoiceColor(i)} rounded-xl p-6 flex items-center gap-4`}
                >
                  <span className="text-xl font-bold text-white">{c.choiceText}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Stats */}
        {phase === "stats" && stats && currentQuestion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">{t("live.answerDistribution")}</h2>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
              <div className="flex items-end justify-center gap-4 h-64">
                {currentQuestion.choices.map((c, i) => {
                  const count = stats.choiceCounts[c.id] || 0;
                  const maxCount = Math.max(...Object.values(stats.choiceCounts), 1);
                  const height = (count / maxCount) * 100;

                  return (
                    <div key={c.id} className="flex flex-col items-center gap-2 flex-1">
                      <span className="text-white font-bold text-lg">{count}</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(height, 5)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`${getChoiceColor(i)} w-full rounded-t-lg ${
                          c.id === stats.correctChoiceId ? "ring-4 ring-white" : ""
                        }`}
                      />
                      <span className={`text-sm font-medium truncate max-w-full ${
                        (stats.correctChoiceIds || []).includes(c.id) || c.id === stats.correctChoiceId
                          ? "text-green-400 font-bold"
                          : "text-white/60"
                      }`}>
                        {((stats.correctChoiceIds || []).includes(c.id) || c.id === stats.correctChoiceId) && "✓ "}
                        {c.choiceText}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-white/60">
                {stats.correctCount} / {stats.totalPlayers} {t("live.correct")}
              </div>
              <div className="mt-1 text-white/60 text-sm">
                {t("live.answeredStatus", {
                  answered: stats.answeredCount,
                  total: stats.totalPlayers,
                })}
              </div>
              <div className="mt-1 text-white/60 text-sm">
                {t("live.remainingQuestions", { count: stats.remainingQuestions })}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={nextQuestion}
              className="bg-inf-blue hover:bg-blue-700 text-white font-bold py-4 px-12 rounded-xl text-xl transition-colors shadow-xl"
            >
              {questionNumber < totalQuestions ? t("live.nextQuestion") : t("live.showResults")}
            </motion.button>
          </motion.div>
        )}

        {/* Leaderboard */}
        {phase === "leaderboard" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">{t("live.leaderboard")}</h2>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 max-w-lg mx-auto">
              {leaderboard.slice(0, 5).map((p, i) => (
                <motion.div
                  key={p.playerId}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between p-3 border-b border-white/10 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        i === 0
                          ? "bg-yellow-500 text-black"
                          : i === 1
                          ? "bg-gray-400 text-black"
                          : i === 2
                          ? "bg-amber-700 text-white"
                          : "bg-white/20 text-white"
                      }`}
                    >
                      {p.rank}
                    </span>
                    <span className="text-xl">{p.avatar}</span>
                    <span className="text-white font-medium">{p.nickname}</span>
                    {(p.streak || 0) >= 3 && (
                      <span className="text-sm text-orange-400">🔥{p.streak}</span>
                    )}
                  </div>
                  <span className="text-white font-bold">
                    {p.totalScore.toLocaleString()}
                  </span>
                </motion.div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={nextQuestion}
              className="bg-inf-green hover:bg-green-700 text-white font-bold py-4 px-12 rounded-xl text-xl transition-colors shadow-xl"
            >
              {questionNumber < totalQuestions ? t("live.nextQuestion") : t("live.showResults")}
            </motion.button>
          </motion.div>
        )}

        {/* Final Results */}
        {phase === "ended" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <motion.h2
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="text-4xl font-black text-white mb-8"
            >
              {t("live.finalResults")}
            </motion.h2>

            {/* Podium */}
            <div className="flex items-end justify-center gap-4 mb-8">
              {finalRankings.length > 1 && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center"
                >
                  <div className="text-3xl mb-1">{finalRankings[1].avatar}</div>
                  <div className="text-white font-bold mb-2">
                    {finalRankings[1].nickname}
                  </div>
                  <div className="bg-gray-400 w-32 rounded-t-lg p-4 h-32 flex items-center justify-center">
                    <div>
                      <div className="text-2xl font-black text-black">{t("live.rank2")}</div>
                      <div className="text-black/70 text-sm font-bold">
                        {finalRankings[1].totalScore.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {finalRankings.length > 0 && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl mb-1">{finalRankings[0].avatar}</div>
                  <div className="text-white font-bold mb-2">
                    {finalRankings[0].nickname}
                  </div>
                  <div className="bg-yellow-500 w-36 rounded-t-lg p-4 h-44 flex items-center justify-center">
                    <div>
                      <div className="text-3xl font-black text-black">{t("live.rank1")}</div>
                      <div className="text-black/70 font-bold">
                        {finalRankings[0].totalScore.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {finalRankings.length > 2 && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-center"
                >
                  <div className="text-2xl mb-1">{finalRankings[2].avatar}</div>
                  <div className="text-white font-bold mb-2">
                    {finalRankings[2].nickname}
                  </div>
                  <div className="bg-amber-700 w-28 rounded-t-lg p-4 h-24 flex items-center justify-center">
                    <div>
                      <div className="text-xl font-black text-white">{t("live.rank3")}</div>
                      <div className="text-white/70 text-sm font-bold">
                        {finalRankings[2].totalScore.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Full list */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 max-w-lg mx-auto">
              {finalRankings.map((p, i) => (
                <motion.div
                  key={p.playerId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  className="flex items-center justify-between p-3 border-b border-white/10 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white/60 font-bold w-6">{p.rank}</span>
                    <span className="text-xl">{p.avatar}</span>
                    <span className="text-white font-medium">{p.nickname}</span>
                  </div>
                  <span className="text-white font-bold">
                    {p.totalScore.toLocaleString()}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}


