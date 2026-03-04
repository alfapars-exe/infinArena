"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useMusicPlayer } from "@/lib/music-context";
import { authedFetch, downloadAuthedFile } from "@/lib/services/auth-client";

interface SessionInfo {
  id: number;
  pin: string;
  status: string;
  createdAt: string;
}

const MUSIC_STORAGE_KEY = "infinarena:music";

type StoredMusic = {
  youtubeUrl?: string;
  youtubeVideoId?: string | null;
  volume?: number;
  isRepeat?: boolean;
  isPlaying?: boolean;
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const maybeError = (err as { error?: unknown }).error;
    if (Array.isArray(maybeError) && maybeError.length > 0) {
      const first = maybeError[0] as { message?: unknown } | unknown;
      if (
        first &&
        typeof first === "object" &&
        typeof (first as { message?: unknown }).message === "string" &&
        (first as { message: string }).message.trim()
      ) {
        return (first as { message: string }).message;
      }
    }
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const nestedMessage = (maybeError as { message?: unknown }).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
    }
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

export default function PublishPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const quizId = params?.id ?? "";
  
  // Use music context instead of local state
  const music = useMusicPlayer();
  const youtubeVideoId = music.youtubeVideoId;
  const isPlaying = music.isPlaying;
  const volume = music.volume;
  const isRepeat = music.isRepeat;
  const togglePlay = music.togglePlay;
  const changeVolume = music.changeVolume;
  const setIsRepeat = (next: boolean) => {
    if (next !== music.isRepeat) {
      music.toggleRepeat();
    }
  };

  const [quiz, setQuiz] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [lastPin, setLastPin] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showMusicInput, setShowMusicInput] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState<number | null>(null);
  const fetchDataRequestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData({ signal: controller.signal, updateLoading: true });
    return () => {
      controller.abort();
    };
  }, [quizId]);

  const fetchData = async (options?: {
    signal?: AbortSignal;
    updateLoading?: boolean;
  }) => {
    const signal = options?.signal;
    const updateLoading = options?.updateLoading ?? false;
    const requestId = ++fetchDataRequestIdRef.current;

    if (updateLoading) {
      setLoading(true);
    }

    try {
      const [quizRes, resultsRes] = await Promise.all([
        authedFetch(`/api/quizzes/${quizId}`, { signal }),
        authedFetch(`/api/quizzes/${quizId}/results`, { signal }),
      ]);

      if (signal?.aborted || requestId !== fetchDataRequestIdRef.current) return;

      if (quizRes.ok) {
        const q = await quizRes.json();
        if (signal?.aborted || requestId !== fetchDataRequestIdRef.current) return;
        setQuiz(q);
        setCustomSlug(q.customSlug || "");
      }
      if (resultsRes.ok) {
        const r = await resultsRes.json();
        if (signal?.aborted || requestId !== fetchDataRequestIdRef.current) return;
        setSessions(r);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error(`Failed to fetch publish data for quiz ${quizId}:`, err);
    } finally {
      if (
        updateLoading &&
        !signal?.aborted &&
        requestId === fetchDataRequestIdRef.current
      ) {
        setLoading(false);
      }
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await authedFetch(`/api/quizzes/${quizId}/publish`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setLastPin(data.pin);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(getErrorMessage(err, t("publish.failed")));
      }
    } finally {
      setPublishing(false);
    }
  };

  const terminateSession = async (sessionId: number) => {
    if (!confirm(t("publish.terminateConfirm"))) return;

    setTerminatingSessionId(sessionId);
    try {
      const res = await authedFetch(
        `/api/quizzes/${quizId}/sessions/${sessionId}/terminate`,
        { method: "POST" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(getErrorMessage(err, t("publish.terminateFailed")));
        return;
      }

      await fetchData();
    } catch (err) {
      alert(getErrorMessage(err, t("publish.terminateFailed")));
    } finally {
      setTerminatingSessionId(null);
    }
  };

  const statusLabels: Record<string, string> = {
    draft: t("dashboard.status.draft"),
    published: t("dashboard.status.published"),
    archived: t("dashboard.status.archived"),
    completed: t("publish.status.completed"),
    lobby: t("publish.status.lobby"),
    in_progress: t("publish.status.inProgress"),
  };

  const copyPin = () => {
    if (lastPin) {
      navigator.clipboard.writeText(lastPin);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  const copyUrl = () => {
    if (lastPin) {
      const url = `${window.location.origin}/play/${lastPin}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const loadYouTube = () => {
    const vid = music.extractVideoId(youtubeUrl);
    if (!vid) return;
    music.changeVideo(vid);
    setShowMusicInput(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-4 border-white/20 border-t-inf-red rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <div className="mx-auto" style={{ maxWidth: "960px" }}>
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3 mb-4 mb-md-5">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("publish.title")}</h1>
          <p className="text-gray-400 mt-1">{quiz?.title}</p>
        </div>
        <Link
          href={`/infinarenapanel/quizzes/${quizId}`}
          className="text-inf-blue hover:text-blue-300 text-sm font-medium"
        >
          {t("publish.back")}
        </Link>
      </div>

      {/* Publish Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white/5 rounded-2xl border border-white/10 p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          {t("publish.createSession")}
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          {t("publish.createSessionDesc")}
        </p>

        <div className="mb-4">
          {showMusicInput ? (
            <div>
              <label className="text-white/60 text-sm block mb-2">
                {t("live.bgMusic")}
              </label>
              <div className="d-flex flex-column flex-md-row gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder={t("live.youtubeMusicPlaceholder")}
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-inf-turquoise"
                />
                <button
                  onClick={loadYouTube}
                  disabled={!youtubeUrl.trim()}
                  className="bg-gradient-to-r from-inf-turquoise to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50 transition-all"
                >
                  {t("live.play")}
                </button>
                <button
                  onClick={() => setShowMusicInput(false)}
                  className="text-white/40 hover:text-white/60 text-xl transition-colors px-2 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : !music.youtubeVideoId ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              onClick={() => setShowMusicInput(true)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M12 3v9.28c-.47-.46-1.12-.75-1.84-.75-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V7h4V3h-5z" />
              </svg>
              {t("live.bgMusic")}
            </motion.button>
          ) : null}

          {music.youtubeVideoId && (
            <div className="flex flex-wrap items-center gap-3 text-white/80 mt-3">
              <button
                onClick={music.togglePlay}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg ${
                  music.isPlaying
                    ? "bg-gradient-to-br from-inf-red to-rose-600 hover:from-red-700 hover:to-rose-700 text-white"
                    : "bg-gradient-to-br from-inf-turquoise to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
                }`}
                aria-label={music.isPlaying ? t("live.pause") : t("live.play")}
                title={music.isPlaying ? t("live.pause") : t("live.play")}
              >
                {music.isPlaying ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l10-6.5-10-6.5z" />
                  </svg>
                )}
              </button>
              <button
                onClick={music.toggleRepeat}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg ${
                  music.isRepeat
                    ? "bg-gradient-to-br from-inf-yellow to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white"
                    : "bg-white/20 hover:bg-white/30 text-white/60 hover:text-white"
                }`}
                aria-label={t("live.loop")}
                title={t("live.loop")}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M3 12a7 7 0 0 1 7-7h7" />
                  <path d="M17 2l4 3-4 3" />
                  <path d="M21 12a7 7 0 0 1-7 7H7" />
                  <path d="M7 22l-4-3 4-3" />
                </svg>
              </button>
              <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-full">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/70" fill="currentColor" aria-hidden="true">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.1v2.7c2.89.86 5 3.54 5 6.9s-2.11 6.04-5 6.9v2.7c4.01-.91 7-4.49 7-9.6s-2.99-8.69-7-9.6z" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={music.volume}
                  onChange={(e) => music.changeVolume(Number(e.target.value))}
                  className="h-2 w-20 accent-inf-turquoise cursor-pointer"
                  aria-label={t("live.volume")}
                  title={`${t("live.volume")}: ${music.volume}%`}
                />
                <span className="text-white/70 text-xs font-medium min-w-6">{music.volume}%</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!youtubeUrl && music.youtubeVideoId) {
                    setYoutubeUrl(`https://youtu.be/${music.youtubeVideoId}`);
                  }
                  setShowMusicInput(true);
                }}
                className="text-sm text-white/70 hover:text-white underline underline-offset-4"
              >
                {t("live.changeMusicLabel")}
              </button>
            </div>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={publish}
          disabled={publishing || (quiz?.questions?.length || 0) === 0}
          className="w-full bg-inf-green hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition-colors shadow-lg"
        >
          {publishing ? t("publish.publishing") : t("publish.publishAndPin")}
        </motion.button>

        {(quiz?.questions?.length || 0) === 0 && (
          <p className="text-inf-red text-sm mt-2">
            {t("publish.addQuestionFirst")}
          </p>
        )}
      </motion.div>

      {/* Generated PIN */}
      {lastPin && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-inf-red/20 rounded-2xl border-2 border-inf-red p-8 mb-6 text-center"
        >
          <h2 className="text-lg text-white/70 mb-2">{t("publish.gamePin")}</h2>
          <div className="text-6xl font-black text-white tracking-wider mb-4">
            {lastPin}
          </div>
          <div className="d-flex flex-column flex-md-row gap-2 gap-md-3 justify-content-center">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={copyPin}
              className="bg-white/20 hover:bg-white/30 text-white font-medium py-2 px-6 rounded-lg transition-colors text-sm"
            >
              {copiedPin ? t("publish.copied") : t("publish.copyPin")}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={copyUrl}
              className="bg-white/20 hover:bg-white/30 text-white font-medium py-2 px-6 rounded-lg transition-colors text-sm"
            >
              {copiedLink ? t("publish.copied") : t("publish.copyLink")}
            </motion.button>
            <Link
              href={`/infinarenapanel/live/${lastPin}`}
              className="bg-inf-green hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-sm"
            >
              {t("publish.startLive")}
            </Link>
          </div>
        </motion.div>
      )}

      {/* Previous Sessions */}
      {sessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/5 rounded-2xl border border-white/10 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            {t("publish.previousSessions")}
          </h2>
          <div className="space-y-2">
            {sessions.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-white/5 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-white font-mono font-bold">
                    {s.pin}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === "completed"
                        ? "bg-green-500/20 text-green-300"
                        : s.status === "lobby"
                        ? "bg-yellow-500/20 text-yellow-300"
                        : "bg-blue-500/20 text-blue-300"
                    }`}
                  >
                    {statusLabels[s.status] || s.status}
                  </span>
                </div>
                <div className="d-flex align-items-center gap-3">
                  <span className="text-gray-500 text-sm">
                    {t("publish.playersCount", { count: s.players?.length || 0 })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadAuthedFile(
                        `/api/quizzes/${quizId}/results/export`,
                        `quiz-${quizId}-results.xlsx`
                      )
                    }
                    className="text-xs text-green-300 hover:text-green-200 transition-colors bg-transparent border-0 p-0"
                  >
                    Excel
                  </button>
                  {s.status !== "completed" && (
                    <Link
                      href={`/infinarenapanel/live/${s.pin}`}
                      className="text-xs text-inf-blue hover:text-blue-300 transition-colors"
                    >
                      {t("publish.continueLive")}
                    </Link>
                  )}
                  {s.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => void terminateSession(s.id)}
                      disabled={terminatingSessionId === s.id}
                      className="text-xs text-red-300 hover:text-red-200 disabled:opacity-60 transition-colors"
                    >
                      {terminatingSessionId === s.id
                        ? t("publish.terminating")
                        : t("publish.terminateSession")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
      </div>
    </div>
  );
}



