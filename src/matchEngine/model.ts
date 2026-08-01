import { APPROACH_ALIASES, MATCH_AIMS, MATCH_APPROACHES, MENTAL_STATES } from "./catalog";
import { AIM_APPROACH_HINTS, MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "./profileCatalog";
import type {
  ApproachCandidateScore,
  ApproachPlanResult,
  MatchApproachDefinition,
  MatchApproachId,
  MatchApproachSetup,
  MatchEngineProfile,
  MatchAimId,
  MentalStateDefinition,
  MentalStateInputs,
  PaceEvaluation,
  StaminaEvaluation,
  WrestlerSkill,
  WrestlerStyleDefinition,
} from "./types";

function fallbackId(): string {
  return `match-engine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMatchEngineId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackId();
}

function clampRating(value: number, fallback = 60): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

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

export function workerProfileKey(worker: { id: string; name: string; source: "tew" | "manual" }): string {
  return worker.source === "tew"
    ? `tew:${worker.id}`
    : `manual:${normalizeApproachName(worker.name)}`;
}

export function createMatchEngineProfile(worker: { id: string; name: string; source: "tew" | "manual" }): MatchEngineProfile {
  const timestamp = new Date().toISOString();
  const skills = Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, 60])) as Record<WrestlerSkill, number>;
  return {
    id: createMatchEngineId(),
    workerKey: workerProfileKey(worker),
    workerId: worker.id,
    workerName: worker.name,
    workerSource: worker.source,
    styleId: "all-rounder",
    overall: 60,
    health: 100,
    popularity: 50,
    experience: 50,
    fanReaction: 3,
    gimmick: 3,
    skills,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function calculateProfileStaminaRating(profile: MatchEngineProfile): number {
  const value = (
    profile.skills.Selling +
    profile.skills.Stamina +
    profile.skills.Resilience +
    profile.experience +
    profile.skills.Athleticism +
    profile.skills.Toughness
  ) / 6;
  return Math.round(value * 100) / 100;
}

export function staminaCapacityFromRating(rating: number): number {
  const value = clampRating(rating, 0);
  if (value >= 75) return 9;
  if (value >= 70) return 7;
  if (value >= 65) return 6;
  if (value >= 60) return 5;
  if (value >= 50) return 4;
  if (value >= 30) return 3;
  if (value >= 20) return 2;
  return 1;
}

export function profileStaminaCapacity(profile: MatchEngineProfile): number {
  return staminaCapacityFromRating(calculateProfileStaminaRating(profile));
}

export function getWrestlerStyle(profile: Pick<MatchEngineProfile, "styleId">): WrestlerStyleDefinition {
  return WRESTLER_STYLES.find((style) => style.id === profile.styleId) ?? WRESTLER_STYLES[0];
}

export function createEmptyMatchApproachSetup(): MatchApproachSetup {
  return {
    matchAimId: "call-it-in-the-ring",
    workerPlans: [],
    notes: "",
    updatedAt: "",
  };
}

function aimForId(aimId: MatchAimId) {
  return MATCH_AIMS.find((aim) => aim.id === aimId) ?? MATCH_AIMS[0];
}

function paceSelectionBonus(idealPace: number, approachPace: number): number {
  if (idealPace === 0) return 2;
  const difference = Math.abs(idealPace - approachPace * 2);
  if (difference === 0) return 8;
  if (difference === 1) return 5;
  if (difference === 2) return 2;
  if (difference === 3) return -2;
  return -6;
}

export function scoreApproachCandidate(
  profile: MatchEngineProfile,
  aimId: MatchAimId,
  approach: MatchApproachDefinition,
): ApproachCandidateScore {
  const aim = aimForId(aimId);
  const style = getWrestlerStyle(profile);
  const rating = calculateApproachRating(approach, profile.skills);
  const styleBonus = style.approachBoosts.includes(approach.id) ? 8 : 0;
  const hintedForAim = AIM_APPROACH_HINTS[aim.id].includes(approach.id);
  const styleMatchesAim = style.aimBoosts.includes(aim.id) || style.aimStyleNames.some((name) => aim.bestFitStyles.includes(name));
  const styleClashes = style.aimStyleNames.some((name) => aim.clashStyles.includes(name));
  const aimCompatibility = (hintedForAim ? 6 : 0) + (styleMatchesAim ? 3 : 0) - (styleClashes ? 6 : 0);
  const paceBonus = paceSelectionBonus(aim.idealPace, approach.pace);
  const staminaEfficiency = (4 - approach.staminaCost) * 1.5;
  const total = Math.round((rating + styleBonus + aimCompatibility + paceBonus + staminaEfficiency) * 100) / 100;
  const reasons = [
    `${rating.toFixed(1)} weighted approach rating`,
    styleBonus ? `${style.name} style boost` : "No wrestler-style boost",
    hintedForAim ? `${aim.name} compatibility hint` : "No direct match-aim hint",
    `Pace ${approach.pace} against ideal ${aim.idealPace}`,
    `Costs ${approach.staminaCost} stamina`,
  ];
  return { approachId: approach.id, rating, styleBonus, aimCompatibility, paceBonus, staminaEfficiency, total, reasons };
}

function combinations<T>(items: T[], choose: number): T[][] {
  if (choose === 0) return [[]];
  if (choose < 0 || choose > items.length) return [];
  const result: T[][] = [];
  for (let index = 0; index <= items.length - choose; index += 1) {
    const head = items[index];
    for (const tail of combinations(items.slice(index + 1), choose - 1)) result.push([head, ...tail]);
  }
  return result;
}

export function evaluateApproachPlan(
  profile: MatchEngineProfile,
  aimId: MatchAimId,
  durationMinutes: number,
  approachIds: MatchApproachId[],
): ApproachPlanResult {
  const aim = aimForId(aimId);
  const selected = Array.from(new Set(approachIds)).filter((id) => MATCH_APPROACHES.some((approach) => approach.id === id));
  const candidateScores = selected.map((id) => scoreApproachCandidate(profile, aim.id, getApproach(id)!));
  const usedStamina = totalApproachStamina(selected);
  const availableStamina = profileStaminaCapacity(profile);
  const stamina = evaluateStamina(usedStamina, availableStamina);
  const actualPace = selected.length === 0 ? 0 : Math.round(averageApproachPace(selected) * 2);
  const pace = evaluatePace(aim.idealPace, actualPace);
  const distinctPaces = new Set(selected.map((id) => getApproach(id)?.pace ?? 0)).size;
  const diversityBonus = selected.length >= 3 && distinctPaces >= 2 ? 3 : 0;
  const longMatchBonus = durationMinutes >= 16 && selected.includes("big-match-performer") ? 4 : 0;
  const overBudgetPenalty = Math.max(0, usedStamina - availableStamina) * 25;
  const totalScore = Math.round((
    candidateScores.reduce((sum, candidate) => sum + candidate.total, 0) +
    pace.modifier * 1.5 +
    stamina.modifier * 3 +
    diversityBonus +
    longMatchBonus -
    overBudgetPenalty
  ) * 100) / 100;
  return {
    selectedApproachIds: selected,
    candidateScores,
    totalScore,
    usedStamina,
    availableStamina,
    stamina,
    actualPace,
    pace,
    explanation: [
      `${selected.length} of ${approachSlotsForDuration(durationMinutes)} available approach slots filled.`,
      `${usedStamina}/${availableStamina} stamina used: ${stamina.status}.`,
      aim.idealPace === 0 ? "The selected match aim allows open pacing." : `Estimated pace ${actualPace} against ideal ${aim.idealPace}: ${pace.status}.`,
      "The score uses visible approach ratings, wrestler-style boosts, match-aim hints, pace, and stamina pressure.",
    ],
  };
}

export function chooseApproachPlan(
  profile: MatchEngineProfile,
  aimId: MatchAimId,
  durationMinutes: number,
  lockedApproachIds: MatchApproachId[] = [],
): ApproachPlanResult {
  const slots = approachSlotsForDuration(durationMinutes);
  const locked = Array.from(new Set(lockedApproachIds))
    .filter((id) => MATCH_APPROACHES.some((approach) => approach.id === id))
    .slice(0, slots);
  const remaining = MATCH_APPROACHES.map((approach) => approach.id).filter((id) => !locked.includes(id));
  const candidateSets = combinations(remaining, slots - locked.length).map((set) => [...locked, ...set]);
  let best: ApproachPlanResult | null = null;
  for (const selected of candidateSets) {
    const result = evaluateApproachPlan(profile, aimId, durationMinutes, selected);
    if (
      !best ||
      result.totalScore > best.totalScore ||
      (result.totalScore === best.totalScore && result.usedStamina < best.usedStamina)
    ) best = result;
  }
  return best ?? evaluateApproachPlan(profile, aimId, durationMinutes, locked);
}

export function normalizeProfileRatings(profile: MatchEngineProfile): MatchEngineProfile {
  return {
    ...profile,
    overall: clampRating(profile.overall),
    health: clampRating(profile.health, 100),
    popularity: clampRating(profile.popularity, 50),
    experience: clampRating(profile.experience, 50),
    fanReaction: Math.max(1, Math.min(5, profile.fanReaction)),
    gimmick: Math.max(1, Math.min(5, profile.gimmick)),
    skills: Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, clampRating(profile.skills[skill])])) as Record<WrestlerSkill, number>,
  };
}
