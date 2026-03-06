import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayPage from "./play-page";

class MockSocket {
  connected = true;
  id = "socket-1";
  emitted: Array<{ event: string; payload: unknown }> = [];
  private handlers = new Map<string, Array<(payload?: any) => void>>();

  on(event: string, handler: (payload?: any) => void) {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return true;
  }

  disconnect() {
    this.connected = false;
  }

  trigger(event: string, payload?: unknown) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.forEach((handler) => handler(payload));
  }

  getEmits(event: string) {
    return this.emitted.filter((entry) => entry.event === event);
  }

  getAnswerEmits() {
    return this.getEmits("player:answer");
  }
}

let mockSocket: MockSocket;

vi.mock("next/navigation", () => ({
  useParams: () => ({ pin: "123456" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/live/connection-status-overlay", () => ({
  ConnectionStatusOverlay: () => null,
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const MOTION_ONLY_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileHover",
    "whileTap",
    "layout",
  ]);
  const createMotionComponent = (tagName: string) => {
    const MotionComponent = React.forwardRef<any, any>(({ children, ...props }, ref) => {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !MOTION_ONLY_PROPS.has(key))
      );
      return React.createElement(tagName, { ...domProps, ref }, children);
    });
    MotionComponent.displayName = `MockMotion(${tagName})`;
    return MotionComponent;
  };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: new Proxy(
      {},
      {
        get: (_, prop) =>
          createMotionComponent(typeof prop === "string" ? prop : "div"),
      }
    ),
  };
});

function createQuestion(questionType: "multiple_choice" | "multi_select" | "ordering" | "text_input") {
  const base = {
    id: 99,
    questionText: `Question ${questionType}`,
    questionType,
    timeLimitSeconds: 20,
    basePoints: 1000,
    deductionPoints: 50,
    deductionInterval: 1,
    mediaUrl: null,
    backgroundUrl: null,
  };

  if (questionType === "text_input") {
    return {
      ...base,
      choices: [],
    };
  }

  if (questionType === "ordering") {
    return {
      ...base,
      choices: [
        { id: 1, choiceText: "Step A", orderIndex: 0 },
        { id: 2, choiceText: "Step B", orderIndex: 1 },
        { id: 3, choiceText: "Step C", orderIndex: 2 },
      ],
    };
  }

  if (questionType === "multi_select") {
    return {
      ...base,
      choices: [
        { id: 1, choiceText: "Choice A", orderIndex: 0 },
        { id: 2, choiceText: "Choice B", orderIndex: 1 },
        { id: 3, choiceText: "Choice C", orderIndex: 2 },
      ],
    };
  }

  return {
    ...base,
    choices: [
      { id: 1, choiceText: "Choice A", orderIndex: 0 },
      { id: 2, choiceText: "Choice B", orderIndex: 1 },
    ],
  };
}

function renderQuestionScreen(questionType: "multiple_choice" | "multi_select" | "ordering" | "text_input") {
  render(<PlayPage />);

  act(() => {
    mockSocket.trigger("connect");
  });

  act(() => {
    mockSocket.trigger("game:question-start", {
      question: createQuestion(questionType),
      questionNumber: 1,
      totalQuestions: 5,
      serverStartTime: Date.now(),
    });
    vi.advanceTimersByTime(100);
  });
}

