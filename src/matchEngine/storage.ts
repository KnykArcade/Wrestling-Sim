import { MATCH_AIMS, MATCH_APPROACHES } from "./catalog";
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
  MatchWorkerApproachPlan,
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

function validApproachIds(value: unknown): MatchApproachId[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set(MATCH_APPROACHES.map((approach) => approach.id));
  return Array.from(new Set(value.filter((item): item is MatchApproachId => typeof item === "string" && valid.has(item as MatchApproachId))));
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
    workerPlans,
    notes: text(value.notes),
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
