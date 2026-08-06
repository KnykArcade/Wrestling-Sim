import { MATCH_AIMS, MATCH_APPROACHES, MENTAL_STATES } from "./catalog";
import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "./profileCatalog";
import {
  createEmptyMatchApproachSetup,
  createMatchEngineProfile,
  normalizeProfileRatings,
} from "./model";
import type {
  MatchApproachId,
  MatchApproachSetup,
  MatchEngineProfile,
  MatchEngineUniverse,
  MatchOutcomeAuthority,
  MatchPerformancePreview,
  MatchPerformanceSettings,
  MatchWorkerApproachPlan,
  MatchWorkerPerformanceResult,
  PaceStatus,
  StaminaStatus,
  WrestlerSkill,
} from "./types";

export const MATCH_ENGINE_STORAGE_KEY = "tew-story-tracker:match-engine:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function validApproachIds(value: unknown): MatchApproachId[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set(MATCH_APPROACHES.map((approach) => approach.id));
  const migrations: Record<string, MatchApproachId> = {
    "aerial-specialist": "aerial-showstopper",
    "ring-general-pace-controller": "pace-controller",
  };
  return Array.from(new Set(value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const migrated = migrations[item] ?? item;
    return valid.has(migrated as MatchApproachId) ? [migrated as MatchApproachId] : [];
  })));
}

function normalizeProfile(value: unknown): MatchEngineProfile | null {
  if (!isRecord(value) || typeof value.workerName !== "string" || !value.workerName.trim()) return null;
  const source = value.workerSource === "tew" ? "tew" : "manual";
  const fallback = createMatchEngineProfile({ id: text(value.workerId), name: value.workerName, source });
  const styleId = WRESTLER_STYLES.some((style) => style.id === value.styleId) ? value.styleId as MatchEngineProfile["styleId"] : fallback.styleId;
  const rawSkills = isRecord(value.skills) ? value.skills : {};
  const skills = Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, finiteNumber(rawSkills[skill], fallback.skills[skill])])) as Record<WrestlerSkill, number>;
  return normalizeProfileRatings({
    ...fallback,
    id: text(value.id, fallback.id),
    workerKey: text(value.workerKey, fallback.workerKey),
    workerId: text(value.workerId, fallback.workerId),
    workerName: value.workerName,
    workerSource: source,
    styleId,
    overall: finiteNumber(value.overall, fallback.overall),
    health: finiteNumber(value.health, fallback.health),
    popularity: finiteNumber(value.popularity, fallback.popularity),
    momentum: finiteNumber(value.momentum, fallback.momentum),
    experience: finiteNumber(value.experience, fallback.experience),
    fanReaction: finiteNumber(value.fanReaction, fallback.fanReaction),
    gimmick: finiteNumber(value.gimmick, fallback.gimmick),
    skills,
    notes: text(value.notes),
    createdAt: text(value.createdAt, fallback.createdAt),
    updatedAt: text(value.updatedAt, fallback.updatedAt),
  });
}

function normalizeWorkerPlan(value: unknown): MatchWorkerApproachPlan | null {
  if (!isRecord(value) || typeof value.workerKey !== "string" || !value.workerKey) return null;
  const selectedApproachIds = validApproachIds(value.selectedApproachIds);
  const lockedApproachIds = validApproachIds(value.lockedApproachIds).filter((id) => selectedApproachIds.includes(id));
  return {
    workerKey: value.workerKey,
    workerName: text(value.workerName),
    selectedApproachIds,
    lockedApproachIds,
    mode: value.mode === "Manual" ? "Manual" : "AI",
    generatedAt: text(value.generatedAt),
  };
}

function normalizePerformanceSettings(value: unknown): MatchPerformanceSettings {
  const fallback = createEmptyMatchApproachSetup().performanceSettings;
  if (!isRecord(value)) return fallback;
  const authorities: MatchOutcomeAuthority[] = ["tew-authoritative", "booker-selected", "competitive-preview"];
  const authority = authorities.includes(value.authority as MatchOutcomeAuthority)
    ? value.authority as MatchOutcomeAuthority
    : fallback.authority;
  return {
    authority,
    volatility: clamp(finiteNumber(value.volatility, fallback.volatility), 1, 10),
    bookingInfluence: clamp(finiteNumber(value.bookingInfluence, fallback.bookingInfluence), 0, 10),
  };
}

