const AUDIO_BASE_PATH = "/audio/kahoot";

export type KahootTimeBucket = "5s" | "10s" | "20s" | "30s" | "60s" | "90s" | "120s";

const QUESTION_TRACKS: Record<KahootTimeBucket, readonly string[]> = {
  "5s": [
    `${AUDIO_BASE_PATH}/kahoot-question-5s-1.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-5s-2.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-5s-3.mp3`,
  ],
  "10s": [
    `${AUDIO_BASE_PATH}/kahoot-question-10s-1.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-10s-2.mp3`,
  ],
  "20s": [
    `${AUDIO_BASE_PATH}/kahoot-question-20s-1.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-20s-2.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-20s-3.mp3`,
  ],
  "30s": [
    `${AUDIO_BASE_PATH}/kahoot-question-30s-1.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-30s-2.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-30s-3.mp3`,
  ],
  "60s": [
    `${AUDIO_BASE_PATH}/kahoot-question-60s-1.mp3`,
    `${AUDIO_BASE_PATH}/kahoot-question-60s-2.mp3`,
  ],
  "90s": [`${AUDIO_BASE_PATH}/kahoot-question-90s-1.mp3`],
  "120s": [`${AUDIO_BASE_PATH}/kahoot-question-120s-1.mp3`],
};

export const PHASE_TRACKS = {
  lobby: `${AUDIO_BASE_PATH}/kahoot-lobby-music.mp3`,
  gong: `${AUDIO_BASE_PATH}/kahoot-gong-sound-effect.mp3`,
  podium: `${AUDIO_BASE_PATH}/kahoot-podium-theme-music.mp3`,
} as const;

function clampQuestionTime(seconds: number): number {
  if (!Number.isFinite(seconds)) return 5;
  if (seconds < 0) return 0;
  if (seconds > 120) return 120;
  return seconds;
}

export function resolveBucketByTimeLimit(seconds: number): KahootTimeBucket {
  const normalizedSeconds = clampQuestionTime(seconds);
  if (normalizedSeconds < 5) return "5s";
  if (normalizedSeconds < 10) return "10s";
  if (normalizedSeconds < 20) return "20s";
  if (normalizedSeconds < 30) return "30s";
  if (normalizedSeconds < 60) return "60s";
  if (normalizedSeconds < 90) return "90s";
  return "120s";
}

export function pickTrackNoImmediateRepeat(
  bucket: KahootTimeBucket,
  lastTrack: string | null
): string {
  const tracks = QUESTION_TRACKS[bucket];
  if (tracks.length <= 1) return tracks[0];

  const candidates = tracks.filter((track) => track !== lastTrack);
  const pool = candidates.length > 0 ? candidates : tracks;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

