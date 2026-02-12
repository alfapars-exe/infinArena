"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
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
  QuestionStats,
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

function getChoiceColor(index: number): string {
  return CHOICE_COLORS[index % CHOICE_COLORS.length];
}

function getStableChoiceColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return CHOICE_COLORS[Math.abs(hash) % CHOICE_COLORS.length];
}

function shuffleChoices<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---- Web Audio Sound Effects ----
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTick() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 800;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

function playTock() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 600;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

function playCorrectSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 523;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 200;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

function playDrumroll() {
  try {
    const ctx = getAudioCtx();
    for (let i = 0; i < 20; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 100 + Math.random() * 50;
      gain.gain.value = 0.05 + (i / 20) * 0.1;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.08;
      osc.start(t);
      osc.stop(t + 0.06);
    }
  } catch {}
}

function playFanfare() {
  try {
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.15;
      osc.start(t);
      gain.gain.setValueAtTime(0.2, t + 0.2);
      gain.gain.linearRampToValueAtTime(0, t + 0.4);
      osc.stop(t + 0.4);
    });
  } catch {}
}

// Motivational messages
const MOTIVATIONAL_MESSAGES_EN = [
  "Keep going! You're doing great!",
  "Amazing effort! Stay focused!",
  "You've got this!",
  "Stay sharp, champion!",
  "Brilliant! Keep it up!",
  "Almost there! Don't give up!",
  "You're on fire!",
  "Impressive! Next question awaits!",
  "Focus and conquer!",
  "Superstar performance!",
];

const MOTIVATIONAL_MESSAGES_TR = [
  "Harika gidiyorsun! Devam et!",
  "Muhteşem çaba! Odaklan!",
  "Yapabilirsin!",
  "Dikkatli ol, şampiyon!",
  "Mükemmel! Böyle devam!",
  "Neredeyse bitti! Pes etme!",
  "Ateş gibisin!",
  "Etkileyici! Sıradaki soruya hazır ol!",
  "Odaklan ve kazan!",
  "Süperstar performansı!",
];

function getMotivationalMessage(language: string): string {
  const messages = language === "tr" ? MOTIVATIONAL_MESSAGES_TR : MOTIVATIONAL_MESSAGES_EN;
  return messages[Math.floor(Math.random() * messages.length)];
}

type Phase =
  | "nickname"
  | "lobby"
  | "countdown"
  | "question"
  | "answered"
  | "stats"
  | "result"
  | "leaderboard"
  | "ended";