describe("PlayPage authoritative answer recovery flow", () => {
  beforeEach(() => {
    mockSocket = new MockSocket();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T00:00:00.000Z"));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(Date.now()), 100) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for authoritative rejoin before re-enabling single-choice answers", () => {
    renderQuestionScreen("multiple_choice");
    const initialRejoinCount = mockSocket.getEmits("player:rejoin").length;

    const choiceA = screen.getByRole("button", { name: /choice a/i });

    fireEvent.click(choiceA);
    expect(mockSocket.getAnswerEmits()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /choice a/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(mockSocket.getEmits("player:rejoin")).toHaveLength(initialRejoinCount + 1);
    expect(screen.getByRole("button", { name: /choice b/i })).toBeDisabled();

    act(() => {
      mockSocket.trigger("player:rejoined-success", {
        playerId: 7,
        sessionId: 33,
        quizTitle: "Quiz",
        avatar: "A",
        totalScore: 0,
        phase: "question",
      });
    });

    const retriableChoiceB = screen.getByRole("button", { name: /choice b/i });
    expect(retriableChoiceB).not.toBeDisabled();
    fireEvent.click(retriableChoiceB);

    const answerEmits = mockSocket.getAnswerEmits();
    expect(answerEmits).toHaveLength(2);
    expect(answerEmits[1]?.payload).toMatchObject({ choiceId: 2 });
  });

  it("preserves multi-select choices until authoritative rejoin unlocks the form", () => {
    renderQuestionScreen("multi_select");
    const initialRejoinCount = mockSocket.getEmits("player:rejoin").length;

    fireEvent.click(screen.getByRole("button", { name: /choice a/i }));
    fireEvent.click(screen.getByRole("button", { name: /choice b/i }));

    const submitButton = screen.getByRole("button", { name: /^submit$/i });
    fireEvent.click(submitButton);

    expect(mockSocket.getAnswerEmits()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(mockSocket.getEmits("player:rejoin")).toHaveLength(initialRejoinCount + 1);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();

    act(() => {
      mockSocket.trigger("player:rejoined-success", {
        playerId: 7,
        sessionId: 33,
        quizTitle: "Quiz",
        avatar: "A",
        totalScore: 0,
        phase: "question",
      });
    });

    const retriableSubmitButton = screen.getByRole("button", { name: /submit/i });
    expect(retriableSubmitButton).not.toBeDisabled();
    fireEvent.click(retriableSubmitButton);

    const answerEmits = mockSocket.getAnswerEmits();
    expect(answerEmits).toHaveLength(2);
    expect(answerEmits[1]?.payload).toMatchObject({ choiceIds: [1, 2] });
  });

  it("preserves ordering payload until rejoin confirms retry is allowed", () => {
    renderQuestionScreen("ordering");
    const initialRejoinCount = mockSocket.getEmits("player:rejoin").length;

    const submitButton = screen.getByRole("button", { name: /^submit$/i });
    fireEvent.click(submitButton);

    const firstAnswer = mockSocket.getAnswerEmits()[0];
    expect(firstAnswer?.payload).toMatchObject({
      orderedChoiceIds: expect.any(Array),
    });

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(mockSocket.getEmits("player:rejoin")).toHaveLength(initialRejoinCount + 1);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();

    act(() => {
      mockSocket.trigger("player:rejoined-success", {
        playerId: 7,
        sessionId: 33,
        quizTitle: "Quiz",
        avatar: "A",
        totalScore: 0,
        phase: "question",
      });
    });

    const retriableSubmitButton = screen.getByRole("button", { name: /submit/i });
    expect(retriableSubmitButton).not.toBeDisabled();
    fireEvent.click(retriableSubmitButton);

    const answerEmits = mockSocket.getAnswerEmits();
    expect(answerEmits).toHaveLength(2);
    expect(answerEmits[1]?.payload).toMatchObject({
      orderedChoiceIds: (firstAnswer?.payload as { orderedChoiceIds: number[] }).orderedChoiceIds,
    });
  });

  it("preserves text input while waiting for authoritative rejoin", () => {
    renderQuestionScreen("text_input");
    const initialRejoinCount = mockSocket.getEmits("player:rejoin").length;

    const input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: "Istanbul" } });

    const submitButton = screen.getByRole("button", { name: /^submit$/i });
    fireEvent.click(submitButton);
    expect(mockSocket.getAnswerEmits()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(mockSocket.getEmits("player:rejoin")).toHaveLength(initialRejoinCount + 1);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
    expect(input).toHaveValue("Istanbul");

    act(() => {
      mockSocket.trigger("player:rejoined-success", {
        playerId: 7,
        sessionId: 33,
        quizTitle: "Quiz",
        avatar: "A",
        totalScore: 0,
        phase: "question",
      });
    });

    const retriableSubmitButton = screen.getByRole("button", { name: /submit/i });
    expect(retriableSubmitButton).not.toBeDisabled();
    fireEvent.click(retriableSubmitButton);

    const answerEmits = mockSocket.getAnswerEmits();
    expect(answerEmits).toHaveLength(2);
    expect(answerEmits[1]?.payload).toMatchObject({ textAnswer: "Istanbul" });
  });

  it("keeps the form locked when rejoin confirms the answer was already accepted", () => {
    renderQuestionScreen("multiple_choice");
    const initialRejoinCount = mockSocket.getEmits("player:rejoin").length;

    fireEvent.click(screen.getByRole("button", { name: /choice a/i }));
    expect(mockSocket.getAnswerEmits()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(mockSocket.getEmits("player:rejoin")).toHaveLength(initialRejoinCount + 1);

    act(() => {
      mockSocket.trigger("player:rejoined-success", {
        playerId: 7,
        sessionId: 33,
        quizTitle: "Quiz",
        avatar: "A",
        totalScore: 1000,
        phase: "answered",
      });
    });

    expect(screen.getByText(/answer submitted/i)).toBeInTheDocument();
    expect(mockSocket.getAnswerEmits()).toHaveLength(1);
  });

  it("releases submit state on coded answer validation errors", () => {
    renderQuestionScreen("multiple_choice");

    const choiceA = screen.getByRole("button", { name: /choice a/i });
    fireEvent.click(choiceA);
    expect(mockSocket.getAnswerEmits()).toHaveLength(1);

    act(() => {
      mockSocket.trigger("error", {
        message: "Choice is required",
        code: "answer_validation_failed",
      });
    });

    expect(screen.getByText("Choice is required")).toBeInTheDocument();
    const retriableChoiceB = screen.getByRole("button", { name: /choice b/i });
    expect(retriableChoiceB).not.toBeDisabled();
    fireEvent.click(retriableChoiceB);

    const answerEmits = mockSocket.getAnswerEmits();
    expect(answerEmits).toHaveLength(2);
    expect(answerEmits[1]?.payload).toMatchObject({ choiceId: 2 });
  });
});
