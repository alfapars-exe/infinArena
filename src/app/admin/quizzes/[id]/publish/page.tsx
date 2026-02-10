"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

interface SessionInfo {
  id: number;
  pin: string;
  status: string;
  createdAt: string;
}

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

  const [quiz, setQuiz] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [lastPin, setLastPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customSlug, setCustomSlug] = useState("");

  useEffect(() => {
    fetchData();
  }, [quizId]);

  const fetchData = async () => {
    const [quizRes, resultsRes] = await Promise.all([
      fetch(`/api/quizzes/${quizId}`),
      fetch(`/api/quizzes/${quizId}/results`),
    ]);

    if (quizRes.ok) {
      const q = await quizRes.json();
      setQuiz(q);
      setCustomSlug(q.customSlug || "");
    }
    if (resultsRes.ok) {
      const r = await resultsRes.json();
      setSessions(r);
    }
    setLoading(false);
  };

  const publish = async () => {
    setPublishing(true);

    // Save custom slug first
    if (customSlug) {
      await fetch(`/api/quizzes/${quizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quiz.title,
          description: quiz.description,
          customSlug: customSlug || null,
        }),
      });
    }

    const res = await fetch(`/api/quizzes/${quizId}/publish`, {
      method: "POST",
    });

    if (res.ok) {
      const data = await res.json();
      setLastPin(data.pin);
      fetchData();
    } else {
      const err = await res.json();
      alert(getErrorMessage(err, t("publish.failed")));
    }
    setPublishing(false);
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyUrl = () => {
    if (lastPin) {
      const url = `${window.location.origin}/play/${lastPin}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

      {/* Custom URL */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 rounded-2xl border border-white/10 p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          {t("publish.customUrlOptional")}
        </h2>
        <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2">
          <span className="text-gray-400 text-sm">
            {typeof window !== "undefined" ? window.location.origin : ""}/quiz/
          </span>
          <input
            type="text"
            value={customSlug}
            onChange={(e) =>
              setCustomSlug(
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            className="input-field bg-white/10 text-sm flex-1"
            placeholder={t("publish.customSlugPlaceholder")}
          />
        </div>
      </motion.div>

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
              {copied ? t("publish.copied") : t("publish.copyPin")}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={copyUrl}
              className="bg-white/20 hover:bg-white/30 text-white font-medium py-2 px-6 rounded-lg transition-colors text-sm"
            >
              {t("publish.copyLink")}
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
                <span className="text-gray-500 text-sm">
                  {t("publish.playersCount", { count: s.players?.length || 0 })}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
      </div>
    </div>
  );
}



