# infinArena Load Tests

k6-based load test scenarios for the infinArena backend.

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Windows (choco)
choco install k6

# Docker
docker run --rm -i grafana/k6 run - <scenario-baseline.js
```

## Scenarios

### Scenario 1: Baseline (20 players)

Single session, 20 players, 10 questions. Validates basic functionality under load.

```bash
# 1. Start backend + create a quiz session in lobby state
# 2. Run the test with the session PIN
k6 run --env SESSION_PIN=123456 loadtest/scenario-baseline.js
```

**Targets**: p95 join < 500ms, p95 answer < 100ms, p95 question receive < 200ms

### Scenario 2: 200 Users

10 sessions x 20 players with 30s ramp-up. Tests concurrent multi-session load.

```bash
# Provide comma-separated PINs for 10 sessions
k6 run --env SESSION_PINS=111111,222222,333333,444444,555555,666666,777777,888888,999999,000000 \
       loadtest/scenario-200-users.js
```

**Targets**: p95 answer < 100ms, error rate < 0.1%

### Scenario 3: 1000 Users

50 sessions x 20 players with 5min ramp-up and 30min sustain. Full-scale production simulation.

```bash
k6 run --env SESSION_PINS=<50 comma-separated PINs> loadtest/scenario-1000-users.js
```

**Targets**: p95 answer < 50ms, p99 < 100ms, error rate < 0.5%

### Scenario 4: Reconnect Resilience

100 players join, disconnect mid-game, then rejoin. Validates reconnect handling under load.

```bash
k6 run --env SESSION_PIN=123456 loadtest/scenario-reconnect.js
```

**Targets**: 99% reconnect success, p95 rejoin < 5s

### Scenario 5: Thundering Herd

500 players in a single session, all answering within 3 seconds. Stress tests broadcast storm and concurrent write handling.

```bash
k6 run --env SESSION_PIN=123456 loadtest/scenario-thundering-herd.js
```

**Targets**: p95 answer < 200ms, p95 broadcast < 200ms, answer ack rate > 95%

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:7860` | Backend HTTP URL |
| `SESSION_PIN` | (required) | 6-digit session PIN |
| `SESSION_PINS` | (required for 200-user) | Comma-separated PINs |
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASS` | `admin123` | Admin password |
| `QUIZ_ID` | `1` | Quiz ID to publish |

## Interpreting Results

Key metrics to watch:

- `socketio_join_latency` - Time from join request to success response
- `socketio_answer_latency` - Time from answer submission to ACK
- `socketio_question_receive_latency` - Server-to-client question broadcast time
- `socketio_errors` - Total Socket.IO error events
- `socketio_answer_ack_rate` - Percentage of answers acknowledged
