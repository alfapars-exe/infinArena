// Socket.IO event name constants
export const EVENTS = {
  // Client -> Server
  PLAYER_JOIN: "player:join",
  PLAYER_ANSWER: "player:answer",
  ADMIN_START_QUIZ: "admin:start-quiz",
  ADMIN_NEXT_QUESTION: "admin:next-question",
  ADMIN_END_QUIZ: "admin:end-quiz",
  ADMIN_JOIN_SESSION: "admin:join-session",

  // Server -> Client
  LOBBY_PLAYER_JOINED: "lobby:player-joined",
  LOBBY_PLAYER_LEFT: "lobby:player-left",
  GAME_QUESTION_START: "game:question-start",
  GAME_TIME_UP: "game:time-up",
  GAME_ANSWER_RESULT: "game:answer-result",
  GAME_QUESTION_STATS: "game:question-stats",
  GAME_LEADERBOARD: "game:leaderboard",
  GAME_QUIZ_ENDED: "game:quiz-ended",
  PLAYER_JOINED_SUCCESS: "player:joined-success",
  ERROR: "error",
} as const;


