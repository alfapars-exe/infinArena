/**
 * k6 Load Test - Scenario 5: Thundering Herd
 * 500 players in a single session, all answer within 3 seconds.
 * Tests broadcast storm and concurrent answer processing.
 * Target: all broadcasts within 200ms, no dropped answers
 *
 * Usage:
 *   k6 run loadtest/scenario-thundering-herd.js
 *
 * Environment variables:
 *   BASE_URL    - Backend base URL (default: http://localhost:7860)
 *   SESSION_PIN - 6-digit session PIN for a single large session
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:7860";
const WS_URL = BASE_URL.replace(/^http/, "ws");
const SESSION_PIN = __ENV.SESSION_PIN || "";
const PLAYER_COUNT = 500;
const ANSWER_WINDOW_SECONDS = 3;

// --- Custom Metrics ---
const joinLatency = new Trend("socketio_join_latency", true);
const answerLatency = new Trend("socketio_answer_latency", true);
const questionReceiveLatency = new Trend("socketio_question_receive_latency", true);
const broadcastLatency = new Trend("socketio_broadcast_latency", true);
const answerAckRate = new Rate("socketio_answer_ack_rate");
const socketErrors = new Counter("socketio_errors");
const successfulJoins = new Counter("successful_joins");
const answersSubmitted = new Counter("answers_submitted");
const answersAcked = new Counter("answers_acked");

export const options = {
  scenarios: {
    thundering_herd: {
      executor: "per-vu-iterations",
      vus: PLAYER_COUNT,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  thresholds: {
    socketio_join_latency: ["p(95)<2000"],
    socketio_answer_latency: ["p(95)<200", "p(99)<500"],
    socketio_question_receive_latency: ["p(95)<200"],
    socketio_answer_ack_rate: ["rate>0.95"],
    socketio_errors: ["count<25"],
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
  const nickname = `Herd_${vuId}`;
  const browserClientId = `k6-herd-${vuId}-${Date.now()}`;

  if (!SESSION_PIN) {
    console.error("No SESSION_PIN provided");
    return;
  }

  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health ok": (r) => r.status === 200 });

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  const res = ws.connect(wsUrl, null, function (socket) {
    let joinStart = Date.now();
    let answerStart = 0;
    let questionCount = 0;

    socket.on("message", (rawMsg) => {
      const msg = decodeSocketIOMessage(rawMsg);
      if (!msg) return;

      if (msg.type === "ping") { socket.send("3"); return; }

      if (msg.type === "connect") {
        joinStart = Date.now();
        socket.send(encodeSocketIOMessage("event", [
          "player:join", { pin: SESSION_PIN, nickname, browserClientId },
        ]));
        return;
      }

      if (msg.type !== "event") return;

      switch (msg.name) {
        case "player:joined-success":
          joinLatency.add(Date.now() - joinStart);
          successfulJoins.add(1);
          break;

        case "game:question-start": {
          const serverStartTime = msg.data.serverStartTime || Date.now();
          const receiveTime = Date.now();
          questionReceiveLatency.add(receiveTime - serverStartTime);
          broadcastLatency.add(receiveTime - serverStartTime);
          questionCount++;

          const questionId = msg.data.question.id;
          const choices = msg.data.question.choices || [];

          // ALL players answer within the answer window (thundering herd)
          const thinkTime = Math.random() * ANSWER_WINDOW_SECONDS;
          sleep(thinkTime);

          const answerData = {
            questionId,
            choiceId: choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)].id : null,
            choiceIds: [],
            orderedChoiceIds: [],
            textAnswer: "",
          };

          answerStart = Date.now();
          socket.send(encodeSocketIOMessage("event", ["player:answer", answerData]));
          answersSubmitted.add(1);
          break;
        }

        case "game:answer-ack":
          answerLatency.add(Date.now() - answerStart);
          answerAckRate.add(1);
          answersAcked.add(1);
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

    socket.on("error", () => { socketErrors.add(1); });

    // 10 minute timeout
    socket.setTimeout(() => { socket.close(); }, 600000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
}
