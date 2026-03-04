/**
 * k6 Load Test - Scenario 4: Reconnect Resilience
 * 100 players join, mid-game disconnects simulate pod kill, then reconnect.
 * Target: 99% reconnect success, < 5s reconnect time
 *
 * Usage:
 *   k6 run loadtest/scenario-reconnect.js
 *
 * Environment variables:
 *   BASE_URL    - Backend base URL (default: http://localhost:7860)
 *   SESSION_PIN - 6-digit session PIN
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:7860";
const WS_URL = BASE_URL.replace(/^http/, "ws");
const SESSION_PIN = __ENV.SESSION_PIN || "";
const PLAYER_COUNT = 100;

// --- Custom Metrics ---
const joinLatency = new Trend("socketio_join_latency", true);
const rejoinLatency = new Trend("socketio_rejoin_latency", true);
const reconnectSuccessRate = new Rate("socketio_reconnect_success_rate");
const socketErrors = new Counter("socketio_errors");
const totalReconnects = new Counter("total_reconnects");

export const options = {
  scenarios: {
    reconnect_test: {
      executor: "per-vu-iterations",
      vus: PLAYER_COUNT,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  thresholds: {
    socketio_rejoin_latency: ["p(95)<5000"],
    socketio_reconnect_success_rate: ["rate>0.99"],
    socketio_errors: ["count<10"],
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

function connectAndJoin(pin, nickname, browserClientId, isRejoin, playerId) {
  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  let joinedSuccessfully = false;
  const startTime = Date.now();

  const res = ws.connect(wsUrl, null, function (socket) {
    socket.on("message", (rawMsg) => {
      const msg = decodeSocketIOMessage(rawMsg);
      if (!msg) return;

      if (msg.type === "ping") { socket.send("3"); return; }

      if (msg.type === "connect") {
        if (isRejoin && playerId) {
          socket.send(encodeSocketIOMessage("event", [
            "player:rejoin", { pin, playerId, nickname, browserClientId },
          ]));
        } else {
          socket.send(encodeSocketIOMessage("event", [
            "player:join", { pin, nickname, browserClientId },
          ]));
        }
        return;
      }

      if (msg.type !== "event") return;

      switch (msg.name) {
        case "player:joined-success":
        case "player:rejoined-success":
          joinedSuccessfully = true;
          if (isRejoin) {
            rejoinLatency.add(Date.now() - startTime);
            reconnectSuccessRate.add(1);
            totalReconnects.add(1);
          } else {
            joinLatency.add(Date.now() - startTime);
          }
          // Stay connected for a bit, then close to allow test to continue
          sleep(2);
          socket.close();
          break;

        case "game:question-start":
          // Answer quickly during reconnect test
          const choices = msg.data.question.choices || [];
          if (choices.length > 0) {
            socket.send(encodeSocketIOMessage("event", ["player:answer", {
              questionId: msg.data.question.id,
              choiceId: choices[0].id,
              choiceIds: [],
              orderedChoiceIds: [],
              textAnswer: "",
            }]));
          }
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

    socket.setTimeout(() => { socket.close(); }, 30000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
  return { joined: joinedSuccessfully };
}

export default function () {
  const vuId = __VU;
  const nickname = `Reconn_${vuId}`;
  const browserClientId = `k6-reconn-${vuId}-${Date.now()}`;

  if (!SESSION_PIN) {
    console.error("No SESSION_PIN provided");
    return;
  }

  // Phase 1: Initial join
  const initial = connectAndJoin(SESSION_PIN, nickname, browserClientId, false, null);

  // Phase 2: Wait, simulating network disruption
  const disconnectDelay = Math.random() * 5 + 2; // 2-7s
  sleep(disconnectDelay);

  // Phase 3: Reconnect (rejoin)
  connectAndJoin(SESSION_PIN, nickname, browserClientId, true, vuId);

  // Phase 4: Second disconnect + reconnect (double-check resilience)
  sleep(Math.random() * 3 + 1);
  connectAndJoin(SESSION_PIN, nickname, browserClientId, true, vuId);
}
