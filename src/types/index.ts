export interface QuestionPayload {
  id: number;
  questionText: string;
  questionType:
    | "multiple_choice"
    | "true_false"
    | "multi_select"
    | "text_input"
    | "ordering";
  timeLimitSeconds: number;
  basePoints: number;
  deductionPoints: number;
  deductionInterval: number;
  mediaUrl?: string | null;
  backgroundUrl?: string | null;
  choices: {
    id: number;
    choiceText: string;
    orderIndex: number;
  }[];
}

export interface PlayerRanking {
  playerId: number;
  nickname: string;
  avatar: string;
  totalScore: number;
  rank: number;
  streak?: number;
}

export interface AnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  streakBonus: number;
  totalScore: number;
  correctChoiceId: number;
  streak: number;
}

export interface AnswerAck {
  received: true;
}

export interface QuestionStats {
  choiceSelections: {
    choiceId: number;
    choiceText: string;
    count: number;
    players: {
      playerId: number;
      nickname: string;
      avatar: string;
    }[];
  }[];
  unansweredPlayers: {
    playerId: number;
    nickname: string;
    avatar: string;
  }[];
  answeredPlayers: {
    playerId: number;
    nickname: string;
    avatar: string;
    selectedChoiceIds: number[];
    selectedChoiceTexts: string[];
    orderedChoiceTexts: string[];
    textAnswer: string | null;
    isCorrect: boolean;
  }[];
  choiceCounts: Record<number, number>;
  correctChoiceId: number;
  correctChoiceIds?: number[];
  totalPlayers: number;
  correctCount: number;
  answeredCount: number;
  questionNumber: number;
  totalQuestions: number;
  remainingQuestions: number;
}

export interface BatchAnswerResult {
  questionId: number;
  isCorrect: boolean;
  pointsAwarded: number;
  streakBonus: number;
  totalScore: number;
  correctChoiceId: number;
  correctChoiceIds?: number[];
  streak: number;
  playerAnswer?: string[] | string | null;
  correctAnswerText?: string[];
}

export interface ClientToServerEvents {
  "player:join": (data: { pin: string; nickname: string }) => void;
  "player:rejoin": (data: { pin: string; playerId: number; nickname: string }) => void;
  "player:answer": (data: {
    questionId: number;
    choiceId?: number;
    choiceIds?: number[];
    orderedChoiceIds?: number[];
    textAnswer?: string;
    responseTimeMs: number;
  }) => void;
  "admin:start-quiz": (data: { sessionId: number }) => void;
  "admin:start-live": (data: { sessionId: number }) => void;
  "admin:next-question": (data: { sessionId: number }) => void;
  "admin:end-quiz": (data: { sessionId: number }) => void;
  "admin:join-session": (data: { sessionId: number }) => void;
}

export interface ServerToClientEvents {
  "lobby:player-joined": (data: {
    playerId: number;
    nickname: string;
    avatar: string;
    playerCount: number;
  }) => void;
  "lobby:player-left": (data: {
    playerId: number;
    nickname: string;
    playerCount: number;
  }) => void;
  "game:countdown": (data: { count: number }) => void;
  "game:question-start": (data: {
    question: QuestionPayload;
    questionNumber: number;
    totalQuestions: number;
    serverStartTime: number;
  }) => void;
  "game:answer-ack": (data: AnswerAck) => void;
  "game:time-up": () => void;
  "game:batch-results": (data: BatchAnswerResult) => void;
  "game:answer-result": (data: AnswerResult) => void;
  "game:question-stats": (data: QuestionStats) => void;
  "game:leaderboard": (data: { rankings: PlayerRanking[] }) => void;
  "game:quiz-ended": (data: { finalRankings: PlayerRanking[] }) => void;
  "player:joined-success": (data: {
    playerId: number;
    sessionId: number;
    quizTitle: string;
    avatar: string;
  }) => void;
  "player:rejoined-success": (data: {
    playerId: number;
    sessionId: number;
    quizTitle: string;
    avatar: string;
    totalScore: number;
    phase: "lobby" | "question" | "answered" | "leaderboard" | "ended";
  }) => void;
  "session:live": () => void;
  error: (data: { message: string }) => void;
}
