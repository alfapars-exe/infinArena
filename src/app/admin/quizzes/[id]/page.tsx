"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

interface Choice {
  id?: number;
  choiceText: string;
  isCorrect: boolean;
  orderIndex: number;
}

type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "multi_select"
  | "text_input"
  | "ordering";

interface Question {
  id?: number;
  questionText: string;
  questionType: QuestionType;
  timeLimitSeconds: number;
  basePoints: number;
  deductionPoints: number;
  deductionInterval: number;
  mediaUrl?: string | null;
  backgroundUrl?: string | null;
  choices: Choice[];
  isEditing?: boolean;
}

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  status: string;
  questions: Question[];
}

const CHOICE_COLORS = [
  "bg-inf-red",
  "bg-inf-blue",
  "bg-inf-yellow",
  "bg-inf-green",
  "bg-purple-700",
  "bg-teal-700",
  "bg-orange-700",
  "bg-slate-600",
];

const CHOICE_SHAPES = ["▲", "◆", "●", "■"];

function getChoiceColor(index: number): string {
  return CHOICE_COLORS[index % CHOICE_COLORS.length];
}

function getStableChoiceColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return CHOICE_COLORS[Math.abs(hash) % CHOICE_COLORS.length];
}

function getStableChoiceShape(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return CHOICE_SHAPES[Math.abs(hash) % CHOICE_SHAPES.length];
}

