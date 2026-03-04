import test from "node:test";
import assert from "node:assert/strict";
import { calculateScore } from "@/lib/scoring";

test("calculateScore returns zero for wrong answers", () => {
  const score = calculateScore(
    {
      basePoints: 1000,
      timeLimitSeconds: 20,
      deductionPoints: 50,
      deductionInterval: 1,
    },
    1200,
    false
  );

  assert.equal(score, 0);
});

test("calculateScore applies deduction by interval", () => {
  const score = calculateScore(
    {
      basePoints: 1000,
      timeLimitSeconds: 20,
      deductionPoints: 100,
      deductionInterval: 2,
    },
    5100,
    true
  );

  // 5.1s => floor(5.1/2)=2 intervals => 1000 - 200
  assert.equal(score, 800);
});

test("calculateScore respects minimum correct score", () => {
  const score = calculateScore(
    {
      basePoints: 400,
      timeLimitSeconds: 20,
      deductionPoints: 200,
      deductionInterval: 1,
    },
    19900,
    true
  );

  assert.equal(score, 100);
});
