/**
 * k6 Load Test - Scenario 1: Baseline
 * 20 players, 1 session, 10 questions
 * Target: p95 < 20ms for Socket.IO events
 *
 * Usage:
 *   k6 run loadtest/scenario-baseline.js
 *
 * Environment variables:
 *   BASE_URL    - Backend base URL (default: http://localhost:7860)
 *   ADMIN_USER  - Admin username (default: admin)
 *   ADMIN_PASS  - Admin password (default: admin123)
 *   QUIZ_ID     - Quiz ID to use (default: 1)
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, group } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";

// --- Configuration ---
const BASE_URL = __ENV.BASE_URL || "http://localhost:7860";
const WS_URL = BASE_URL.replace(/^http/, "ws");
const ADMIN_USER = __ENV.ADMIN_USER || "admin";
const ADMIN_PASS = __ENV.ADMIN_PASS || "admin123";
const QUIZ_ID = parseInt(__ENV.QUIZ_ID || "1", 10);
const PLAYER_COUNT = 20;

// --- Custom Metrics ---
const joinLatency = new Trend("socketio_join_latency", true);
const answerLatency = new Trend("socketio_answer_latency", true);
const questionReceiveLatency = new Trend("socketio_question_receive_latency", true);
const leaderboardLatency = new Trend("socketio_leaderboard_latency", true);
const answerAckRate = new Rate("socketio_answer_ack_rate");
const socketErrors = new Counter("socketio_errors");

export const options = {
  scenarios: {
    players: {
      executor: "per-vu-iterations",
      vus: PLAYER_COUNT,
      iterations: 1,
      maxDuration: "5m",
    },
  },
  thresholds: {
    socketio_join_latency: ["p(95)<500"],
    socketio_answer_latency: ["p(95)<100"],
    socketio_question_receive_latency: ["p(95)<200"],
    socketio_answer_ack_rate: ["rate>0.95"],
    socketio_errors: ["count<5"],
  },
};

// --- Helpers ---

function loginAdmin() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "admin login success": (r) => r.status === 200 });
  return res.json().token;
}

function publishQuiz(token) {
  const res = http.post(
    `${BASE_URL}/api/quizzes/${QUIZ_ID}/publish`,
    null,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  check(res, { "quiz published": (r) => r.status === 200 || r.status === 201 });
  return res.json();
}

// Socket.IO uses Engine.IO protocol. We need to:
// 1. GET /socket.io/?EIO=4&transport=polling to get session id
// 2. Upgrade to WebSocket
function connectSocketIO(path) {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  return url;
}

function encodeSocketIOMessage(type, data) {
  // Socket.IO packet types: 0=connect, 2=event, 42=event with ack
  if (type === "event") {
    return `42${JSON.stringify(data)}`;
  }
  return "";
}

function decodeSocketIOMessage(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Engine.IO ping
  if (raw === "2") return { type: "ping" };
  if (raw === "3") return { type: "pong" };

  // Socket.IO connect success
  if (raw.startsWith("0")) {
    try {
      return { type: "connect", data: JSON.parse(raw.slice(1)) };
    } catch {
      return { type: "connect", data: {} };
    }
  }

  // Socket.IO event
  if (raw.startsWith("42")) {
    try {
      const parsed = JSON.parse(raw.slice(2));
      return { type: "event", name: parsed[0], data: parsed[1] };
    } catch {
      return null;
    }
  }

  return null;
}

// --- Main Test ---

export default function () {
  const vuId = __VU;
  const nickname = `Player_${vuId}_${Date.now() % 10000}`;
  const browserClientId = `k6-browser-${vuId}-${Date.now()}`;

  // Step 1: Health check
  group("health_check", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      "health ok": (r) => r.status === 200,
      "status healthy": (r) => r.json().status === "healthy",
    });
  });

  // Step 2: Get session PIN (assumes a session is already in lobby state)
  // In a real test, the admin would create a session first
  // For now, we'll try to get available sessions
  let pin = __ENV.SESSION_PIN || "";
  if (!pin) {
    console.log(`VU ${vuId}: No SESSION_PIN provided, waiting for admin setup...`);
    sleep(2);
    // Try to get session info
    const healthRes = http.get(`${BASE_URL}/api/health`);
    if (healthRes.status !== 200) {
      console.error(`VU ${vuId}: Backend not healthy`);
      return;
    }
  }

  if (!pin) {
    console.error(`VU ${vuId}: No session PIN available, skipping`);
    return;
  }

  // Step 3: Connect via WebSocket and join as player
  const wsUrl = connectSocketIO();

  const res = ws.connect(wsUrl, null, function (socket) {
    let playerId = null;
    let sessionId = null;
    let joinStart = Date.now();
    let answerStart = 0;
    let questionStart = 0;
    let currentQuestionId = null;
    let questionCount = 0;

    socket.on("open", () => {
      // Wait for Socket.IO handshake
    });

    socket.on("message", (rawMsg) => {
      const msg = decodeSocketIOMessage(rawMsg);
      if (!msg) return;

      // Respond to Engine.IO pings
      if (msg.type === "ping") {
        socket.send("3"); // pong
        return;
      }

      // Socket.IO connect success
      if (msg.type === "connect") {
        // Send player:join event
        joinStart = Date.now();
        socket.send(
          encodeSocketIOMessage("event", [
            "player:join",
            { pin, nickname, browserClientId },
          ])
        );
        return;
      }

      if (msg.type !== "event") return;

      switch (msg.name) {
        case "player:joined-success":
          joinLatency.add(Date.now() - joinStart);
          playerId = msg.data.playerId;
          sessionId = msg.data.sessionId;
          console.log(`VU ${vuId}: Joined as ${nickname} (id=${playerId})`);
          break;

        case "game:question-start":
          questionStart = Date.now();
          questionReceiveLatency.add(Date.now() - (msg.data.serverStartTime || questionStart));
          currentQuestionId = msg.data.question.id;
          questionCount++;
          console.log(`VU ${vuId}: Question ${questionCount} received (id=${currentQuestionId})`);

          // Answer after a random delay (simulating thinking time)
          const thinkTime = Math.random() * 3000 + 500; // 0.5-3.5s
          sleep(thinkTime / 1000);

          // Pick a random choice
          const choices = msg.data.question.choices || [];
          const answerData = {
            questionId: currentQuestionId,
            choiceId: choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)].id : null,
            choiceIds: [],
            orderedChoiceIds: [],
            textAnswer: "",
          };

          answerStart = Date.now();
          socket.send(encodeSocketIOMessage("event", ["player:answer", answerData]));
          break;

        case "game:answer-ack":
          answerLatency.add(Date.now() - answerStart);
          answerAckRate.add(1);
          break;

        case "game:batch-results":
          console.log(`VU ${vuId}: Result - correct=${msg.data.isCorrect}, points=${msg.data.pointsAwarded}`);
          break;

        case "game:leaderboard":
          leaderboardLatency.add(Date.now() - questionStart);
          break;

        case "game:quiz-ended":
          console.log(`VU ${vuId}: Quiz ended, total questions: ${questionCount}`);
          socket.close();
          break;

        case "error":
          socketErrors.add(1);
          console.error(`VU ${vuId}: Error - ${msg.data?.message}`);
          break;

        case "game:time-up":
          // Expected event, no action needed
          break;

        case "game:countdown":
          // Countdown before quiz starts
          break;

        default:
          console.log(`VU ${vuId}: Unknown event: ${msg.name}`);
      }
    });

    socket.on("error", (e) => {
      socketErrors.add(1);
      console.error(`VU ${vuId}: WebSocket error: ${e}`);
    });

    // Keep connection alive for up to 4 minutes
    socket.setTimeout(() => {
      console.log(`VU ${vuId}: Timeout, closing connection`);
      socket.close();
    }, 240000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
}
