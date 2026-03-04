import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "@/lib/services/auth-client";

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  status: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useQuizzes() {
  return useQuery({
    queryKey: ["quizzes"],
    queryFn: async () => {
      const res = await authedFetch("/api/quizzes");
      if (!res.ok) throw new Error("Failed to fetch quizzes");
      return res.json() as Promise<Quiz[]>;
    },
  });
}

export function useQuiz(id: string) {
  return useQuery({
    queryKey: ["quiz", id],
    queryFn: async () => {
      const res = await authedFetch(`/api/quizzes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch quiz");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useQuizResults(quizId: string) {
  return useQuery({
    queryKey: ["quiz-results", quizId],
    queryFn: async () => {
      const res = await authedFetch(`/api/quizzes/${quizId}/results`);
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
    enabled: !!quizId,
  });
}

export function useCreateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await authedFetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(body?.error)
          ? body.error.map((e: { message?: string }) => e.message).join(", ")
          : body?.error || "Failed to create quiz";
        throw new Error(typeof msg === "string" ? msg.slice(0, 200) : "Failed to create quiz");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    },
  });
}

export function useDeleteQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authedFetch(`/api/quizzes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete quiz");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    },
  });
}