export default function PlayPage() {
  const { t, locale: language } = useTranslation();
  const params = useParams<{ pin: string }>();
  const pin = params?.pin ?? "";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPageInitialLoadRef = useRef(true);
  const socketConnectedAtLeastOnceRef = useRef(false);

  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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
  const [timeProgress, setTimeProgress] = useState(100);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<number[]>([]);
  const [orderedChoices, setOrderedChoices] = useState<
    { id: number; choiceText: string; orderIndex: number }[]
  >([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [didSubmit, setDidSubmit] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const isSubmittingAnswerRef = useRef(false);
  const phaseRef = useRef<Phase>("nickname");
  const submitWatchdogRef = useRef<number | NodeJS.Timeout | null>(null);
  const lastQuestionIdRef = useRef<number | null>(null);
  const currentQuestionMetaRef = useRef<{ id: number | null; serverStartTime: number }>({
    id: null,
    serverStartTime: 0,
  });
  const questionStartTime = useRef<number>(0);
  const serverEndTimeRef = useRef<number>(0);
  const timerRafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  // Result state
  const [batchResult, setBatchResult] = useState<BatchAnswerResult | null>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStats | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<PlayerRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<PlayerRanking[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [motivationalMsg, setMotivationalMsg] = useState("");
  const [availablePoints, setAvailablePoints] = useState(0);
  const scoringRef = useRef({ basePoints: 1000, deductionPoints: 50, deductionInterval: 1 });

  // Podium animation
  const [podiumStep, setPodiumStep] = useState(0);

  // Session cache key
  const sessionCacheKey = `quiz-session-${pin}`;

  // Save session to localStorage
  const saveSession = useCallback((pid: number, nick: string, av: string) => {
    try {
      localStorage.setItem(sessionCacheKey, JSON.stringify({
        playerId: pid,
        nickname: nick,
        avatar: av,
        timestamp: Date.now(),
      }));
    } catch {}
  }, [sessionCacheKey]);

  const emitRejoinFromCache = useCallback((targetSocket: TypedSocket) => {
    try {
      const cached = localStorage.getItem(sessionCacheKey);
      if (!cached) return;
      const data = JSON.parse(cached);
      // Only rejoin if cache is less than 4 hours old
      if (Date.now() - data.timestamp >= 4 * 60 * 60 * 1000) return;
      if (!data.playerId || !data.nickname) return;
      targetSocket.emit("player:rejoin", {
        pin,
        playerId: data.playerId,
        nickname: data.nickname,
      });
    } catch {}
  }, [pin, sessionCacheKey]);

  const clearSubmitWatchdog = useCallback(() => {
    if (submitWatchdogRef.current) {
      window.clearTimeout(submitWatchdogRef.current);
      submitWatchdogRef.current = null;
    }
  }, []);

  const armSubmitWatchdog = useCallback((targetSocket: TypedSocket | null) => {
    clearSubmitWatchdog();
    submitWatchdogRef.current = window.setTimeout(() => {
      if (!isSubmittingAnswerRef.current) return;
      setIsSubmittingAnswer(false);
      isSubmittingAnswerRef.current = false;
      if (phaseRef.current === "answered") {
        setDidSubmit(false);
        setPhase("question");
      }
      if (targetSocket?.connected) {
        emitRejoinFromCache(targetSocket);
      }
    }, 2500);
  }, [clearSubmitWatchdog, emitRejoinFromCache]);

  useEffect(() => {
    isSubmittingAnswerRef.current = isSubmittingAnswer;
  }, [isSubmittingAnswer]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Server-synced timer using requestAnimationFrame
  const startSyncedTimer = useCallback((serverStart: number, timeLimitSeconds: number) => {
    if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    serverEndTimeRef.current = serverStart + timeLimitSeconds * 1000;
    lastTickRef.current = -1;
    setTimeProgress(100);

    const tick = () => {
      const now = Date.now();
      const totalMs = timeLimitSeconds * 1000;
      const remainingMs = Math.max(0, serverEndTimeRef.current - now);
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeProgress(totalMs > 0 ? (remainingMs / totalMs) * 100 : 0);
      if (remaining !== lastTickRef.current) {
        lastTickRef.current = remaining;
        setTimeLeft(remaining);

        // Calculate available points based on elapsed time
        const { basePoints, deductionPoints, deductionInterval } = scoringRef.current;
        const elapsedMs = now - serverStart;
        const elapsedSec = Math.max(0, elapsedMs / 1000);
        const intervals = Math.floor(elapsedSec / deductionInterval);
        const pts = Math.max(100, basePoints - intervals * deductionPoints);
        setAvailablePoints(pts);

        // Tick-tock sound in last 5 seconds
        if (remaining > 0 && remaining <= 5) {
          if (remaining % 2 === 1) playTick();
          else playTock();
        }
      }
      if (remaining > 0) {
        timerRafRef.current = requestAnimationFrame(tick);
      }
    };
    timerRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Socket connection
  useEffect(() => {
    const s: TypedSocket = io({ path: "/api/socketio" });
    setSocket(s);

    // Try rejoin from cache
    s.on("connect", () => {
      setIsConnected(true);
      socketConnectedAtLeastOnceRef.current = true;
      isPageInitialLoadRef.current = false;
      emitRejoinFromCache(s);
    });

    s.on("disconnect", () => {
      setIsConnected(false);
    });

    s.on(
      "player:joined-success",
      ({ playerId: pid, quizTitle: qt, avatar: av }) => {
        setPlayerId(pid);
        setQuizTitle(qt);
        setAvatar(av);
        setPhase("lobby");
        setNickname((prev) => prev); // keep existing nickname
        saveSession(pid, nickname || "", av);
      }
    );

    s.on("player:rejoined-success", ({ playerId: pid, quizTitle: qt, avatar: av, totalScore: ts, phase: serverPhase }) => {
      setPlayerId(pid);
      setQuizTitle(qt);
      setAvatar(av);
      setTotalScore(ts);
      // Restore nickname from cache
      try {
        const cached = localStorage.getItem(sessionCacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          setNickname(data.nickname);
        }
      } catch {}
      if (serverPhase === "ended") {
        setPhase("ended");
      } else if (serverPhase === "leaderboard") {
        setPhase("leaderboard");
      } else if (serverPhase === "answered") {
        setPhase("answered");
      } else if (serverPhase === "question") {
        // Keep local selection/input; game:question-start will reset only for truly new questions.
        setPhase("question");
      } else {
        setPhase("lobby");
      }
    });

    s.on("error", ({ message }) => {
      clearSubmitWatchdog();
      if (message === "Already answered") {
        setIsSubmittingAnswer(false);
        isSubmittingAnswerRef.current = false;
        setDidSubmit(true);
        setPhase("answered");
      } else if (isSubmittingAnswerRef.current) {
        setIsSubmittingAnswer(false);
        isSubmittingAnswerRef.current = false;
        setDidSubmit(false);
        setSelectedChoice(null);
        setPhase("question");
      }
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
      ({ question, questionNumber: qn, totalQuestions: tq, serverStartTime }) => {
        const isDuplicateQuestionStart =
          currentQuestionMetaRef.current.id === question.id &&
          currentQuestionMetaRef.current.serverStartTime === serverStartTime;

        // Re-sync can replay current question event; do not wipe input/selection for same question.
        if (isDuplicateQuestionStart) {
          setCurrentQuestion(question);
          setQuestionNumber(qn);
          setTotalQuestions(tq);
          startSyncedTimer(serverStartTime, question.timeLimitSeconds);
          return;
        }

        currentQuestionMetaRef.current = {
          id: question.id,
          serverStartTime,
        };
        setCurrentQuestion(question);
        setQuestionNumber(qn);
        setTotalQuestions(tq);
        setSelectedChoice(null);
        setSelectedChoices([]);
        setOrderedChoices(
          question.questionType === "ordering"
            ? shuffleChoices(question.choices)
            : []
        );
        setTextAnswer("");
        setDidSubmit(false);
        setIsSubmittingAnswer(false);
        isSubmittingAnswerRef.current = false;
        clearSubmitWatchdog();
        setBatchResult(null);
        setError("");
        questionStartTime.current = serverStartTime;
        scoringRef.current = {
          basePoints: question.basePoints || 1000,
          deductionPoints: question.deductionPoints || 50,
          deductionInterval: question.deductionInterval || 1,
        };
        setAvailablePoints(question.basePoints || 1000);
        setPhase("question");
        // Start synced timer
        startSyncedTimer(serverStartTime, question.timeLimitSeconds);
      }
    );

    // Answer acknowledged - stay in "answered" phase waiting for batch results
    s.on("game:answer-ack", () => {
      clearSubmitWatchdog();
      setIsSubmittingAnswer(false);
      isSubmittingAnswerRef.current = false;
      setDidSubmit(true);
      setPhase("answered");
    });

    // Time is up
    s.on("game:time-up", () => {
      clearSubmitWatchdog();
      setTimeLeft(0);
      setTimeProgress(0);
      setIsSubmittingAnswer(false);
      isSubmittingAnswerRef.current = false;
      if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    });

    // Batch results come after time-up or all answered
    s.on("game:batch-results", (result) => {
      clearSubmitWatchdog();
      setBatchResult(result);
      setTotalScore(result.totalScore);
      setCurrentStreak(result.streak);
      setPhase("result");
      setMotivationalMsg(getMotivationalMessage(language));

      if (result.isCorrect) {
        playCorrectSound();
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#BA2031", "#0C4D99", "#FBB615", "#20AE4C"],
        });
      } else {
        playWrongSound();
      }
    });

    // Question stats - show answer distribution
    s.on("game:question-stats", (stats) => {
      setQuestionStats(stats);
      setPhase("stats");
    });

    s.on("game:leaderboard", ({ rankings }) => {
      setLeaderboard(rankings);
      setPhase("leaderboard");
    });

    s.on("game:quiz-ended", ({ finalRankings: fr }) => {
      setFinalRankings(fr);
      setPhase("ended");
      // Clear session cache
      try { localStorage.removeItem(sessionCacheKey); } catch {}

      // Podium animation: 3rd -> 2nd -> 1st
      setPodiumStep(0);
      playDrumroll();
      setTimeout(() => setPodiumStep(1), 1500); // 3rd
      setTimeout(() => setPodiumStep(2), 3000); // 2nd
      setTimeout(() => {
        setPodiumStep(3); // 1st
        playFanfare();
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.4 },
          colors: ["#BA2031", "#0C4D99", "#FBB615", "#20AE4C", "#863B96"],
        });
      }, 4500);
    });

    return () => {
      clearSubmitWatchdog();
      if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
      s.disconnect();
    };
  }, []);

  // Re-sync state when tab becomes active again.
  useEffect(() => {
    if (!socket) return;

    const syncState = () => {
      if (!socket.connected) return;
      emitRejoinFromCache(socket);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncState();
      }
    };

    window.addEventListener("focus", syncState);
    window.addEventListener("pageshow", syncState);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", syncState);
      window.removeEventListener("pageshow", syncState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [socket, emitRejoinFromCache]);

  // If client misses an event while in answered screen, force periodic re-sync.
  useEffect(() => {
    if (!socket || phase !== "answered") return;

    const interval = window.setInterval(() => {
      if (!socket.connected) return;
      emitRejoinFromCache(socket);
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [socket, phase, emitRejoinFromCache]);

  // If timer reached zero but we still remain on question screen, force a re-sync.
  useEffect(() => {
    if (!socket || phase !== "question" || timeLeft > 0) return;

    const timeout = window.setTimeout(() => {
      if (!socket.connected) return;
      emitRejoinFromCache(socket);
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [socket, phase, timeLeft, emitRejoinFromCache]);

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

  const joinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !socket) return;
    setError("");
    socket.emit("player:join", { pin, nickname: nickname.trim() });
    // Save nickname for session cache (will be completed on joined-success)
  };

  // Update session cache when nickname is set after join success
  useEffect(() => {
    if (playerId && nickname && avatar) {
      saveSession(playerId, nickname, avatar);
    }
  }, [playerId, nickname, avatar, saveSession]);

  useEffect(() => {
    if (!currentQuestion) return;
    if (lastQuestionIdRef.current === currentQuestion.id) return;
    lastQuestionIdRef.current = currentQuestion.id;
    setSelectedChoice(null);
    setSelectedChoices([]);
    setTextAnswer("");
    setDidSubmit(false);
    setIsSubmittingAnswer(false);
    isSubmittingAnswerRef.current = false;
    clearSubmitWatchdog();
  }, [currentQuestion, clearSubmitWatchdog]);

  const submitAnswer = (choiceId: number) => {
    if (
      !socket ||
      !currentQuestion ||
      phase !== "question" ||
      selectedChoice !== null ||
      isSubmittingAnswerRef.current ||
      didSubmit
    ) {
      return;
    }

    setSelectedChoice(choiceId);
    const responseTimeMs = Date.now() - questionStartTime.current;
    socket.emit("player:answer", {
      questionId: currentQuestion.id,
      choiceId,
      responseTimeMs,
    });
    setError("");
    setIsSubmittingAnswer(true);
    isSubmittingAnswerRef.current = true;
    armSubmitWatchdog(socket);
  };

  const selectMultiChoice = (choiceId: number) => {
    if (
      !socket ||
      !currentQuestion ||
      phase !== "question" ||
      isSubmittingAnswerRef.current ||
      didSubmit
    ) {
      return;
    }

    // Toggle choice in multi-select (add or remove)
    setSelectedChoices((prev) => {
      const isSelected = prev.includes(choiceId);
      if (isSelected) {
        return prev.filter((id) => id !== choiceId);
      } else {
        return [...prev, choiceId];
      }
    });
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
      !isSubmittingAnswer &&
      !didSubmit
    ) {
      submitAdvancedAnswer();
    }
  }, [timeLeft, phase, currentQuestion, orderedChoices, didSubmit, isSubmittingAnswer]);

  const submitAdvancedAnswer = () => {
    if (
      !socket ||
      !currentQuestion ||
      phase !== "question" ||
      isSubmittingAnswerRef.current ||
      didSubmit
    ) {
      return;
    }
    const responseTimeMs = Date.now() - questionStartTime.current;

    if (currentQuestion.questionType === "multi_select") {
      if (selectedChoices.length === 0) return;
      socket.emit("player:answer", {
        questionId: currentQuestion.id,
        choiceIds: selectedChoices,
        responseTimeMs,
      });
    } else if (currentQuestion.questionType === "ordering") {
      const orderedChoiceIds = orderedChoices
        .map((c) => Number(c.id))
        .filter((id) => Number.isInteger(id));
      if (orderedChoiceIds.length !== orderedChoices.length) {
        setError(t("play.answerFailed" as any) || "Answer submit failed.");
        return;
      }
      socket.emit("player:answer", {
        questionId: currentQuestion.id,
        orderedChoiceIds,
        responseTimeMs,
      });
      setDidSubmit(true);
      setPhase("answered");
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

    setError("");
    setIsSubmittingAnswer(true);
    isSubmittingAnswerRef.current = true;
    armSubmitWatchdog(socket);
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
        <div className="w-full d-flex justify-content-center mb-2">
          <img src="/logo.png" alt="infinArena" className="h-10 md:h-12 w-auto" />
        </div>

        {/* Connection Status Overlay */}
        <AnimatePresence>
          {(!isConnected || isPending) && (
            <motion.div
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="text-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-16 h-16 border-4 border-inf-yellow border-t-transparent rounded-full mx-auto mb-6"
                />
                {isPending ? (
                  <>
                    <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
                      Lütfen bekleyin
                    </h1>
                    <p className="text-white/70 text-lg mb-2">
                      Sayfa yükleniyor...
                    </p>
                  </>
                ) : isPageInitialLoadRef.current || !socketConnectedAtLeastOnceRef.current ? (
                  <>
                    <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
                      Yeniden bağlanılıyor
                    </h1>
                    <p className="text-white/70 text-lg mb-2">
                      Bağlanılıyor...
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
                      Bakım modu aktifleştirildi.
                    </h1>
                    <p className="text-white/70 text-lg mb-2">
                      Tekrar bağlanılıyor...
                    </p>
                  </>
                )}
                <p className="text-white/50 text-sm mt-4">
                  {t("play.pleaseWait" as any) || "Lütfen bekleyin"}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
            className="flex-1 flex flex-col p-2 p-md-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3 mb-md-4">
              <span className="text-white/60 text-sm">
                {questionNumber}/{totalQuestions}
              </span>
              <motion.div
                className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-xl md:text-2xl font-black border-4 ${
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
                <motion.span
                  key={availablePoints}
                  initial={{ scale: 1.2, color: "#facc15" }}
                  animate={{ scale: 1, color: availablePoints > scoringRef.current.basePoints * 0.5 ? "#4ade80" : availablePoints > scoringRef.current.basePoints * 0.25 ? "#facc15" : "#f87171" }}
                  className="text-sm font-bold block"
                >
                  {availablePoints} {t("play.pts")}
                </motion.span>
                {currentStreak >= 3 && (
                  <div className="text-xs text-orange-400 font-bold">
                    🔥 {currentStreak} {t("play.streak")}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-2 mb-4 mb-md-6">
              <div
                className="bg-inf-yellow h-2 rounded-full transition-none"
                style={{ width: `${Math.max(0, Math.min(100, timeProgress))}%` }}
              />
            </div>

            {/* Question text + media */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 p-md-6 mb-4 mb-md-6 text-center">
              {currentQuestion.mediaUrl && (
                <div className="flex justify-center mb-4 mb-md-6 bg-black/30 rounded-lg p-2 p-md-4">
                  <img
                    src={currentQuestion.mediaUrl}
                    alt="Question media"
                    className="max-w-full max-h-48 md:max-h-96 rounded-lg object-contain"
                  />
                </div>
              )}
              <h2 className="text-lg md:text-2xl font-bold text-white">
                {currentQuestion.questionText}
              </h2>
            </div>

            {error && (
              <p className="text-center text-sm text-inf-red mb-3">{error}</p>
            )}

            {/* Answer UI */}
            {(currentQuestion.questionType === "multiple_choice" ||
              currentQuestion.questionType === "true_false") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 flex-1">
                {currentQuestion.choices.map((choice, i) => {
                  const choiceId = Number(choice.id);
                  const isSelected = selectedChoice === choiceId;
                  const isDisabled =
                    phase !== "question" ||
                    selectedChoice !== null ||
                    didSubmit;
                  
                  return (
                    <motion.button
                      key={choice.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      whileHover={!isDisabled ? { scale: 1.02 } : {}}
                      whileTap={!isDisabled ? { scale: 0.95 } : {}}
                      onClick={() => {
                        if (!isDisabled && Number.isInteger(choiceId)) {
                          submitAnswer(choiceId);
                        }
                      }}
                      disabled={isDisabled}
                      className={`answer-btn ${getChoiceColor(i)} ${
                        isSelected ? "ring-4 ring-white scale-105" : ""
                      } ${isDisabled && !isSelected ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span>{choice.choiceText}</span>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {currentQuestion.questionType === "multi_select" && (
              <div className="flex-1">
                <p className="text-center text-white/70 text-sm mb-3">
                  {t("play.multiSelectInstruction")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 mb-4">
                  {currentQuestion.choices.map((choice, i) => {
                    const choiceId = Number(choice.id);
                    const active = selectedChoices.includes(choiceId);
                    const isDisabled = phase !== "question" || didSubmit;
                    return (
                      <button
                        type="button"
                        key={choice.id}
                        onClick={() => {
                          if (!isDisabled && Number.isInteger(choiceId)) {
                            selectMultiChoice(choiceId);
                          }
                        }}
                        disabled={isDisabled}
                        className={`answer-btn ${getChoiceColor(i)} ${
                          active ? "ring-4 ring-white" : "opacity-90"
                        } ${isDisabled && !active ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span>{choice.choiceText}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Submit button for multi-select */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedChoices.length > 0 && !isSubmittingAnswer && !didSubmit) {
                      const responseTimeMs = Date.now() - questionStartTime.current;
                      socket?.emit("player:answer", {
                        questionId: currentQuestion.id,
                        choiceIds: selectedChoices,
                        responseTimeMs,
                      });
                      setError("");
                      setIsSubmittingAnswer(true);
                      isSubmittingAnswerRef.current = true;
                      armSubmitWatchdog(socket);
                    }
                  }}
                  disabled={selectedChoices.length === 0 || isSubmittingAnswer || didSubmit}
                  className="w-full bg-inf-green hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
                >
                  {isSubmittingAnswer ? t("play.submit") + "..." : t("play.submit")}
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
                    const colorClass = getStableChoiceColor(choice.choiceText);
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
                            type="button"
                            onClick={() => moveOrderedChoice(i, -1)}
                            disabled={didSubmit || isSubmittingAnswer || i === 0}
                            className="px-3 py-1 rounded font-bold text-white disabled:opacity-40 hover:bg-black/20 transition-colors bg-black/10"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOrderedChoice(i, 1)}
                            disabled={didSubmit || isSubmittingAnswer || i === orderedChoices.length - 1}
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
                    type="button"
                    onClick={submitAdvancedAnswer}
                    disabled={orderedChoices.length === 0 || isSubmittingAnswer}
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
                  className="w-full text-center text-xl md:text-2xl font-bold text-gray-800 py-3 md:py-4 px-4 rounded-xl border-2 border-gray-200 focus:border-inf-red focus:outline-none"
                  placeholder={t("play.textInputPlaceholder")}
                />
                <button
                  type="button"
                  onClick={submitAdvancedAnswer}
                  disabled={!textAnswer.trim() || isSubmittingAnswer}
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
              className="text-center w-full max-w-lg"
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

              {/* Show answer details for non-multiple choice questions only */}
              {currentQuestion && batchResult && (
                <>
                  {currentQuestion.questionType === "ordering" && batchResult.playerAnswer && Array.isArray(batchResult.playerAnswer) ? (
                    <div className="mt-4 bg-white/10 rounded-lg p-4 text-left">
                      <p className="text-white/80 text-sm font-semibold mb-2">
                        {t("play.yourAnswer")}:
                      </p>
                      <div className="space-y-1">
                        {batchResult.playerAnswer.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className={`text-sm p-2 rounded ${getStableChoiceColor(String(item))}`}
                          >
                            <span className="font-bold">{idx + 1}.</span> {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : currentQuestion.questionType === "text_input" && batchResult.playerAnswer && typeof batchResult.playerAnswer === "string" ? (
                    <div className="mt-4 bg-white/10 rounded-lg p-4 text-left">
                      <p className="text-white/80 text-sm font-semibold mb-2">
                        {t("play.yourAnswer")}:
                      </p>
                      <p className="text-white text-sm bg-black/30 rounded p-2 italic">
                        &quot;{batchResult.playerAnswer}&quot;
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {/* Motivational message */}
              {motivationalMsg && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="mt-4 text-inf-yellow font-semibold text-lg italic"
                >
                  {motivationalMsg}
                </motion.div>
              )}

              <div className="mt-6 bg-white/10 rounded-full px-6 py-2 inline-block">
                <span className="text-white font-bold">
                  {t("play.total", { score: totalScore.toLocaleString() })}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Question Stats - Answer Distribution */}
        {phase === "stats" && questionStats && currentQuestion && (
          <motion.div
            key="stats"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">
                {t("play.answerDistribution")}
              </h2>

              {/* Question text */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-6 text-center">
                <p className="text-white text-lg font-semibold">
                  {currentQuestion.questionText}
                </p>
              </div>

              {/* Answer choices with bars */}
              <div className="space-y-3">
                {questionStats.choiceSelections.map((selection, idx) => {
                  const isCorrect = 
                    selection.choiceId === questionStats.correctChoiceId ||
                    (questionStats.correctChoiceIds && questionStats.correctChoiceIds.includes(selection.choiceId));
                  const percentage = questionStats.totalPlayers > 0
                    ? Math.round((selection.count / questionStats.totalPlayers) * 100)
                    : 0;

                  return (
                    <motion.div
                      key={selection.choiceId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`relative overflow-hidden rounded-xl border-2 ${
                        isCorrect 
                          ? "border-green-500 bg-green-500/20" 
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      {/* Background bar */}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1 + 0.3 }}
                        className={`absolute inset-y-0 left-0 ${
                          isCorrect ? "bg-green-500/30" : "bg-white/10"
                        }`}
                      />

                      {/* Content */}
                      <div className="relative flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${
                            getChoiceColor(idx).split(" ")[0]
                          }`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className="text-white font-medium flex-1">
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
                    </motion.div>
                  );
                })}
              </div>

              {/* Stats summary */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-6 grid grid-cols-3 gap-3"
              >
                <div className="bg-white/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">
                    {questionStats.answeredCount}
                  </div>
                  <div className="text-white/60 text-sm">
                    {t("play.answered")}
                  </div>
                </div>
                <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {questionStats.correctCount}
                  </div>
                  <div className="text-white/60 text-sm">
                    {t("play.correct")}
                  </div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">
                    {questionStats.totalPlayers}
                  </div>
                  <div className="text-white/60 text-sm">
                    {t("play.totalPlayers")}
                  </div>
                </div>
              </motion.div>
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

              {/* Correct answer display */}
              {batchResult?.correctAnswerText && batchResult.correctAnswerText.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-4 bg-green-500/20 border border-green-500/40 rounded-xl p-3"
                >
                  <p className="text-green-400 text-xs font-medium mb-1">{t("play.correctAnswer")}</p>
                  <p className="text-white font-bold text-sm">
                    {batchResult.correctAnswerText.join(", ")}
                  </p>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Final Results - Podium Animation */}
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
                  <div className="text-7xl">🥇</div>
                ) : myRank === 2 ? (
                  <div className="text-7xl">🥈</div>
                ) : myRank === 3 ? (
                  <div className="text-7xl">🥉</div>
                ) : (
                  <div className="text-5xl">⭐</div>
                )}
              </motion.div>

              <p className="text-white/60 text-xl mb-1">{t("play.youFinished")}</p>
              <p className="text-4xl font-black text-inf-yellow mb-2">
                #{myRank}
              </p>
              <p className="text-white text-2xl font-bold">
                {t("play.points", { score: totalScore.toLocaleString() })}
              </p>

              {/* Podium animation */}
              {finalRankings.length >= 3 && (
                <div className="flex items-end justify-center gap-3 mt-8 mb-6">
                  {/* 3rd place */}
                  <AnimatePresence>
                    {podiumStep >= 1 && finalRankings[2] && (
                      <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-center"
                      >
                        <div className="text-2xl mb-1">{finalRankings[2].avatar}</div>
                        <div className="text-white text-xs font-bold mb-1 truncate max-w-[80px]">
                          {finalRankings[2].nickname}
                        </div>
                        <div className="bg-amber-700 w-20 md:w-24 rounded-t-lg p-2 h-16 flex items-center justify-center">
                          <div>
                            <div className="text-lg font-black text-white">🥉</div>
                            <div className="text-white/70 text-xs font-bold">
                              {finalRankings[2].totalScore.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 1st place */}
                  <AnimatePresence>
                    {podiumStep >= 3 && finalRankings[0] && (
                      <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-center"
                        style={{
                          background: podiumStep >= 3 ? "radial-gradient(circle at 50% 0%, rgba(251,182,21,0.3) 0%, transparent 70%)" : undefined,
                          borderRadius: "1rem",
                          padding: "0.5rem",
                        }}
                      >
                        <div className="text-3xl mb-1">{finalRankings[0].avatar}</div>
                        <div className="text-white text-xs font-bold mb-1 truncate max-w-[90px]">
                          {finalRankings[0].nickname}
                        </div>
                        <div className="bg-yellow-500 w-24 md:w-28 rounded-t-lg p-2 h-28 flex items-center justify-center">
                          <div>
                            <div className="text-2xl font-black text-black">🥇</div>
                            <div className="text-black/70 text-sm font-bold">
                              {finalRankings[0].totalScore.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 2nd place */}
                  <AnimatePresence>
                    {podiumStep >= 2 && finalRankings[1] && (
                      <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-center"
                      >
                        <div className="text-2xl mb-1">{finalRankings[1].avatar}</div>
                        <div className="text-white text-xs font-bold mb-1 truncate max-w-[80px]">
                          {finalRankings[1].nickname}
                        </div>
                        <div className="bg-gray-400 w-20 md:w-24 rounded-t-lg p-2 h-20 flex items-center justify-center">
                          <div>
                            <div className="text-lg font-black text-black">🥈</div>
                            <div className="text-black/70 text-xs font-bold">
                              {finalRankings[1].totalScore.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                {finalRankings.slice(0, 5).map((p, i) => (
                  <motion.div
                    key={p.playerId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 5 + i * 0.1 }}
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
