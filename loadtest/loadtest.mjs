import { io } from "socket.io-client";

const SERVER_URL = "https://argeinfina-infinarena.hf.space";
const PIN = process.argv[2];
const NUM_PLAYERS = parseInt(process.argv[3] || "50", 10);

if (!PIN) {
    console.error("Usage: node loadtest.js <PIN> [NUM_PLAYERS]");
    process.exit(1);
}

console.log(`Starting load test with ${NUM_PLAYERS} players on PIN: ${PIN}`);

const players = [];
let joinedCount = 0;
let answerCounts = 0;

function createPlayer(index) {
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const socket = io(SERVER_URL, {
        path: "/api/socketio",
        reconnection: true,
        extraHeaders: {
            "x-forwarded-for": randomIp
        }
    });

    const nickname = `TestBot_${index}`;

    socket.on("connect", () => {
        socket.emit("player:join", {
            pin: PIN,
            nickname,
            browserClientId: `bot-${index}-${Date.now()}`,
        });
    });

    socket.on("player:joined-success", () => {
        joinedCount++;
        console.log(`✅ [${joinedCount}/${NUM_PLAYERS}] ${nickname} joined successfully`);
    });

    socket.on("game:question-start", (data) => {
        const question = data.question;
        console.log(`🎯 Question started for ${nickname}. Choices: ${question.choices.length}`);

        // Pick a random choice ID and simulate human thinking time
        const randomChoice = question.choices[Math.floor(Math.random() * question.choices.length)];
        const delayMs = Math.floor(Math.random() * 8000) + 1000; // Between 1s and 9s

        setTimeout(() => {
            socket.emit("player:answer", {
                questionId: question.id,
                choiceId: randomChoice.id,
                responseTimeMs: delayMs,
            });
        }, delayMs);
    });

    socket.on("game:answer-ack", () => {
        answerCounts++;
        console.log(`✔️ [${answerCounts}] ${nickname} answer acknowledged`);
    });

    socket.on("game:time-up", () => {
        console.log(`⏱️ Time is up for ${nickname}`);
    });

    socket.on("game:quiz-ended", () => {
        console.log(`🏁 Quiz ended for ${nickname}`);
    });

    socket.on("error", (err) => {
        console.error(`❌ Error for ${nickname}:`, err);
    });

    socket.on("disconnect", (reason) => {
        console.log(`🔌 ${nickname} disconnected: ${reason}`);
    });

    return socket;
}

// Stagger connections
for (let i = 1; i <= NUM_PLAYERS; i++) {
    setTimeout(() => {
        players.push(createPlayer(i));
    }, i * 150); // 150ms between each connection to avoid DDoSing handshake
}
