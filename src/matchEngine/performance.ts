import {
  calculateApproachRating,
  calculateMentalStateScore,
  classifyMentalState,
  createMatchEngineId,
  evaluateApproachPlan,
  getApproach,
  mentalSwingProbability,
  normalizeApproachName,
  profileApproachRatingInputs,
} from "./model";
import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import type {
  MatchEngineProfile,
  MatchPerformancePreview,
  MatchPerformanceSettings,
  MatchWorkerApproachPlan,
  MatchWorkerPerformanceResult,
  MatchAimId,
} from "./types";

export interface MatchPerformanceWorkerInput {
  profile: MatchEngineProfile;
  plan: MatchWorkerApproachPlan;
}

export interface GenerateMatchPerformanceInput {
  workers: MatchPerformanceWorkerInput[];
  aimId: MatchAimId;
  durationMinutes: number;
  plannedWinner: string;
  settings: MatchPerformanceSettings;
  seed?: string;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let value = hashSeed(seed) || 1;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function advisoryStarRating(matchScore: number): number {
  const raw = clamp((matchScore - 20) / 15, 0, 5);
  return Math.round(raw * 4) / 4;
}

export function formatStarRating(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}★`;
}

function presentationScore(profile: MatchEngineProfile): number {
  // The source workbook exposes a separate Booking Score but does not preserve its final macro formula.
  // This transparent tracker-only blend is therefore kept separate from approach execution and TEW ratings.
  return clamp(
    profile.overall * 0.35 +
    profile.popularity * 0.25 +
    profile.experience * 0.15 +
    profile.fanReaction * 20 * 0.15 +
    profile.gimmick * 20 * 0.1,
  );
}

function mentalStateForWorker(profile: MatchEngineProfile, random: () => number) {
  const luck = round(random() * 10 - 5, 2);
  const swingOccurs = random() < mentalSwingProbability(profile.overall);
  const swing = swingOccurs ? (random() < 0.5 ? -10 : 10) : 0;
  const score = calculateMentalStateScore({
    health: profile.health,
    popularity: profile.popularity,
    experience: profile.experience,
    fanReaction: profile.fanReaction,
    gimmick: profile.gimmick,
    overall: profile.overall,
    luck,
    swing,
  });
  const state = classifyMentalState(score);
  return { luck, swing, score: round(score), state };
}

function workerResult(
  worker: MatchPerformanceWorkerInput,
  aimId: MatchAimId,
  durationMinutes: number,
  settings: MatchPerformanceSettings,
  plannedWinner: string,
  random: () => number,
): MatchWorkerPerformanceResult {
  const { profile, plan } = worker;
  const planResult = evaluateApproachPlan(profile, aimId, durationMinutes, plan.selectedApproachIds);
  const ratings = plan.selectedApproachIds
    .map((id) => getApproach(id))
    .filter((approach) => approach !== null)
    .map((approach) => calculateApproachRating(approach, profileApproachRatingInputs(profile)));
  const averageApproachRating = ratings.length > 0 ? average(ratings) : profile.overall * 0.6;
  const mental = mentalStateForWorker(profile, random);
  const consistencyRange = ((100 - profile.skills.Consistency) / 100) * settings.volatility * 1.5;
  const consistencyVariance = round((random() * 2 - 1) * consistencyRange);
  const approachExecution = clamp(
    averageApproachRating +
    mental.state.modifier +
    planResult.stamina.modifier +
    planResult.pace.modifier * 0.25 +
    consistencyVariance,
  );
  const presentation = presentationScore(profile);
  const performanceScore = clamp(approachExecution * 0.8 + presentation * 0.2);
  const isPlannedWinner = normalizeApproachName(profile.workerName) === normalizeApproachName(plannedWinner);
  const bookingBonus = settings.authority === "competitive-preview" && isPlannedWinner
    ? settings.bookingInfluence * 0.8
    : 0;
  const competitiveScore = clamp(performanceScore * 0.8 + profile.overall * 0.1 + profile.health * 0.1 + bookingBonus, 0, 110);

  return {
    workerKey: profile.workerKey,
    workerName: profile.workerName,
    mentalStateId: mental.state.id,
    mentalStateName: mental.state.name,
    mentalStateScore: mental.score,
    mentalModifier: mental.state.modifier,
    luck: mental.luck,
    swing: mental.swing,
    consistencyVariance,
    averageApproachRating: round(averageApproachRating),
    approachExecution: round(approachExecution),
    presentationScore: round(presentation),
    staminaStatus: planResult.stamina.status,
    staminaModifier: planResult.stamina.modifier,
    paceStatus: planResult.pace.status,
    paceModifier: planResult.pace.modifier,
    performanceScore: round(performanceScore),
    competitiveScore: round(competitiveScore),
    winProbability: 0,
  };
}

function applyProbabilities(results: MatchWorkerPerformanceResult[], volatility: number): MatchWorkerPerformanceResult[] {
  if (results.length === 0) return [];
  const temperature = 7 + volatility * 1.25;
  const minimum = Math.min(...results.map((result) => result.competitiveScore));
  const weights = results.map((result) => Math.exp((result.competitiveScore - minimum) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return results.map((result, index) => ({
    ...result,
    winProbability: round(weights[index] / total, 4),
  }));
}

export function generateMatchPerformancePreview(input: GenerateMatchPerformanceInput): MatchPerformancePreview | null {
  if (input.workers.length === 0) return null;
  const seed = input.seed || createMatchEngineId();
  const random = seededRandom(seed);
  const rawResults = input.workers.map((worker) => workerResult(
    worker,
    input.aimId,
    input.durationMinutes,
    input.settings,
    input.plannedWinner,
    random,
  ));
  const workerResults = applyProbabilities(rawResults, input.settings.volatility);
  const performanceLeader = [...workerResults].sort((left, right) => right.performanceScore - left.performanceScore)[0];
  const probabilityLeader = [...workerResults].sort((left, right) => right.winProbability - left.winProbability)[0];
  const structureScores = workerResults.map((result) => clamp(
    70 + result.paceModifier * 1.2 + result.staminaModifier * 2,
  ));
  const matchScore = clamp(
    average(workerResults.map((result) => result.performanceScore)) * 0.85 +
    average(structureScores) * 0.15,
  );
  const starRating = advisoryStarRating(matchScore);
  let projectedWinnerKey = "";
  let projectedWinnerName = "";
  let confidence = 0;
  let summary = `TEW remains authoritative. ${performanceLeader.workerName} has the strongest advisory performance profile, but this preview does not select a winner.`;

  if (input.settings.authority === "booker-selected") {
    const fixed = workerResults.find((result) => normalizeApproachName(result.workerName) === normalizeApproachName(input.plannedWinner));
    projectedWinnerKey = fixed?.workerKey ?? "";
    projectedWinnerName = fixed?.workerName ?? input.plannedWinner;
    confidence = projectedWinnerName ? 100 : 0;
    summary = projectedWinnerName
      ? `${projectedWinnerName} remains fixed by the booking. The preview evaluates execution and match quality only.`
      : "Booker-selected mode is active, but no planned winner has been entered. No winner was assigned.";
  } else if (input.settings.authority === "competitive-preview") {
    projectedWinnerKey = probabilityLeader.workerKey;
    projectedWinnerName = probabilityLeader.workerName;
    confidence = round(probabilityLeader.winProbability * 100, 1);
    summary = `The optional competitive preview favors ${projectedWinnerName} at ${confidence}% confidence. This does not change the planned winner or TEW result.`;
  }

  return {
    id: createMatchEngineId(),
    generatedAt: new Date().toISOString(),
    seed,
    authority: input.settings.authority,
    calculationVersion: CALCULATION_SYSTEM_VERSION,
    matchScore: round(matchScore),
    starRating,
    performanceLeaderKey: performanceLeader.workerKey,
    performanceLeaderName: performanceLeader.workerName,
    projectedWinnerKey,
    projectedWinnerName,
    confidence,
    summary,
    workerResults,
  };
}
