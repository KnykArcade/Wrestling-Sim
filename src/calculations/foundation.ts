export const CALCULATION_SYSTEM_VERSION = "wrestling-sim-calculations-6b18-v1";

export type CalculationProvenance = "Imported" | "Manually Entered" | "Estimated Baseline";
export type CalculationQualityLabel = "Elite" | "Strong" | "Capable" | "Developing" | "Weak";

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function roundCalculation(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(finiteNumber(value) * scale) / scale;
}

export function clampCalculation(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, minimum)));
}

export function normalizeRating(value: number, places = 2): number {
  return roundCalculation(clampCalculation(value), places);
}

export interface SuitabilityComponents {
  style: number;
  aim: number;
  pace: number;
  stamina: number;
  opponent?: number;
}

/** Seventy-five percent ability and twenty-five percent match-specific fit. */
export function calculateSuitability(rating: number, components: SuitabilityComponents): number {
  const contextual = components.style + components.aim + components.pace + components.stamina + (components.opponent ?? 0);
  const contextualScore = clampCalculation(((contextual + 10.5) / 45) * 100);
  return normalizeRating(normalizeRating(rating) * 0.75 + contextualScore * 0.25);
}

export function calculateStarRating(matchScore: number): number {
  const raw = clampCalculation((matchScore - 20) / 15, 0, 5);
  return Math.round(raw * 4) / 4;
}

export function calculationQualityLabel(value: number): CalculationQualityLabel {
  const rating = clampCalculation(value);
  if (rating >= 85) return "Elite";
  if (rating >= 75) return "Strong";
  if (rating >= 65) return "Capable";
  if (rating >= 50) return "Developing";
  return "Weak";
}
