import { APPROACH_ALIASES, MATCH_AIMS, MATCH_APPROACHES, MENTAL_STATES } from "./catalog";
import { AIM_APPROACH_HINTS, MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "./profileCatalog";
import { CALCULATION_FORMULAS, calculateSuitability } from "../calculations/foundation";
import type {
  ApproachFormulaSource,
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

export const MAX_MATCH_APPROACHES = 4;

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
  ratings: Partial<Record<ApproachFormulaSource, number>>,
): number {
  const result = approach.formula.reduce((total, item) => total + (ratings[item.skill] ?? 0) * item.weight, 0);
  return Math.round(result * 100) / 100;
}

export function profileApproachRatingInputs(profile: MatchEngineProfile): Partial<Record<ApproachFormulaSource, number>> {
  return {
    ...profile.skills,
    Experience: profile.experience,
    "Crowd Work": (
      profile.skills.Charisma +
      profile.popularity +
      profile.fanReaction * 20 +
      profile.gimmick * 20
    ) / 4,
  };
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

export function approachLimitForSetup(minutes: number, configuredLimit?: number | null): number {
  if (typeof configuredLimit !== "number" || !Number.isFinite(configuredLimit)) return approachSlotsForDuration(minutes);
  return Math.max(1, Math.min(MAX_MATCH_APPROACHES, Math.round(configuredLimit)));
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
  if (score >= 82) return MENTAL_STATES[0];
  if (score >= 68) return MENTAL_STATES[1];
  if (score >= 52) return MENTAL_STATES[2];
  if (score >= 40) return MENTAL_STATES[3];
  return MENTAL_STATES[4];
}

export function calculateMentalStateBase(inputs: Omit<MentalStateInputs, "luck" | "swing">): number {
  const formula = CALCULATION_FORMULAS.mentalBase;
  const raw = formula.baseline
    + (inputs.health - formula.healthReference) * formula.healthWeight
    + (inputs.consistency - formula.consistencyReference) * formula.consistencyWeight
    + (inputs.experience - formula.experienceReference) * formula.experienceWeight
    + (inputs.overall - formula.overallReference) * formula.overallWeight;
  return Math.max(formula.capMinimum, Math.min(formula.capMaximum, raw));
}

export function calculateMentalStateScore(inputs: MentalStateInputs): number {
  return calculateMentalStateBase(inputs) + inputs.luck + inputs.swing;
}

export function mentalSwingProbability(consistency: number): number {
  const formula = CALCULATION_FORMULAS.executionRandomness;
  return formula.swingBaseProbability + (100 - Math.max(0, Math.min(100, consistency))) / formula.swingConsistencyDivisor;
}

export function totalApproachPace(approachIds: MatchApproachId[]): number {
  return approachIds.reduce((sum, id) => sum + (getApproach(id)?.pace ?? 0), 0);
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
    momentum: 50,
    momentumScale: "0-100-v1",
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
    approachLimit: null,
    workerPlans: [],
    notes: "",
    performanceSettings: {
      authority: "tew-authoritative",
      volatility: 5,
      bookingInfluence: 0,
      importance: "Auto",
      chemistry: 0,
    },
    performancePreview: null,
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
  options: { ratingOverride?: number; opponentCompatibility?: number } = {},
): ApproachCandidateScore {
  const aim = aimForId(aimId);
  const style = getWrestlerStyle(profile);
  const rating = typeof options.ratingOverride === "number"
    ? Math.max(0, Math.min(100, options.ratingOverride))
    : calculateApproachRating(approach, profileApproachRatingInputs(profile));
  const styleBonus = style.approachBoosts.includes(approach.id) ? 8 : 0;
  const hintedForAim = AIM_APPROACH_HINTS[aim.id].includes(approach.id);
  const styleMatchesAim = style.aimBoosts.includes(aim.id) || style.aimStyleNames.some((name) => aim.bestFitStyles.includes(name));
  const styleClashes = style.aimStyleNames.some((name) => aim.clashStyles.includes(name));
  const aimCompatibility = (hintedForAim ? 6 : 0) + (styleMatchesAim ? 3 : 0) - (styleClashes ? 6 : 0);
  const paceBonus = paceSelectionBonus(aim.idealPace, approach.pace);
  const staminaEfficiency = (4 - approach.staminaCost) * 1.5;
  const opponentCompatibility = options.opponentCompatibility ?? 0;
  const total = calculateSuitability(rating, {
    style: styleBonus,
    aim: aimCompatibility,
    pace: paceBonus,
    stamina: staminaEfficiency,
    opponent: opponentCompatibility,
  });
  const reasons = [
    `${rating.toFixed(1)} weighted approach rating`,
    styleBonus ? `${style.name} style boost` : "No wrestler-style boost",
    hintedForAim ? `${aim.name} compatibility hint` : "No direct match-aim hint",
    `Pace ${approach.pace} against ideal ${aim.idealPace}`,
    `Costs ${approach.staminaCost} stamina`,
    opponentCompatibility ? `${opponentCompatibility.toFixed(1)} opponent-fit adjustment` : "No opponent-specific adjustment",
  ];
  return { approachId: approach.id, rating, styleBonus, aimCompatibility, paceBonus, staminaEfficiency, opponentCompatibility, total, reasons };
}

export function calculateApproachPlanScore(input: {
  recommendationTotal: number;
  paceModifier: number;
  staminaModifier: number;
  selectedPaces: number[];
  includesBigMatchPerformer: boolean;
  durationMinutes: number;
  staminaUsed: number;
  staminaAvailable: number;
}): { total: number; diversityBonus: number; longMatchBonus: number; overBudgetPoints: number; overBudgetPenalty: number } {
  const formula = CALCULATION_FORMULAS.approachPlan;
  const diversityBonus = input.selectedPaces.length >= 3 && new Set(input.selectedPaces).size >= 2 ? formula.diversityBonus : 0;
  const longMatchBonus = input.durationMinutes >= 16 && input.includesBigMatchPerformer ? formula.longMatchBonus : 0;
  const overBudgetPoints = Math.max(0, input.staminaUsed - input.staminaAvailable);
  const overBudgetPenalty = overBudgetPoints * formula.staminaOverBudgetPenalty;
  const total = Math.round((
    input.recommendationTotal +
    input.paceModifier * formula.paceModifierWeight +
    input.staminaModifier * formula.staminaModifierWeight +
    diversityBonus +
    longMatchBonus -
    overBudgetPenalty
  ) * 100) / 100;
  return { total, diversityBonus, longMatchBonus, overBudgetPoints, overBudgetPenalty };
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
  configuredLimit?: number | null,
): ApproachPlanResult {
  const aim = aimForId(aimId);
  const limit = approachLimitForSetup(durationMinutes, configuredLimit);
  const selected = Array.from(new Set(approachIds)).filter((id) => MATCH_APPROACHES.some((approach) => approach.id === id)).slice(0, limit);
  const candidateScores = selected.map((id) => scoreApproachCandidate(profile, aim.id, getApproach(id)!));
  const usedStamina = totalApproachStamina(selected);
  const availableStamina = profileStaminaCapacity(profile);
  const stamina = evaluateStamina(usedStamina, availableStamina);
  const actualPace = totalApproachPace(selected);
  const pace = evaluatePace(aim.idealPace, actualPace);
  const planScore = calculateApproachPlanScore({
    recommendationTotal: candidateScores.reduce((sum, candidate) => sum + candidate.total, 0),
    paceModifier: pace.modifier,
    staminaModifier: stamina.modifier,
    selectedPaces: selected.map((id) => getApproach(id)?.pace ?? 0),
    includesBigMatchPerformer: selected.includes("big-match-performer"),
    durationMinutes,
    staminaUsed: usedStamina,
    staminaAvailable: availableStamina,
  });
  return {
    selectedApproachIds: selected,
    candidateScores,
    totalScore: planScore.total,
    usedStamina,
    availableStamina,
    stamina,
    actualPace,
    pace,
    explanation: [
      `${selected.length} of ${approachLimitForSetup(durationMinutes, configuredLimit)} available approach slots filled.`,
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
  configuredLimit?: number | null,
): ApproachPlanResult {
  const slots = approachLimitForSetup(durationMinutes, configuredLimit);
  const locked = Array.from(new Set(lockedApproachIds))
    .filter((id) => MATCH_APPROACHES.some((approach) => approach.id === id))
    .slice(0, slots);
  const remaining = MATCH_APPROACHES.map((approach) => approach.id).filter((id) => !locked.includes(id));
  const candidateSets = combinations(remaining, slots - locked.length).map((set) => [...locked, ...set]);
  let best: ApproachPlanResult | null = null;
  for (const selected of candidateSets) {
    const result = evaluateApproachPlan(profile, aimId, durationMinutes, selected, slots);
    if (
      !best ||
      result.totalScore > best.totalScore ||
      (result.totalScore === best.totalScore && result.usedStamina < best.usedStamina)
    ) best = result;
  }
  return best ?? evaluateApproachPlan(profile, aimId, durationMinutes, locked, slots);
}

export function normalizeProfileRatings(profile: MatchEngineProfile): MatchEngineProfile {
  return {
    ...profile,
    overall: clampRating(profile.overall),
    health: clampRating(profile.health, 100),
    popularity: clampRating(profile.popularity, 50),
    momentum: clampRating(profile.momentum, 50),
    momentumScale: "0-100-v1",
    experience: clampRating(profile.experience, 50),
    fanReaction: Math.max(1, Math.min(5, profile.fanReaction)),
    gimmick: Math.max(1, Math.min(5, profile.gimmick)),
    skills: Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, clampRating(profile.skills[skill])])) as Record<WrestlerSkill, number>,
  };
}
