import { describe, it, expect } from "vitest";
import { buildApiUrl, getSocketBaseUrl, getBackendBaseUrl } from "./api-client";

describe("buildApiUrl", () => {
  it("returns path as-is when no backend URL is configured", () => {
    expect(buildApiUrl("/api/quizzes")).toBe("/api/quizzes");
  });

  it("returns absolute URLs unchanged", () => {
    expect(buildApiUrl("https://example.com/api")).toBe(
      "https://example.com/api"
    );
  });

  it("throws for paths not starting with /", () => {
    expect(() => buildApiUrl("api/quizzes")).toThrow("must start with '/'");
  });
});

describe("getBackendBaseUrl", () => {
  it("returns a string", () => {
    expect(typeof getBackendBaseUrl()).toBe("string");
  });
});

describe("getSocketBaseUrl", () => {
  it("returns undefined when no backend URL is configured", () => {
    expect(getSocketBaseUrl()).toBeUndefined();
  });
});