function normalizeWorkerPerformance(value: unknown): MatchWorkerPerformanceResult | null {
  if (!isRecord(value) || typeof value.workerKey !== "string" || typeof value.workerName !== "string") return null;
  const mentalState = MENTAL_STATES.find((state) => state.id === value.mentalStateId) ?? MENTAL_STATES[2];
  const staminaStatuses: StaminaStatus[] = ["PASS", "WINDED", "GASSED", "DEAD"];
  const paceStatuses: PaceStatus[] = ["IDEAL PACE", "OPEN PACE", "OFF PACE", "NOTICEABLY OFF", "POOR PACING", "BAD PACING", "FAILED"];
  return {
    workerKey: value.workerKey,
    workerName: value.workerName,
    mentalStateId: mentalState.id,
    mentalStateName: mentalState.name,
    mentalStateScore: finiteNumber(value.mentalStateScore, 0),
    mentalModifier: finiteNumber(value.mentalModifier, mentalState.modifier),
    luck: finiteNumber(value.luck, 0),
    swing: finiteNumber(value.swing, 0),
    consistencyVariance: finiteNumber(value.consistencyVariance, 0),
    averageApproachRating: finiteNumber(value.averageApproachRating, 0),
    approachExecution: finiteNumber(value.approachExecution, 0),
    presentationScore: finiteNumber(value.presentationScore, 0),
    staminaStatus: staminaStatuses.includes(value.staminaStatus as StaminaStatus) ? value.staminaStatus as StaminaStatus : "PASS",
    staminaModifier: finiteNumber(value.staminaModifier, 0),
    paceStatus: paceStatuses.includes(value.paceStatus as PaceStatus) ? value.paceStatus as PaceStatus : "OPEN PACE",
    paceModifier: finiteNumber(value.paceModifier, 0),
    performanceScore: finiteNumber(value.performanceScore, 0),
    competitiveScore: finiteNumber(value.competitiveScore, 0),
    winProbability: clamp(finiteNumber(value.winProbability, 0), 0, 1),
  };
}

function normalizePerformancePreview(value: unknown): MatchPerformancePreview | null {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.workerResults)) return null;
  const settings = normalizePerformanceSettings({ authority: value.authority, volatility: 5, bookingInfluence: 0 });
  const workerResults = value.workerResults
    .map(normalizeWorkerPerformance)
    .filter((result): result is MatchWorkerPerformanceResult => result !== null);
  if (workerResults.length === 0) return null;
  return {
    id: value.id,
    generatedAt: text(value.generatedAt),
    seed: text(value.seed),
    authority: settings.authority,
    calculationVersion: text(value.calculationVersion, "legacy-unversioned"),
    matchScore: clamp(finiteNumber(value.matchScore, 0), 0, 100),
    starRating: clamp(finiteNumber(value.starRating, 0), 0, 5),
    performanceLeaderKey: text(value.performanceLeaderKey),
    performanceLeaderName: text(value.performanceLeaderName),
    projectedWinnerKey: text(value.projectedWinnerKey),
    projectedWinnerName: text(value.projectedWinnerName),
    confidence: clamp(finiteNumber(value.confidence, 0), 0, 100),
    summary: text(value.summary),
    workerResults,
  };
}

export function normalizeMatchApproachSetup(value: unknown): MatchApproachSetup {
  const fallback = createEmptyMatchApproachSetup();
  if (!isRecord(value)) return fallback;
  const matchAimId = MATCH_AIMS.some((aim) => aim.id === value.matchAimId)
    ? value.matchAimId as MatchApproachSetup["matchAimId"]
    : fallback.matchAimId;
  const workerPlans = Array.isArray(value.workerPlans)
    ? value.workerPlans.map(normalizeWorkerPlan).filter((plan): plan is MatchWorkerApproachPlan => plan !== null)
    : [];
  return {
    matchAimId,
    approachLimit: value.approachLimit === null || value.approachLimit === undefined ? null : clamp(Math.round(finiteNumber(value.approachLimit, 1)), 1, 8),
    workerPlans,
    notes: text(value.notes),
    performanceSettings: normalizePerformanceSettings(value.performanceSettings),
    performancePreview: normalizePerformancePreview(value.performancePreview),
    updatedAt: text(value.updatedAt),
  };
}

export function emptyMatchEngineUniverse(): MatchEngineUniverse {
  return { profiles: [] };
}

export function parseMatchEngineUniverse(value: unknown): MatchEngineUniverse {
  if (!isRecord(value)) return emptyMatchEngineUniverse();
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeProfile).filter((profile): profile is MatchEngineProfile => profile !== null)
    : [];
  const seen = new Set<string>();
  return {
    profiles: profiles.filter((profile) => {
      if (seen.has(profile.workerKey)) return false;
      seen.add(profile.workerKey);
      return true;
    }),
  };
}

export function loadMatchEngineUniverse(storage: Pick<Storage, "getItem">): MatchEngineUniverse {
  const stored = storage.getItem(MATCH_ENGINE_STORAGE_KEY);
  if (!stored) return emptyMatchEngineUniverse();
  try {
    return parseMatchEngineUniverse(JSON.parse(stored) as unknown);
  } catch {
    return emptyMatchEngineUniverse();
  }
}

export function saveMatchEngineUniverse(storage: Pick<Storage, "setItem">, universe: MatchEngineUniverse): void {
  storage.setItem(MATCH_ENGINE_STORAGE_KEY, JSON.stringify(universe));
}
