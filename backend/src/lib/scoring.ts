export interface ScoringConfig {
  basePoints: number;
  timeLimitSeconds: number;
  deductionPoints: number;
  deductionInterval: number;
}

export function calculateScore(
  config: ScoringConfig,
  responseTimeMs: number,
  isCorrect: boolean
): number {
  if (!isCorrect) return 0;

  const { basePoints, deductionPoints, deductionInterval } = config;
  const clampedTimeMs = Math.max(
    0,
    Math.min(responseTimeMs, config.timeLimitSeconds * 1000)
  );
  const elapsedSeconds = clampedTimeMs / 1000;
  const intervalsElapsed = Math.floor(elapsedSeconds / deductionInterval);
  const totalDeduction = intervalsElapsed * deductionPoints;
  const MINIMUM_CORRECT_SCORE = 100;

  return Math.max(MINIMUM_CORRECT_SCORE, basePoints - totalDeduction);
}


