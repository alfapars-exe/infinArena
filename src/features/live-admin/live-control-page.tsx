"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { useTranslation } from "@/lib/i18n";
import { ConnectionStatusOverlay } from "@/components/live/connection-status-overlay";
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
const MUSIC_STORAGE_KEY = "infinarena:music";

type StoredMusic = {
  youtubeVideoId?: string | null;
  volume?: number;
  isRepeat?: boolean;
  isPlaying?: boolean;
};

function getChoiceColor(index: number): string {
  return CHOICE_COLORS[index % CHOICE_COLORS.length];
}

function getChoiceShape(index: number): string {
  return CHOICE_SHAPES[index % CHOICE_SHAPES.length];
}

function isCorrectChoice(
  stats: Pick<QuestionStats, "correctChoiceId" | "correctChoiceIds">,
  choiceId: number
): boolean {
  const normalizedChoiceId = Number(choiceId);
  if (Number(stats.correctChoiceId) === normalizedChoiceId) return true;
  return (stats.correctChoiceIds || []).some(
    (id) => Number(id) === normalizedChoiceId
  );
}

type Phase = "lobby" | "countdown" | "question" | "stats" | "leaderboard" | "ended";

export default function LiveControlPage() {
  const { t } = useTranslation();
  const params = useParams<{ sessionId: string }>();
  const pin = params?.sessionId ?? "";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPageInitialLoadRef = useRef(true);
  const socketConnectedAtLeastOnceRef = useRef(false);

  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>("lobby");
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
  const [musicVideoId, setMusicVideoId] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(50);
  const [musicIsRepeat, setMusicIsRepeat] = useState(false);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);

  const pushNotification = (message: string) => {
    const id = Date.now();
    setNotifications((prev) => [ { id, message }, ...prev ].slice(0, 5));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    fetch(`/api/sessions/${pin}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) {
          setSessionId(data.sessionId);
          setQuizTitle(data.quizTitle);
          setPhase("lobby");
          void fetch(`/api/sessions/${pin}/live`, { method: "POST" });
        }
      });
  }, [pin]);

  useEffect(() => {
    const s: TypedSocket = io({ path: "/api/socketio" });
    setSocket(s);

    s.on("connect", () => {
      setIsConnected(true);
      socketConnectedAtLeastOnceRef.current = true;
      isPageInitialLoadRef.current = false;
      if (sessionId) {
        s.emit("admin:join-session", { sessionId });
        s.emit("admin:start-live", { sessionId });
      }
    });

    s.on("disconnect", () => {
      setIsConnected(false);
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

  useEffect(() => {
    if (socket && sessionId) {
      socket.emit("admin:join-session", { sessionId });
      socket.emit("admin:start-live", { sessionId });
    }
  }, [socket, sessionId]);

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

  const toggleMusicPlay = () => {
    setMusicIsPlaying((prev) => !prev);
  };

  const changeMusicVolume = (volume: number) => {
    setMusicVolume(volume);
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

  const getAnswerLabel = (
    player: QuestionStats["answeredPlayers"][number]
  ): string => {
    if (player.textAnswer) return player.textAnswer;
    if (player.orderedChoiceTexts.length > 0) {
      return player.orderedChoiceTexts.join(" > ");
    }
    if (player.selectedChoiceTexts.length > 0) {
      return player.selectedChoiceTexts.join(", ");
    }
    return "-";
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
      className="min-h-[100dvh] bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black p-3 p-md-4"
      style={questionBackgroundStyle}
    >
      <div className="container-fluid app-container px-0">
        
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
          {musicVideoId && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-white/80">
              <div className="hidden">
                <div id="yt-player-live" />
              </div>
              <button
                onClick={toggleMusicPlay}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg ${
                  musicIsPlaying
                    ? "bg-gradient-to-br from-inf-red to-rose-600 hover:from-red-700 hover:to-rose-700 text-white"
                    : "bg-gradient-to-br from-inf-turquoise to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
                }`}
                aria-label={musicIsPlaying ? t("live.pause") : t("live.play")}
                title={musicIsPlaying ? t("live.pause") : t("live.play")}
              >
                {musicIsPlaying ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l10-6.5-10-6.5z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setMusicIsRepeat(!musicIsRepeat)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg ${
                  musicIsRepeat
                    ? "bg-gradient-to-br from-inf-yellow to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white"
                    : "bg-white/20 hover:bg-white/30 text-white/60 hover:text-white"
                }`}
                aria-label={t("live.loop")}
                title={t("live.loop")}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M3 12a7 7 0 0 1 7-7h7" />
                  <path d="M17 2l4 3-4 3" />
                  <path d="M21 12a7 7 0 0 1-7 7H7" />
                  <path d="M7 22l-4-3 4-3" />
                </svg>
              </button>
              <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-full">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/70" fill="currentColor" aria-hidden="true">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.7c2.89.86 5 3.54 5 6.9s-2.11 6.04-5 6.9v2.7c4.01-.91 7-4.49 7-9.6s-2.99-8.69-7-9.6z" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={musicVolume}
                  onChange={(e) => changeMusicVolume(Number(e.target.value))}
                  className="h-2 w-20 accent-inf-turquoise cursor-pointer"
                  aria-label={t("live.volume")}
                  title={`${t("live.volume")}: ${musicVolume}%`}
                />
                <span className="text-white/70 text-xs font-medium min-w-6">{musicVolume}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="position-fixed end-0 top-0 translate-middle-y-0 z-50 w-100 px-3 px-md-4 space-y-2" style={{ maxWidth: "min(360px, calc(100vw - 1rem))", marginTop: "80px" }}>
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

                <ConnectionStatusOverlay
          isVisible={!isConnected || isPending}
          title={
            isPending
              ? t("common.pleaseWait")
              : isPageInitialLoadRef.current || !socketConnectedAtLeastOnceRef.current
              ? t("common.reconnecting")
              : t("live.maintenanceMode")
          }
          subtitle={
            isPending
              ? t("common.pageLoading")
              : isPageInitialLoadRef.current || !socketConnectedAtLeastOnceRef.current
              ? t("common.connecting")
              : t("live.reconnecting")
          }
          hint={t("live.pleaseWait")}
        />
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
                className="bg-inf-red hover:bg-red-700 text-white font-bold py-3 md:py-4 px-6 md:px-12 rounded-xl text-lg md:text-xl disabled:opacity-50 transition-colors shadow-xl"
              >
                {t("live.startQuiz")}
              </motion.button>
            </div>
          </motion.div>
        )}

        
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

        
        {phase === "stats" && stats && currentQuestion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">{t("live.answerDistribution")}</h2>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5 text-left">
                <p className="text-white/60 text-xs mb-1">
                  {t("live.questionOf", { current: stats.questionNumber, total: stats.totalQuestions })}
                </p>
                <p className="text-white font-semibold text-lg">
                  {currentQuestion.questionText}
                </p>
              </div>

              <div className="flex items-end justify-center gap-4 h-64">
                {currentQuestion.choices.map((c, i) => {
                  const selection = (stats.choiceSelections || []).find(
                    (entry) => entry.choiceId === c.id
                  );
                  const isCorrect = isCorrectChoice(stats, c.id);
                  const count = selection?.count ?? stats.choiceCounts[c.id] ?? 0;
                  const maxCount = Math.max(
                    ...currentQuestion.choices.map((choice) => {
                      const item = (stats.choiceSelections || []).find(
                        (entry) => entry.choiceId === choice.id
                      );
                      return item?.count ?? stats.choiceCounts[choice.id] ?? 0;
                    }),
                    1
                  );
                  const height = (count / maxCount) * 100;

                  return (
                    <div key={c.id} className="flex flex-col items-center gap-2 flex-1">
                      <span className="text-white font-bold text-lg">{count}</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(height, 5)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`${getChoiceColor(i)} w-full rounded-t-lg ${
                          isCorrect ? "ring-4 ring-white" : ""
                        }`}
                      />
                      <span className={`text-sm font-medium truncate max-w-full ${
                        isCorrect
                          ? "text-green-400 font-bold"
                          : "text-white/60"
                      }`}>
                        {isCorrect && "✓ "}
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

              <div className="mt-6 text-left">
                <h3 className="text-white font-semibold mb-3">{t("live.statsByOption")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentQuestion.choices.map((choice) => {
                    const selection = (stats.choiceSelections || []).find(
                      (entry) => entry.choiceId === choice.id
                    );
                    const selectedPlayers = selection?.players || [];
                    const isCorrect = isCorrectChoice(stats, choice.id);
                    return (
                      <div
                        key={choice.id}
                        className={`rounded-xl p-3 border ${
                          isCorrect
                            ? "bg-green-500/20 border-green-400/50"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className={`font-semibold text-sm ${isCorrect ? "text-green-200" : "text-white"}`}>
                            {isCorrect ? "✓ " : ""}
                            {choice.choiceText}
                          </p>
                          <span className={`font-bold ${isCorrect ? "text-green-300" : "text-inf-yellow"}`}>
                            {selectedPlayers.length}
                          </span>
                        </div>
                        {selectedPlayers.length === 0 ? (
                          <p className="text-white/40 text-xs">{t("live.noSelectionYet")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedPlayers.map((player) => (
                              <span
                                key={`${choice.id}-${player.playerId}`}
                                className="bg-white/10 text-white/80 text-xs px-2 py-1 rounded-full"
                              >
                                {player.avatar} {player.nickname}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-red-200 font-semibold text-sm">{t("live.noAnswer")}</p>
                      <span className="text-red-300 font-bold">
                        {stats.unansweredPlayers?.length || 0}
                      </span>
                    </div>
                    {stats.unansweredPlayers && stats.unansweredPlayers.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {stats.unansweredPlayers.map((player) => (
                          <span
                            key={`no-answer-${player.playerId}`}
                            className="bg-red-500/20 text-red-100 text-xs px-2 py-1 rounded-full"
                          >
                            {player.avatar} {player.nickname}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-xs">{t("live.noSelectionYet")}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 text-left">
                <h3 className="text-white font-semibold mb-3">{t("live.playerResponses")}</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(stats.answeredPlayers || []).length === 0 ? (
                    <p className="text-white/40 text-xs">{t("live.noSelectionYet")}</p>
                  ) : (
                    (stats.answeredPlayers || []).map((player) => (
                      <div
                        key={`answer-${player.playerId}`}
                        className="bg-white/5 border border-white/10 rounded-lg p-2 flex items-center justify-between gap-3"
                      >
                        <div className="text-white/90 text-sm truncate">
                          {player.avatar} {player.nickname}
                        </div>
                        <div className="text-right">
                          <p className="text-white/80 text-xs md:text-sm">
                            {getAnswerLabel(player)}
                          </p>
                          <p
                            className={`text-[11px] font-semibold ${
                              player.isCorrect ? "text-green-300" : "text-red-300"
                            }`}
                          >
                            {player.isCorrect ? "Correct" : "Wrong"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={nextQuestion}
              className="bg-inf-blue hover:bg-blue-700 text-white font-bold py-3 md:py-4 px-6 md:px-12 rounded-xl text-lg md:text-xl transition-colors shadow-xl"
            >
              {questionNumber < totalQuestions ? t("live.nextQuestion") : t("live.showResults")}
            </motion.button>
          </motion.div>
        )}

        
        {phase === "leaderboard" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">{t("live.leaderboard")}</h2>

            
            {stats && currentQuestion && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 max-w-4xl mx-auto"
              >
                <h3 className="text-xl font-bold text-white mb-4">
                  {t("live.answerDistribution")}
                </h3>
                
                
                <div className="bg-white/5 rounded-lg p-3 mb-4">
                  <p className="text-white/90 text-sm font-semibold">
                    {currentQuestion.questionText}
                  </p>
                </div>

                
                <div className="space-y-3 mb-4">
                  {stats.choiceSelections.map((selection, idx) => {
                    const isCorrect = isCorrectChoice(stats, selection.choiceId);
                    const percentage = stats.totalPlayers > 0
                      ? Math.round((selection.count / stats.totalPlayers) * 100)
                      : 0;

                    return (
                      <div
                        key={selection.choiceId}
                        className={`relative overflow-hidden rounded-xl border-2 ${
                          isCorrect 
                            ? "border-green-500 bg-green-500/20" 
                            : "border-white/20 bg-white/5"
                        }`}
                      >
                        
                        <div
                          className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                            isCorrect ? "bg-green-500/30" : "bg-white/10"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />

                        
                        <div className="relative flex items-center justify-between p-3">
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${
                              getChoiceColor(idx)
                            }`}>
                              {getChoiceShape(idx)}
                            </div>
                            <span className="text-white font-medium flex-1 text-left">
                              {selection.choiceText}
                            </span>
                            {isCorrect && (
                              <span className="text-green-400 text-xl">✓</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white/70 text-sm font-medium">
                              {selection.count} {selection.count === 1 ? t("play.player") : t("play.players")}
                            </span>
                            <span className="text-white font-bold text-lg min-w-[3rem] text-right">
                              {percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-2xl font-bold text-white">
                      {stats.answeredCount}
                    </div>
                    <div className="text-white/60 text-sm">
                      {t("play.answered")}
                    </div>
                  </div>
                  <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-400">
                      {stats.correctCount}
                    </div>
                    <div className="text-white/60 text-sm">
                      {t("live.correct")}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-2xl font-bold text-white">
                      {stats.totalPlayers}
                    </div>
                    <div className="text-white/60 text-sm">
                      {t("play.totalPlayers")}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            
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
              className="bg-inf-green hover:bg-green-700 text-white font-bold py-3 md:py-4 px-6 md:px-12 rounded-xl text-lg md:text-xl transition-colors shadow-xl"
            >
              {questionNumber < totalQuestions ? t("live.nextQuestion") : t("live.showResults")}
            </motion.button>
          </motion.div>
        )}

        
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
