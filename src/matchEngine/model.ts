import { APPROACH_ALIASES, MATCH_APPROACHES, MENTAL_STATES } from "./catalog";
import type {
  MatchApproachDefinition,
  MatchApproachId,
  MentalStateDefinition,
  MentalStateInputs,
  PaceEvaluation,
  StaminaEvaluation,
  WrestlerSkill,
} from "./types";

export function normalizeApproachName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveApproachId(value: string): MatchApproachId | null {
  const normalized = normalizeApproachName(value);
  const alias = APPROACH_ALIASES.find((item) => item.normalizedName === normalized);
  if (alias) return alias.canonicalId;
  return MATCH_APPROACHES.find((approach) => approach.sourceNames.some((name) => normalizeApproachName(name) === normalized))?.id ?? null;
}

export function getApproach(value: MatchApproachId | string): MatchApproachDefinition | null {
  const id = MATCH_APPROACHES.some((approach) => approach.id === value)
    ? value as MatchApproachId
    : resolveApproachId(value);
  return id ? MATCH_APPROACHES.find((approach) => approach.id === id) ?? null : null;
}

export function calculateApproachRating(
  approach: MatchApproachDefinition,
  ratings: Partial<Record<WrestlerSkill, number>>,
): number {
  const result = approach.formula.reduce((total, item) => total + (ratings[item.skill] ?? 0) * item.weight, 0);
  return Math.round(result * 100) / 100;
}

export function approachFormulaLabel(approach: MatchApproachDefinition): string {
  return approach.formula.map((item) => `${item.skill} × ${item.weight.toFixed(2)}`).join(" + ");
}

export function approachSlotsForDuration(minutes: number): 1 | 2 | 3 | 4 {
  const duration = Math.max(0, minutes);
  if (duration <= 5) return 1;
  if (duration <= 15) return 2;
  if (duration < 25) return 3;
  return 4;
}

export function evaluatePace(idealPace: number, actualPace: number): PaceEvaluation {
  if (idealPace === 0) return { difference: 0, status: "OPEN PACE", modifier: 0 };
  const difference = Math.abs(idealPace - actualPace);
  if (difference === 0) return { difference, status: "IDEAL PACE", modifier: 2 };
  if (difference === 1) return { difference, status: "OFF PACE", modifier: -5 };
  if (difference === 2) return { difference, status: "NOTICEABLY OFF", modifier: -10 };
  if (difference === 3) return { difference, status: "POOR PACING", modifier: -15 };
  if (difference === 4) return { difference, status: "BAD PACING", modifier: -20 };
  return { difference, status: "FAILED", modifier: -25 };
}

export function evaluateStamina(used: number, available: number): StaminaEvaluation {
  const overBudget = Math.round(used - available);
  if (overBudget <= 0) return { overBudget, status: "PASS", modifier: 2 };
  if (overBudget === 1) return { overBudget, status: "WINDED", modifier: -2 };
  if (overBudget === 2) return { overBudget, status: "GASSED", modifier: -5 };
  return { overBudget, status: "DEAD", modifier: -15 };
}

export function classifyMentalState(score: number): MentalStateDefinition {
  if (score >= 85) return MENTAL_STATES[0];
  if (score >= 70) return MENTAL_STATES[1];
  if (score >= 55) return MENTAL_STATES[2];
  if (score >= 40) return MENTAL_STATES[3];
  return MENTAL_STATES[4];
}

export function calculateMentalStateScore(inputs: MentalStateInputs): number {
  return (
    0.2 * inputs.health +
    0.2 * inputs.popularity +
    0.15 * inputs.experience +
    0.15 * inputs.fanReaction * 20 +
    0.1 * inputs.gimmick * 20 +
    0.2 * inputs.overall +
    inputs.luck +
    inputs.swing
  );
}

export function mentalSwingProbability(overall: number): number {
  return 0.05 + (100 - overall) / 2000;
}

export function averageApproachPace(approachIds: MatchApproachId[]): number {
  if (approachIds.length === 0) return 0;
  const total = approachIds.reduce((sum, id) => sum + (getApproach(id)?.pace ?? 0), 0);
  return Math.round((total / approachIds.length) * 100) / 100;
}

export function totalApproachStamina(approachIds: MatchApproachId[]): number {
  return approachIds.reduce((sum, id) => sum + (getApproach(id)?.staminaCost ?? 0), 0);
}
