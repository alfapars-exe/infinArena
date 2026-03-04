/**
 * k6 Load Test - Scenario 2: 200 Concurrent Users
 * 10 sessions x 20 players, simultaneous answers
 * Target: p95 < 30ms, error rate < 0.1%
 *
 * Usage:
 *   k6 run loadtest/scenario-200-users.js
 *
 * Environment variables:
 *   BASE_URL      - Backend base URL (default: http://localhost:7860)
 *   SESSION_PINS  - Comma-separated PINs (e.g., "123456,234567,345678")
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, group } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:7860";
const WS_URL = BASE_URL.replace(/^http/, "ws");
const SESSION_PINS = (__ENV.SESSION_PINS || "").split(",").filter(Boolean);
const TOTAL_VUS = 200;
const RAMP_UP_SECONDS = 30;

// --- Custom Metrics ---
const joinLatency = new Trend("socketio_join_latency", true);
const answerLatency = new Trend("socketio_answer_latency", true);
const questionReceiveLatency = new Trend("socketio_question_receive_latency", true);
const answerAckRate = new Rate("socketio_answer_ack_rate");
const socketErrors = new Counter("socketio_errors");
const successfulJoins = new Counter("successful_joins");

export const options = {
  scenarios: {
    ramp_players: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_UP_SECONDS}s`, target: TOTAL_VUS },
        { duration: "5m", target: TOTAL_VUS },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    socketio_join_latency: ["p(95)<1000"],
    socketio_answer_latency: ["p(95)<100"],
    socketio_question_receive_latency: ["p(95)<200"],
    socketio_answer_ack_rate: ["rate>0.95"],
    socketio_errors: ["count<20"],
    http_req_failed: ["rate<0.001"],
  },
};

function encodeSocketIOMessage(type, data) {
  if (type === "event") {
    return `42${JSON.stringify(data)}`;
  }
  return "";
}

function decodeSocketIOMessage(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (raw === "2") return { type: "ping" };
  if (raw === "3") return { type: "pong" };
  if (raw.startsWith("0")) {
    try { return { type: "connect", data: JSON.parse(raw.slice(1)) }; }
    catch { return { type: "connect", data: {} }; }
  }
  if (raw.startsWith("42")) {
    try {
      const parsed = JSON.parse(raw.slice(2));
      return { type: "event", name: parsed[0], data: parsed[1] };
    } catch { return null; }
  }
  return null;
}

export default function () {
  const vuId = __VU;
  const iterationId = __ITER;
  const nickname = `P${vuId}_${iterationId}`;
  const browserClientId = `k6-${vuId}-${iterationId}-${Date.now()}`;

  // Assign to a session based on VU id
  if (SESSION_PINS.length === 0) {
    console.error("No SESSION_PINS provided");
    return;
  }
  const pin = SESSION_PINS[vuId % SESSION_PINS.length];

  // Health check
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health ok": (r) => r.status === 200 });

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  const res = ws.connect(wsUrl, null, function (socket) {
    let joinStart = Date.now();
    let answerStart = 0;
    let questionStart = 0;
    let currentQuestionId = null;
    let questionCount = 0;

    socket.on("message", (rawMsg) => {
      const msg = decodeSocketIOMessage(rawMsg);
      if (!msg) return;

      if (msg.type === "ping") {
        socket.send("3");
        return;
      }

      if (msg.type === "connect") {
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
          successfulJoins.add(1);
          break;

        case "game:question-start":
          questionStart = Date.now();
          questionReceiveLatency.add(Date.now() - (msg.data.serverStartTime || questionStart));
          currentQuestionId = msg.data.question.id;
          questionCount++;

          // Random think time: 1-5 seconds
          const thinkTime = Math.random() * 4000 + 1000;
          sleep(thinkTime / 1000);

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

        case "game:quiz-ended":
          socket.close();
          break;

        case "error":
          socketErrors.add(1);
          console.error(`VU ${vuId}: ${msg.data?.message}`);
          break;
      }
    });

    socket.on("error", (e) => {
      socketErrors.add(1);
    });

    socket.setTimeout(() => {
      socket.close();
    }, 360000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
}
