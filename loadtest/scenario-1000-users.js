/**
 * k6 Load Test - Scenario 3: 1000 Concurrent Users
 * 50 sessions x 20 players, 5min ramp-up, 30min sustain
 * Target: p95 < 50ms, p99 < 100ms, error rate < 0.5%
 *
 * Usage:
 *   k6 run loadtest/scenario-1000-users.js
 *
 * Environment variables:
 *   BASE_URL      - Backend base URL (default: http://localhost:7860)
 *   SESSION_PINS  - Comma-separated PINs for 50 sessions
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:7860";
const WS_URL = BASE_URL.replace(/^http/, "ws");
const SESSION_PINS = (__ENV.SESSION_PINS || "").split(",").filter(Boolean);
const TOTAL_VUS = 1000;
const RAMP_UP_SECONDS = 300;
const SUSTAIN_MINUTES = 30;

// --- Custom Metrics ---
const joinLatency = new Trend("socketio_join_latency", true);
const answerLatency = new Trend("socketio_answer_latency", true);
const questionReceiveLatency = new Trend("socketio_question_receive_latency", true);
const answerAckRate = new Rate("socketio_answer_ack_rate");
const socketErrors = new Counter("socketio_errors");
const successfulJoins = new Counter("successful_joins");
const questionsReceived = new Counter("questions_received");

export const options = {
  scenarios: {
    ramp_players: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_UP_SECONDS}s`, target: TOTAL_VUS },
        { duration: `${SUSTAIN_MINUTES}m`, target: TOTAL_VUS },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    socketio_join_latency: ["p(95)<1000", "p(99)<2000"],
    socketio_answer_latency: ["p(95)<50", "p(99)<100"],
    socketio_question_receive_latency: ["p(95)<200", "p(99)<500"],
    socketio_answer_ack_rate: ["rate>0.95"],
    socketio_errors: ["count<50"],
    http_req_failed: ["rate<0.005"],
  },
};

function encodeSocketIOMessage(type, data) {
  if (type === "event") return `42${JSON.stringify(data)}`;
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

  if (SESSION_PINS.length === 0) {
    console.error("No SESSION_PINS provided");
    return;
  }
  const pin = SESSION_PINS[vuId % SESSION_PINS.length];

  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health ok": (r) => r.status === 200 });

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  const res = ws.connect(wsUrl, null, function (socket) {
    let joinStart = Date.now();
    let answerStart = 0;
    let currentQuestionId = null;
    let questionCount = 0;

    socket.on("message", (rawMsg) => {
      const msg = decodeSocketIOMessage(rawMsg);
      if (!msg) return;

      if (msg.type === "ping") { socket.send("3"); return; }

      if (msg.type === "connect") {
        joinStart = Date.now();
        socket.send(encodeSocketIOMessage("event", [
          "player:join", { pin, nickname, browserClientId },
        ]));
        return;
      }

      if (msg.type !== "event") return;

      switch (msg.name) {
        case "player:joined-success":
          joinLatency.add(Date.now() - joinStart);
          successfulJoins.add(1);
          break;

        case "game:question-start":
          questionReceiveLatency.add(Date.now() - (msg.data.serverStartTime || Date.now()));
          currentQuestionId = msg.data.question.id;
          questionCount++;
          questionsReceived.add(1);

          // Random think time: 1-8 seconds (more realistic for 1000 users)
          const thinkTime = Math.random() * 7000 + 1000;
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
          break;
      }
    });

    socket.on("error", () => { socketErrors.add(1); });

    // 35 minute timeout (sustain + buffer)
    socket.setTimeout(() => { socket.close(); }, 2100000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
}