function getChoiceShape(index: number): string {
  return CHOICE_SHAPES[index % CHOICE_SHAPES.length];
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

export default function QuizEditor() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const quizId = params?.id ? parseInt(params.id, 10).toString() : "";

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Question>(getDefaultQuestion());
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getDefaultQuestion(): Question {
    return {
      questionText: "",
      questionType: "multiple_choice",
      timeLimitSeconds: 20,
      basePoints: 1000,
      deductionPoints: 50,
      deductionInterval: 1,
      backgroundUrl: null,
      choices: [
        { choiceText: "", isCorrect: true, orderIndex: 0 },
        { choiceText: "", isCorrect: false, orderIndex: 1 },
        { choiceText: "", isCorrect: false, orderIndex: 2 },
        { choiceText: "", isCorrect: false, orderIndex: 3 },
      ],
    };
  }

  useEffect(() => {
    fetchQuiz();
  }, [quizId]);

  const fetchQuiz = async () => {
    if (!quizId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (res.ok) {
        const data = await res.json();
        setQuiz(data);
        setEditTitle(data.title);
        setEditDescription(data.description || "");
      } else {
        console.error(`Failed to fetch quiz ${quizId}:`, res.status);
      }
    } catch (err) {
      console.error(`Error fetching quiz ${quizId}:`, err);
    }
    setLoading(false);
  };

  // Auto-save debounce
  useEffect(() => {
    if (!quiz || loading) return;
    if (editTitle === quiz.title && editDescription === (quiz.description || "")) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      await fetch(`/api/quizzes/${quizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    }, 2000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editTitle, editDescription]);

  const saveQuizInfo = async () => {
    setSaving(true);
    await fetch(`/api/quizzes/${quizId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
      }),
    });
    setSaving(false);
    fetchQuiz();
  };

  const addQuestion = async () => {
    if (!newQuestion.questionText.trim()) return;

    const res = await fetch(`/api/quizzes/${quizId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newQuestion,
        mediaUrl: newQuestion.mediaUrl || null,
        backgroundUrl: newQuestion.backgroundUrl || null,
      }),
    });

    if (res.ok) {
      setShowAddQuestion(false);
      setNewQuestion(getDefaultQuestion());
      fetchQuiz();
    } else {
      const err = await res.json();
      alert(getErrorMessage(err, t("editor.addFailed")));
    }
  };

  const updateQuestion = async (question: Question) => {
    if (!question.id) return;

    await fetch(`/api/quizzes/${quizId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        timeLimitSeconds: question.timeLimitSeconds,
        basePoints: question.basePoints,
        deductionPoints: question.deductionPoints,
        deductionInterval: question.deductionInterval,
        mediaUrl: question.mediaUrl || null,
        backgroundUrl: question.backgroundUrl || null,
        choices: question.choices.map((c) => ({
          choiceText: c.choiceText,
          isCorrect: c.isCorrect,
        })),
      }),
    });

    fetchQuiz();
  };

  const deleteQuestion = async (questionId: number) => {
    if (!confirm(t("editor.deleteConfirm"))) return;

    await fetch(`/api/quizzes/${quizId}/questions?questionId=${questionId}`, {
      method: "DELETE",
    });
    fetchQuiz();
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

  if (!quiz) {
    return <div className="text-white text-center py-20">{t("editor.quizNotFound")}</div>;
  }

  return (
    <div className="container-fluid px-0">
      <div className="mx-auto" style={{ maxWidth: "1120px" }}>
      {/* Quiz Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 rounded-2xl border border-white/10 p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white/70">{t("editor.quizDetails")}</h2>
          <div className="flex gap-2">
            <Link
              href={`/infinarenapanel/quizzes/${quizId}/publish`}
              className="bg-inf-green hover:bg-green-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors"
            >
              {t("editor.publish")}
            </Link>
            <Link
              href={`/infinarenapanel/quizzes/${quizId}/results`}
              className="bg-inf-blue hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors"
            >
              {t("editor.results")}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/60 text-sm mb-1">{t("editor.title")}</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input-field bg-white/10 text-sm"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">
              {t("editor.description")}
            </label>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="input-field bg-white/10 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {autoSaveStatus === "saving" && (
            <span className="text-white/40 text-sm">{t("editor.saving")}</span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-green-400 text-sm">{t("editor.saved")}</span>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={saveQuizInfo}
            disabled={saving}
            className="bg-inf-red hover:bg-red-700 text-white text-sm font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? t("editor.saving") : t("editor.save")}
          </motion.button>
        </div>
      </motion.div>

      {/* Questions */}
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3 mb-4 mb-md-6">
        <h2 className="text-2xl font-bold text-white">
          {t("editor.questions")} ({quiz.questions.length})
        </h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAddQuestion(true)}
          className="bg-inf-green hover:bg-green-700 text-white font-bold py-2 px-5 rounded-xl shadow-lg transition-colors"
        >
          {t("editor.addQuestion")}
        </motion.button>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {quiz.questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              onUpdate={updateQuestion}
              onDelete={() => q.id && deleteQuestion(q.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {quiz.questions.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">📝</div>
          <p className="text-lg">{t("editor.noQuestions")}</p>
        </div>
      )}

      {/* Add Question Modal */}
      <AnimatePresence>
        {showAddQuestion && (
          <QuestionModal
            question={newQuestion}
            onChange={setNewQuestion}
            onSave={addQuestion}
            onClose={() => {
              setShowAddQuestion(false);
              setNewQuestion(getDefaultQuestion());
            }}
            title={t("editor.addNew")}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  onUpdate,
  onDelete,
}: {
  question: Question;
  index: number;
  onUpdate: (q: Question) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editQ, setEditQ] = useState(question);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ delay: index * 0.05 }}
        className="bg-white/5 rounded-xl border border-white/10 overflow-hidden"
      >
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <span className="bg-inf-red text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                {index + 1}
              </span>
              <div className="flex-1">
                <h3 className="text-white font-semibold text-lg">
                  {question.questionText}
                </h3>
                {question.mediaUrl && (
                  <img
                    src={question.mediaUrl}
                    alt="Question media"
                    className="max-h-20 rounded-lg mt-2 object-contain"
                  />
                )}
                {question.backgroundUrl && (
                  <div className="mt-2 text-xs text-white/60">{t("editor.backgroundSet")}</div>
                )}
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                  <span>{question.timeLimitSeconds}{t("editor.secondsShort")}</span>
                  <span>|</span>
                  <span>{question.basePoints} {t("editor.pointsShort")}</span>
                  <span>|</span>
                  <span>-{question.deductionPoints}{t("editor.pointsShort")}/{question.deductionInterval}{t("editor.secondsShort")}</span>
                  <span>|</span>
                  <span className="capitalize">
                    {question.questionType === "multiple_choice"
                      ? t("editor.multipleChoice")
                      : question.questionType === "true_false"
                      ? t("editor.trueFalse")
                      : question.questionType === "multi_select"
                      ? t("editor.multiSelect")
                      : question.questionType === "ordering"
                      ? t("editor.ordering")
                      : t("editor.textInput")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => {
                  setEditQ({ ...question });
                  setEditing(true);
                }}
                className="text-inf-blue hover:text-blue-300 text-sm font-medium"
              >
                {t("editor.editQuestion")}
              </button>
              <button
                onClick={onDelete}
                className="text-inf-red hover:text-red-300 text-sm font-medium"
              >
                {t("editor.delete")}
              </button>
            </div>
          </div>

          {/* Choices preview */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {question.choices.map((c, ci) => (
              <div
                key={ci}
                className={`${getChoiceColor(ci)} ${
                  question.questionType === "ordering" || question.questionType === "text_input"
                    ? ""
                    : c.isCorrect
                    ? "ring-2 ring-white"
                    : "opacity-70"
                } rounded-lg px-3 py-2 text-white text-sm flex items-center gap-2`}
              >
                <span className="text-xs">{getChoiceShape(ci)}</span>
                <span className="truncate">{c.choiceText || t("editor.empty")}</span>
                {question.questionType === "ordering" ? (
                  <span className="ml-auto text-xs font-bold bg-white/20 rounded-full w-5 h-5 flex items-center justify-center">{ci + 1}</span>
                ) : question.questionType === "text_input" ? null : (
                  c.isCorrect && <span className="ml-auto text-xs">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {editing && (
          <QuestionModal
            question={editQ}
            onChange={setEditQ}
            onSave={() => {
              onUpdate(editQ);
              setEditing(false);
            }}
            onClose={() => setEditing(false)}
            title={`${t("editor.editQuestion")} ${index + 1}`}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function QuestionModal({
  question,
  onChange,
  onSave,
  onClose,
  title,
}: {
  question: Question;
  onChange: (q: Question) => void;
  onSave: () => void;
  onClose: () => void;
  title: string;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const handleAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "mediaUrl" | "backgroundUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.url || data.absoluteUrl;
        if (!url) {
          throw new Error("No URL returned from upload");
        }
        console.log(`✓ Upload successful: ${field} = ${url}`);
        onChange({ ...question, [field]: url });
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errMsg = getErrorMessage(err, `${t("editor.uploadFailed")} (${res.status})`);
        console.error(`✗ Upload failed: ${field}`, errMsg);
        alert(errMsg);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : t("editor.uploadFailed");
      console.error(`✗ Upload error: ${field}`, error);
      alert(errMsg);
    }
    setUploading(false);
  };

  const updateChoice = (index: number, field: string, value: any) => {
    const choices = [...question.choices];
    if (
      field === "isCorrect" &&
      value === true &&
      (question.questionType === "multiple_choice" ||
        question.questionType === "true_false")
    ) {
      choices.forEach((c, i) => {
        c.isCorrect = i === index;
      });
    } else {
      (choices[index] as any)[field] = value;
    }
    choices.forEach((c, i) => {
      c.orderIndex = i;
      if (question.questionType === "text_input" || question.questionType === "ordering") {
        c.isCorrect = true;
      }
    });
    onChange({ ...question, choices });
  };

  const handleTypeChange = (type: QuestionType) => {
    if (type === "true_false") {
      onChange({
        ...question,
        questionType: type,
        choices: [
          { choiceText: t("editor.true"), isCorrect: true, orderIndex: 0 },
          { choiceText: t("editor.false"), isCorrect: false, orderIndex: 1 },
        ],
      });
    } else if (type === "text_input") {
      onChange({
        ...question,
        questionType: type,
        choices: [{ choiceText: "", isCorrect: true, orderIndex: 0 }],
      });
    } else if (type === "ordering") {
      onChange({
        ...question,
        questionType: type,
        choices: [
          { choiceText: "", isCorrect: true, orderIndex: 0 },
          { choiceText: "", isCorrect: true, orderIndex: 1 },
          { choiceText: "", isCorrect: true, orderIndex: 2 },
          { choiceText: "", isCorrect: true, orderIndex: 3 },
        ],
      });
    } else if (type === "multi_select") {
      onChange({
        ...question,
        questionType: type,
        choices: [
          { choiceText: "", isCorrect: true, orderIndex: 0 },
          { choiceText: "", isCorrect: false, orderIndex: 1 },
          { choiceText: "", isCorrect: false, orderIndex: 2 },
          { choiceText: "", isCorrect: false, orderIndex: 3 },
        ],
      });
    } else {
      onChange({
        ...question,
        questionType: type,
        choices: [
          { choiceText: "", isCorrect: true, orderIndex: 0 },
          { choiceText: "", isCorrect: false, orderIndex: 1 },
          { choiceText: "", isCorrect: false, orderIndex: 2 },
          { choiceText: "", isCorrect: false, orderIndex: 3 },
        ],
      });
    }
  };

  const moveChoice = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= question.choices.length) return;
    const choices = [...question.choices];
    const [item] = choices.splice(index, 1);
    choices.splice(newIndex, 0, item);
    onChange({
      ...question,
      choices: choices.map((c, i) => ({ ...c, orderIndex: i })),
    });
  };

  const addChoice = () => {
    if (question.choices.length >= 8) return;
    const choices = [
      ...question.choices,
      {
        choiceText: "",
        isCorrect:
          question.questionType === "text_input" ||
          question.questionType === "ordering",
        orderIndex: question.choices.length,
      },
    ];
    onChange({ ...question, choices });
  };

  const removeChoice = (index: number) => {
    if (question.choices.length <= 1) return;
    const choices = question.choices
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, orderIndex: i }));
    onChange({ ...question, choices });
  };

  const hasEmptyChoice = question.choices.some((c) => !c.choiceText.trim());
  const correctCount = question.choices.filter((c) => c.isCorrect).length;
  const hasValidCorrect =
    question.questionType === "multiple_choice" ||
    question.questionType === "true_false"
      ? correctCount === 1
      : question.questionType === "multi_select"
      ? correctCount >= 1
      : true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm d-flex align-items-start justify-content-center z-50 p-3 p-md-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-2xl w-full border border-white/10 mt-2 mt-md-3 modal-shell"
        style={{ maxWidth: "960px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky-modal-header px-4 px-md-6 py-4 border-b border-white/10 rounded-t-2xl">
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>

        <div className="modal-body-scroll px-4 px-md-6 py-4 space-y-4">
          {/* Question Text */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-1">
              {t("editor.question")}
            </label>
            <textarea
              value={question.questionText}
              onChange={(e) =>
                onChange({ ...question, questionText: e.target.value })
              }
              className="input-field bg-white/10 resize-none h-20"
              placeholder={t("editor.enterQuestion")}
            />
          </div>

          {/* Image Upload */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <label className="block text-white/70 text-sm font-medium mb-3">
              {t("editor.image")}
            </label>
            {question.mediaUrl ? (
              <div className="flex flex-col items-start gap-4">
                <div className="w-full bg-black/30 rounded-lg p-3 flex items-center justify-center min-h-48">
                  <img
                    src={question.mediaUrl}
                    alt="Preview"
                    className="max-w-full max-h-48 rounded-lg object-contain"
                  />
                </div>
                <button
                  onClick={() => onChange({ ...question, mediaUrl: null })}
                  className="text-inf-red hover:text-red-300 text-sm font-medium transition-colors"
                >
                  {t("editor.remove")}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center gap-2 cursor-pointer bg-white/10 border border-white/20 rounded-lg px-4 py-3 hover:bg-white/15 transition-colors disabled:opacity-50"
                >
                  <span className="text-white/60 text-sm">
                    {uploading ? t("editor.uploading") : t("editor.uploadImage")}
                  </span>
                </button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAssetUpload(e, "mediaUrl")}
                  className="hidden"
                  disabled={uploading}
                />
              </>
            )}
          </div>

          {/* Background Upload */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <label className="block text-white/70 text-sm font-medium mb-3">
              {t("editor.backgroundImage")}
            </label>
            {question.backgroundUrl ? (
              <div className="flex flex-col items-start gap-4">
                <div className="w-full bg-black/30 rounded-lg p-3 flex items-center justify-center min-h-48">
                  <img
                    src={question.backgroundUrl}
                    alt="Background preview"
                    className="max-w-full max-h-48 rounded-lg object-cover"
                  />
                </div>
                <button
                  onClick={() => onChange({ ...question, backgroundUrl: null })}
                  className="text-inf-red hover:text-red-300 text-sm font-medium transition-colors"
                >
                  {t("editor.remove")}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center gap-2 cursor-pointer bg-white/10 border border-white/20 rounded-lg px-4 py-3 hover:bg-white/15 transition-colors disabled:opacity-50"
                >
                  <span className="text-white/60 text-sm">
                    {uploading ? t("editor.uploading") : t("editor.uploadBackground")}
                  </span>
                </button>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAssetUpload(e, "backgroundUrl")}
                  className="hidden"
                  disabled={uploading}
                />
              </>
            )}
          </div>

          {/* Type and Time */}
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="block text-white/70 text-sm font-medium mb-1">
                {t("editor.questionType")}
              </label>
              <select
                value={question.questionType}
                onChange={(e) =>
                  handleTypeChange(
                    e.target.value as QuestionType
                  )
                }
                className="input-field bg-white/10 text-sm"
              >
                <option value="multiple_choice">{t("editor.multipleChoice")}</option>
                <option value="true_false">{t("editor.trueFalse")}</option>
                <option value="multi_select">{t("editor.multiSelect")}</option>
                <option value="text_input">{t("editor.textInput")}</option>
                <option value="ordering">{t("editor.ordering")}</option>
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="block text-white/70 text-sm font-medium mb-1">
                {t("editor.timeLimit")}
              </label>
              <input
                type="number"
                max={120}
                value={question.timeLimitSeconds}
                onChange={(e) =>
                  onChange({
                    ...question,
                    timeLimitSeconds: Number.isNaN(parseInt(e.target.value, 10))
                      ? 0
                      : parseInt(e.target.value, 10),
                  })
                }
                className="input-field bg-white/10 text-sm"
              />
            </div>
          </div>

          {/* Scoring */}
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="block text-white/70 text-sm font-medium mb-1">
                {t("editor.basePoints")}
              </label>
              <input
                type="number"
                min={100}
                max={5000}
                value={question.basePoints}
                onChange={(e) =>
                  onChange({
                    ...question,
                    basePoints: parseInt(e.target.value) || 1000,
                  })
                }
                className="input-field bg-white/10 text-sm"
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="block text-white/70 text-sm font-medium mb-1">
                {t("editor.pointLoss")}
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                value={question.deductionPoints}
                onChange={(e) =>
                  onChange({
                    ...question,
                    deductionPoints: parseInt(e.target.value) || 0,
                  })
                }
                className="input-field bg-white/10 text-sm"
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="block text-white/70 text-sm font-medium mb-1">
                {t("editor.every")}
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={question.deductionInterval}
                onChange={(e) =>
                  onChange({
                    ...question,
                    deductionInterval: parseInt(e.target.value) || 1,
                  })
                }
                className="input-field bg-white/10 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            {t("editor.scoringDesc", {
              base: question.basePoints,
              loss: question.deductionPoints,
              interval: question.deductionInterval,
            })}
          </p>

          {/* Answer Choices */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              {t("editor.answerChoices")}
            </label>
            {question.questionType === "ordering" && (
              <p className="text-xs text-white/60 mb-2">{t("editor.orderingHint")}</p>
            )}
            {question.questionType === "text_input" && (
              <p className="text-xs text-white/60 mb-2">{t("editor.acceptedAnswersHint")}</p>
            )}
            {question.questionType === "multi_select" && (
              <p className="text-xs text-white/60 mb-2">{t("editor.multiSelectHint")}</p>
            )}
            <div className="space-y-2">
              {question.choices.map((choice, ci) => (
                <div
                  key={ci}
                  className={`choice-row flex items-center gap-2 gap-md-3 ${question.questionType === "ordering" ? getStableChoiceColor(choice.choiceText || String(ci)) : getChoiceColor(ci)} rounded-lg p-2 p-md-3 flex-wrap flex-md-nowrap`}
                >
                  <span className="text-white text-lg">{question.questionType === "ordering" ? getStableChoiceShape(choice.choiceText || String(ci)) : getChoiceShape(ci)}</span>
                  <input
                    type="text"
                    value={choice.choiceText}
                    onChange={(e) =>
                      updateChoice(ci, "choiceText", e.target.value)
                    }
                    className="flex-1 bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                    placeholder={
                      question.questionType === "text_input"
                        ? `${t("editor.acceptedAnswer")} ${ci + 1}`
                        : `${t("editor.answer")} ${ci + 1}`
                    }
                    disabled={question.questionType === "true_false" || uploading}
                  />
                  {(question.questionType === "multiple_choice" ||
                    question.questionType === "true_false") && (
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="correct"
                        checked={choice.isCorrect}
                        onChange={() => updateChoice(ci, "isCorrect", true)}
                        className="w-4 h-4 accent-white"
                      />
                      <span className="text-white text-xs">{t("editor.correct")}</span>
                    </label>
                  )}
                  {question.questionType === "multi_select" && (
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={choice.isCorrect}
                        onChange={(e) => updateChoice(ci, "isCorrect", e.target.checked)}
                        className="w-4 h-4 accent-white"
                      />
                      <span className="text-white text-xs">{t("editor.correct")}</span>
                    </label>
                  )}
                  {question.questionType === "ordering" && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveChoice(ci, -1)}
                        className="px-2 py-1 text-xs rounded bg-black/25 text-white"
                        disabled={ci === 0}
                      >
                        {t("editor.moveUp")}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChoice(ci, 1)}
                        className="px-2 py-1 text-xs rounded bg-black/25 text-white"
                        disabled={ci === question.choices.length - 1}
                      >
                        {t("editor.moveDown")}
                      </button>
                    </div>
                  )}
                  {question.questionType !== "true_false" && question.choices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(ci)}
                      className="text-xs px-2 py-1 rounded bg-black/30 text-white/80 hover:text-white"
                    >
                      {t("editor.remove")}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {question.questionType !== "true_false" && question.choices.length < 8 && (
              <button
                type="button"
                onClick={addChoice}
                className="mt-2 text-xs px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/15"
              >
                {t("editor.addChoice")}
              </button>
            )}
          </div>
        </div>

        <div className="sticky-modal-footer px-4 px-md-6 py-4 border-t border-white/10 rounded-b-2xl d-flex flex-column flex-md-row gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 transition-colors font-medium w-100"
          >
            {t("editor.cancel")}
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSave}
            disabled={
              !question.questionText.trim() ||
              hasEmptyChoice ||
              !hasValidCorrect
            }
            className="flex-1 bg-inf-red hover:bg-purple-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors w-100"
          >
            {t("editor.saveQuestion")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}



