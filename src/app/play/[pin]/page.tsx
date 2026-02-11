"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import confetti from "canvas-confetti";
import { useTranslation } from "@/lib/i18n";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  QuestionPayload,
  PlayerRanking,
  BatchAnswerResult,
} from "@/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CHOICE_COLORS = [
  "bg-inf-red hover:bg-red-700",
  "bg-inf-blue hover:bg-blue-700",
  "bg-inf-yellow hover:bg-yellow-600",
  "bg-inf-green hover:bg-green-700",
  "bg-purple-700 hover:bg-purple-600",
  "bg-teal-700 hover:bg-teal-600",
  "bg-orange-700 hover:bg-orange-600",
  "bg-slate-700 hover:bg-slate-600",
];

const CHOICE_SHAPES = ["A", "B", "C", "D"];

function getChoiceColor(index: number): string {
  return CHOICE_COLORS[index % CHOICE_COLORS.length];
}

function getChoiceShape(index: number): string {
  return CHOICE_SHAPES[index % CHOICE_SHAPES.length];
}

function shuffleChoices<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type Phase =
  | "nickname"
  | "lobby"
  | "countdown"
  | "question"
  | "answered"
  | "result"
  | "leaderboard"
  | "ended";

export default function PlayPage() {
  const { t } = useTranslation();
  const params = useParams<{ pin: string }>();
  const pin = params?.pin ?? "";

  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("nickname");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [quizTitle, setQuizTitle] = useState(t("play.quizDefault"));
  const [playerCount, setPlayerCount] = useState(0);
  const [avatar, setAvatar] = useState("");

  // Countdown state (3-2-1)
  const [countdownNumber, setCountdownNumber] = useState(0);

  // Question state
  const [currentQuestion, setCurrentQuestion] =
    useState<QuestionPayload | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<number[]>([]);
  const [orderedChoices, setOrderedChoices] = useState<
    { id: number; choiceText: string; orderIndex: number }[]
  >([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [didSubmit, setDidSubmit] = useState(false);
  const questionStartTime = useRef<number>(0);

  // Result state
  const [batchResult, setBatchResult] = useState<BatchAnswerResult | null>(
    null
  );
  const [totalScore, setTotalScore] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<PlayerRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<PlayerRanking[]>([]);
  const [myRank, setMyRank] = useState(0);

  // Socket connection
  useEffect(() => {
    const s: TypedSocket = io({ path: "/api/socketio" });
    setSocket(s);

    s.on(
      "player:joined-success",
      ({ playerId: pid, quizTitle: qt, avatar: av }) => {
        setPlayerId(pid);
        setQuizTitle(qt);
        setAvatar(av);
        setPhase("lobby");
      }
    );

    s.on("error", ({ message }) => {
      setError(message);
    });

    s.on("lobby:player-joined", ({ playerCount: count }) => {
      setPlayerCount(count);
    });

    s.on("lobby:player-left", ({ playerCount: count }) => {
      setPlayerCount(count);
    });

    // 3-2-1 countdown before quiz starts
    s.on("game:countdown", ({ count }) => {
      setCountdownNumber(count);
      setPhase("countdown");
    });

    s.on(
      "game:question-start",
      ({ question, questionNumber: qn, totalQuestions: tq }) => {
        setCurrentQuestion(question);
        setQuestionNumber(qn);
        setTotalQuestions(tq);
        setTimeLeft(question.timeLimitSeconds);
        setSelectedChoice(null);
        setSelectedChoices([]);
        setOrderedChoices(
          question.questionType === "ordering"
            ? shuffleChoices(question.choices)
            : []
        );
        setTextAnswer("");
        setDidSubmit(false);
        setBatchResult(null);
        questionStartTime.current = Date.now();
        setPhase("question");
      }
    );

    // Answer acknowledged - stay in "answered" phase waiting for batch results
    s.on("game:answer-ack", () => {
      // Already set phase to "answered" in submitAnswer
    });

    // Time is up
    s.on("game:time-up", () => {
      setTimeLeft(0);
    });

    // Batch results come after time-up or all answered
    s.on("game:batch-results", (result) => {
      setBatchResult(result);
      setTotalScore(result.totalScore);
      setCurrentStreak(result.streak);
      setPhase("result");

      if (result.isCorrect) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#BA2031", "#0C4D99", "#FBB615", "#20AE4C"],
        });
      }
    });

    s.on("game:leaderboard", ({ rankings }) => {
      setLeaderboard(rankings);
      setPhase("leaderboard");
    });

    s.on("game:quiz-ended", ({ finalRankings: fr }) => {
      setFinalRankings(fr);
      setPhase("ended");

      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.4 },
        colors: ["#BA2031", "#0C4D99", "#FBB615", "#20AE4C", "#863B96"],
      });
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Update myRank when leaderboard changes
  useEffect(() => {
    if (playerId) {
      const rank =
        leaderboard.find((p) => p.playerId === playerId)?.rank ||
        finalRankings.find((p) => p.playerId === playerId)?.rank ||
        0;
      setMyRank(rank);
    }
  }, [leaderboard, finalRankings, playerId]);

  // Timer countdown
  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  const joinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !socket) return;
    setError("");
    socket.emit("player:join", { pin, nickname: nickname.trim() });
  };

  const submitAnswer = (choiceId: number) => {
    if (!socket || !currentQuestion || selectedChoice !== null) return;

    setSelectedChoice(choiceId);
    const responseTimeMs = Date.now() - questionStartTime.current;
    socket.emit("player:answer", {
      questionId: currentQuestion.id,
      choiceId,
      responseTimeMs,
    });
    setDidSubmit(true);
    setPhase("answered");
  };

  const toggleMultiChoice = (choiceId: number) => {
    if (!currentQuestion || phase !== "question") return;
    setSelectedChoices((prev) =>
      prev.includes(choiceId)
        ? prev.filter((id) => id !== choiceId)
        : [...prev, choiceId]
    );
  };

  const moveOrderedChoice = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= orderedChoices.length) return;
    const next = [...orderedChoices];
    const [item] = next.splice(index, 1);
    next.splice(newIndex, 0, item);
    setOrderedChoices(next);
  };

  // Auto-submit ordering answer when time runs out
  useEffect(() => {
    if (
      phase === "question" &&
      currentQuestion?.questionType === "ordering" &&
      timeLeft === 0 &&
      orderedChoices.length > 0 &&
      !didSubmit
    ) {
      submitAdvancedAnswer();
    }
  }, [timeLeft, phase, currentQuestion, orderedChoices, didSubmit]);

  const submitAdvancedAnswer = () => {
    if (!socket || !currentQuestion || phase !== "question") return;
    const responseTimeMs = Date.now() - questionStartTime.current;

    if (currentQuestion.questionType === "multi_select") {
      if (selectedChoices.length === 0) return;
      socket.emit("player:answer", {
        questionId: currentQuestion.id,
        choiceIds: selectedChoices,
        responseTimeMs,
      });
    } else if (currentQuestion.questionType === "ordering") {
      if (orderedChoices.length === 0) return;
      socket.emit("player:answer", {
        questionId: currentQuestion.id,
        orderedChoiceIds: orderedChoices.map((c) => c.id),
        responseTimeMs,
      });
    } else if (currentQuestion.questionType === "text_input") {
      if (!textAnswer.trim()) return;
      socket.emit("player:answer", {
        questionId: currentQuestion.id,
        textAnswer: textAnswer.trim(),
        responseTimeMs,
      });
    } else {
      return;
    }

    setDidSubmit(true);
    setPhase("answered");
  };

  const pageBackgroundStyle =
    phase === "question" && currentQuestion?.backgroundUrl
      ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.6)), url(${currentQuestion.backgroundUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black d-flex flex-column"
      style={pageBackgroundStyle}
    >
      <div className="container-fluid app-container px-2 px-md-3 py-2 py-md-3 flex-grow-1 d-flex flex-column">
      <AnimatePresence mode="wait">
        {/* Nickname Entry */}
        {phase === "nickname" && (
          <motion.div
            key="nickname"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm"
            >
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black text-white mb-2">
                  infin<span className="text-inf-yellow">Arena</span>
                </h1>
                <p className="text-white/60">{t("live.pinCode")}: {pin}</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-2xl">
                <form onSubmit={joinGame}>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full text-center text-2xl font-bold text-gray-800 py-4 px-4 rounded-xl border-2 border-gray-200 focus:border-inf-red focus:outline-none transition-colors placeholder-gray-300"
                    placeholder={t("play.yourNickname")}
                    maxLength={20}
                    autoFocus
                  />

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-inf-red text-sm mt-2 text-center font-medium"
                    >
                      {error}
                    </motion.p>
                  )}

                  <motion.button
                    type="submit"
                    disabled={!nickname.trim()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full mt-4 bg-inf-red hover:bg-red-700 text-white font-bold py-4 rounded-xl text-xl disabled:opacity-50 transition-all"
                  >
                    {t("play.join")}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Lobby */}
        {phase === "lobby" && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              {avatar && (
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-7xl mb-4"
                >
                  {avatar}
                </motion.div>
              )}
              <h2 className="text-3xl font-bold text-white mb-1">
                {t("play.youAreIn")}
              </h2>
              <p className="text-white/80 text-lg font-medium mb-1">
                {avatar && <span className="mr-1">{avatar}</span>}
                {nickname}
              </p>
              <p className="text-white/60 text-xl mb-2">{quizTitle}</p>
              <p className="text-white/40">
                {t("play.waitingHost")}
              </p>
              <div className="mt-6 bg-white/10 rounded-full px-6 py-2 inline-block">
                <span className="text-white/70">
                  {t("play.playersJoined", { count: playerCount })}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 3-2-1 Countdown */}
        {phase === "countdown" && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
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
                  className={`text-[12rem] font-black leading-none ${
                    countdownNumber === 3
                      ? "text-inf-red"
                      : countdownNumber === 2
                      ? "text-inf-yellow"
                      : "text-inf-green"
                  }`}
                >
                  {countdownNumber}
                </div>
                <p className="text-white/60 text-xl mt-4">{t("play.getReady")}</p>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Question */}
        {phase === "question" && currentQuestion && (
          <motion.div
            key="question"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-white/60 text-sm">
                {questionNumber}/{totalQuestions}
              </span>
              <motion.div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4 ${
                  timeLeft > 10
                    ? "border-green-400 text-green-400"
                    : timeLeft > 5
                    ? "border-yellow-400 text-yellow-400"
                    : "border-red-400 text-red-400"
                }`}
                animate={timeLeft <= 5 ? { scale: [1, 1.15, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                {timeLeft}
              </motion.div>
              <div className="text-right">
                <span className="text-white/60 text-sm">
                  {totalScore.toLocaleString()} {t("play.pts")}
                </span>
                {currentStreak >= 3 && (
                  <div className="text-xs text-orange-400 font-bold">
                    🔥 {currentStreak} {t("play.streak")}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-2 mb-6">
              <motion.div
                className="bg-inf-yellow h-2 rounded-full"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{
                  duration: currentQuestion.timeLimitSeconds,
                  ease: "linear",
                }}
              />
            </div>

            {/* Question text + media */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 text-center">
              {currentQuestion.mediaUrl && (
                <img
                  src={currentQuestion.mediaUrl}
                  alt="Question media"
                  className="max-h-48 mx-auto mb-4 rounded-lg object-contain"
                />
              )}
              <h2 className="text-xl md:text-2xl font-bold text-white">
                {currentQuestion.questionText}
              </h2>
            </div>

            {/* Answer UI */}
            {(currentQuestion.questionType === "multiple_choice" ||
              currentQuestion.questionType === "true_false") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                {currentQuestion.choices.map((choice, i) => (
                  <motion.button
                    key={choice.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => submitAnswer(choice.id)}
                    className={`answer-btn ${getChoiceColor(i)}`}
                  >
                    <span className="text-2xl">{getChoiceShape(i)}</span>
                    <span>{choice.choiceText}</span>
                  </motion.button>
                ))}
              </div>
            )}

            {currentQuestion.questionType === "multi_select" && (
              <div className="flex-1">
                <p className="text-center text-white/70 text-sm mb-3">
                  {t("play.multiSelectInstruction")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentQuestion.choices.map((choice, i) => {
                    const active = selectedChoices.includes(choice.id);
                    return (
                      <button
                        key={choice.id}
                        onClick={() => toggleMultiChoice(choice.id)}
                        className={`answer-btn ${getChoiceColor(i)} ${
                          active ? "ring-4 ring-white" : "opacity-90"
                        }`}
                      >
                        <span className="text-2xl">{getChoiceShape(i)}</span>
                        <span>{choice.choiceText}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={submitAdvancedAnswer}
                  disabled={selectedChoices.length === 0}
                  className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                >
                  {t("play.submit")}
                </button>
              </div>
            )}

            {currentQuestion.questionType === "ordering" && (
              <div className="flex-1">
                <p className="text-center text-white/70 text-sm mb-3">
                  {t("play.orderingInstruction")}
                </p>
                <div className="space-y-2">
                  {orderedChoices.map((choice, i) => {
                    const colorClass = getChoiceColor(i);
                    return (
                      <div
                        key={choice.id}
                        className={`rounded-xl p-3 flex items-center gap-3 ${colorClass} transition-all duration-200`}
                      >
                        <span className="text-sm font-bold text-white bg-black/25 rounded px-2 py-1">
                          {i + 1}
                        </span>
                        <span className="text-white font-semibold flex-1">
                          {choice.choiceText}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveOrderedChoice(i, -1)}
                            disabled={i === 0}
                            className="px-3 py-1 rounded font-bold text-white disabled:opacity-40 hover:bg-black/20 transition-colors bg-black/10"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveOrderedChoice(i, 1)}
                            disabled={i === orderedChoices.length - 1}
                            className="px-3 py-1 rounded font-bold text-white disabled:opacity-40 hover:bg-black/20 transition-colors bg-black/10"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!didSubmit && (
                  <button
                    onClick={submitAdvancedAnswer}
                    disabled={orderedChoices.length === 0}
                    className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                  >
                    {t("play.submit")}
                  </button>
                )}
              </div>
            )}

            {currentQuestion.questionType === "text_input" && (
              <div className="flex-1 max-w-xl mx-auto w-full">
                <input
                  type="text"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  className="w-full text-center text-2xl font-bold text-gray-800 py-4 px-4 rounded-xl border-2 border-gray-200 focus:border-inf-red focus:outline-none"
                  placeholder={t("play.textInputPlaceholder")}
                />
                <button
                  onClick={submitAdvancedAnswer}
                  disabled={!textAnswer.trim()}
                  className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                >
                  {t("play.submit")}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Answered - waiting for batch results */}
        {phase === "answered" && (
          <motion.div
            key="answered"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="text-6xl mb-4 inline-block"
              >
                ⏳
              </motion.div>
              <h2 className="text-2xl font-bold text-white">
                {t("play.answerSubmitted")}
              </h2>
              <p className="text-white/60 mt-2">
                {t("play.waitingEveryone")}
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* Result (from batch) */}
        {phase === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              {batchResult?.isCorrect ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="text-8xl mb-4"
                  >
                    🎉
                  </motion.div>
                  <h2 className="text-3xl font-black text-green-400 mb-2">
                    {t("play.correct")}
                  </h2>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-5xl font-black text-white"
                  >
                    +{batchResult.pointsAwarded}
                  </motion.div>

                  {/* Streak bonus */}
                  {batchResult.streakBonus > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-orange-400 font-bold text-lg mt-2"
                    >
                      🔥 {t("play.streakBonus", { bonus: batchResult.streakBonus })}
                    </motion.div>
                  )}

                  {/* Streak display */}
                  {batchResult.streak >= 3 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.7, type: "spring" }}
                      className="mt-3 inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/40 rounded-full px-4 py-2"
                    >
                      <span className="text-2xl animate-[streakFire_0.5s_ease-in-out_infinite]">
                        🔥
                      </span>
                      <span className="text-orange-300 font-black text-xl">
                        {batchResult.streak} {t("play.streak")}!
                      </span>
                    </motion.div>
                  )}
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="text-8xl mb-4"
                  >
                    😢
                  </motion.div>
                  <h2 className="text-3xl font-black text-red-400 mb-2">
                    {didSubmit ? t("play.wrong") : t("play.timesUp")}
                  </h2>
                  <p className="text-white/60 text-lg">
                    {t("play.betterLuck")}
                  </p>
                </>
              )}

              {/* Show answer details for non-multiple choice questions */}
              {currentQuestion && batchResult && (
                <div className="mt-4 bg-white/10 rounded-lg p-4 text-left max-w-lg mx-auto">
                  {currentQuestion.questionType === "ordering" && batchResult.playerAnswer && Array.isArray(batchResult.playerAnswer) ? (
                    <div>
                      <p className="text-white/80 text-sm font-semibold mb-2">
                        {t("play.yourAnswer")}:
                      </p>
                      <div className="space-y-1">
                        {batchResult.playerAnswer.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className={`text-sm p-2 rounded ${getChoiceColor(idx)}`}
                          >
                            <span className="font-bold">{idx + 1}.</span> {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : currentQuestion.questionType === "text_input" && batchResult.playerAnswer && typeof batchResult.playerAnswer === "string" ? (
                    <div>
                      <p className="text-white/80 text-sm font-semibold mb-2">
                        {t("play.yourAnswer")}:
                      </p>
                      <p className="text-white text-sm bg-black/30 rounded p-2 italic">
                        "{batchResult.playerAnswer}"
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-6 bg-white/10 rounded-full px-6 py-2 inline-block">
                <span className="text-white font-bold">
                  {t("play.total", { score: totalScore.toLocaleString() })}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Leaderboard */}
        {phase === "leaderboard" && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-md text-center"
            >
              <h2 className="text-2xl font-bold text-white mb-6">
                {t("play.leaderboard")}
              </h2>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                {leaderboard.slice(0, 5).map((p, i) => (
                  <motion.div
                    key={p.playerId}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`flex items-center justify-between p-3 rounded-lg mb-1 ${
                      p.playerId === playerId
                        ? "bg-inf-red/30 border border-inf-red"
                        : ""
                    }`}
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
                      <span className="text-xl mr-1">{p.avatar}</span>
                      <span className="text-white font-medium">
                        {p.nickname}
                        {p.playerId === playerId && ` ${t("play.youTag")}`}
                      </span>
                      {(p.streak || 0) >= 3 && (
                        <span className="text-sm text-orange-400">
                          🔥{p.streak}
                        </span>
                      )}
                    </div>
                    <span className="text-white font-bold">
                      {p.totalScore.toLocaleString()}
                    </span>
                  </motion.div>
                ))}

                {myRank > 5 && (
                  <div className="mt-2 p-3 bg-inf-red/20 rounded-lg border border-inf-red text-center">
                    <span className="text-white">
                      {t("play.yourRank", { rank: myRank })}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Final Results */}
        {phase === "ended" && (
          <motion.div
            key="ended"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md text-center"
            >
              <motion.h2
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="text-4xl font-black text-white mb-2"
              >
                {t("play.gameOver")}
              </motion.h2>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="mb-6"
              >
                {myRank === 1 ? (
                  <div className="text-7xl">??</div>
                ) : myRank === 2 ? (
                  <div className="text-7xl">??</div>
                ) : myRank === 3 ? (
                  <div className="text-7xl">??</div>
                ) : (
                  <div className="text-5xl">??</div>
                )}
              </motion.div>

              <p className="text-white/60 text-xl mb-1">{t("play.youFinished")}</p>
              <p className="text-4xl font-black text-inf-yellow mb-2">
                #{myRank}
              </p>
              <p className="text-white text-2xl font-bold">
                {t("play.points", { score: totalScore.toLocaleString() })}
              </p>

              <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                {finalRankings.slice(0, 5).map((p, i) => (
                  <motion.div
                    key={p.playerId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className={`flex items-center justify-between p-3 rounded-lg mb-1 ${
                      p.playerId === playerId
                        ? "bg-inf-red/30 border border-inf-red"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/60 font-bold w-6">
                        {p.rank}
                      </span>
                      <span className="text-xl">{p.avatar}</span>
                      <span className="text-white font-medium">
                        {p.nickname}
                        {p.playerId === playerId && ` ${t("play.youTag")}`}
                      </span>
                    </div>
                    <span className="text-white font-bold">
                      {p.totalScore.toLocaleString()}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}



