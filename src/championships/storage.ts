import {
  createChampionship,
  createChampionshipReign,
  createRanking,
  emptyChampionshipProgram,
} from "./model";
import type {
  Championship,
  ChampionshipCompetitor,
  ChampionshipReign,
  ChampionshipUniverse,
  ContenderRanking,
} from "./types";

export const CHAMPIONSHIP_STORAGE_KEY = "tew-story-tracker:championships:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCompetitor(value: unknown): ChampionshipCompetitor | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  return { id: text(value.id, `competitor-${value.name}`), name: value.name };
}

function normalizeCompetitors(value: unknown): ChampionshipCompetitor[] {
  return Array.isArray(value)
    ? value.map(normalizeCompetitor).filter((item): item is ChampionshipCompetitor => item !== null)
    : [];
}

function normalizeReign(value: unknown, index: number): ChampionshipReign | null {
  if (!isRecord(value)) return null;
  const defaults = createChampionshipReign([], []);
  const statuses = ["Active", "Ended", "Vacated"];
  return {
    ...defaults,
    id: text(value.id, defaults.id),
    champions: normalizeCompetitors(value.champions),
    previousChampions: normalizeCompetitors(value.previousChampions),
    startDate: text(value.startDate),
    endDate: text(value.endDate),
    startShowId: text(value.startShowId),
    startSegmentId: text(value.startSegmentId),
    endShowId: text(value.endShowId),
    endSegmentId: text(value.endSegmentId),
    successfulDefenses: Math.max(0, number(value.successfulDefenses, 0)),
    status: statuses.includes(text(value.status)) ? value.status as ChampionshipReign["status"] : index === 0 ? "Active" : "Ended",
    vacancyReason: text(value.vacancyReason),
    notes: text(value.notes),
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeRanking(value: unknown, index: number): ContenderRanking | null {
  if (!isRecord(value)) return null;
  const defaults = createRanking(index + 1);
  const eligibilities = ["Eligible", "Ineligible", "Unavailable"];
  return {
    ...defaults,
    id: text(value.id, defaults.id),
    rank: Math.max(1, number(value.rank, index + 1)),
    competitors: normalizeCompetitors(value.competitors),
    eligibility: eligibilities.includes(text(value.eligibility)) ? value.eligibility as ContenderRanking["eligibility"] : defaults.eligibility,
    record: text(value.record),
    recentForm: text(value.recentForm),
    lastChampionshipOpportunity: text(value.lastChampionshipOpportunity),
    reason: text(value.reason),
    movement: number(value.movement, 0),
    locked: bool(value.locked),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeChampionship(value: unknown, index: number): Championship | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const defaults = createChampionship(index + 1);
  const divisions = ["Singles", "Tag Team", "Trios", "Other"];
  const classifications = ["Primary", "Secondary", "Specialty", "Tournament", "Custom"];
  const statuses = ["Active", "Inactive", "Vacant"];
  const program = isRecord(value.currentProgram) ? value.currentProgram : {};
  return {
    ...defaults,
    id: value.id,
    name: value.name,
    company: text(value.company),
    brand: text(value.brand),
    division: divisions.includes(text(value.division)) ? value.division as Championship["division"] : defaults.division,
    classification: classifications.includes(text(value.classification)) ? value.classification as Championship["classification"] : defaults.classification,
    status: statuses.includes(text(value.status)) ? value.status as Championship["status"] : defaults.status,
    linkedTewTitleId: text(value.linkedTewTitleId),
    linkedTewTitleName: text(value.linkedTewTitleName),
    currentChampions: normalizeCompetitors(value.currentChampions),
    previousChampions: normalizeCompetitors(value.previousChampions),
    dateWon: text(value.dateWon),
    defenses: Math.max(0, number(value.defenses, 0)),
    linkedStorylineId: text(value.linkedStorylineId),
    currentProgram: {
      ...emptyChampionshipProgram(),
      championNames: Array.isArray(program.championNames) ? program.championNames.filter((item): item is string => typeof item === "string") : [],
      leadingChallengerNames: Array.isArray(program.leadingChallengerNames) ? program.leadingChallengerNames.filter((item): item is string => typeof item === "string") : [],
      additionalContenderNames: Array.isArray(program.additionalContenderNames) ? program.additionalContenderNames.filter((item): item is string => typeof item === "string") : [],
      linkedStorylineId: text(program.linkedStorylineId),
      linkedRelationshipIds: Array.isArray(program.linkedRelationshipIds) ? program.linkedRelationshipIds.filter((item): item is string => typeof item === "string") : [],
      linkedBookingIdeaIds: Array.isArray(program.linkedBookingIdeaIds) ? program.linkedBookingIdeaIds.filter((item): item is string => typeof item === "string") : [],
      targetPayoffShowId: text(program.targetPayoffShowId),
      summary: text(program.summary),
    },
    privateNotes: text(value.privateNotes),
    inactivityWarningDays: Math.max(1, number(value.inactivityWarningDays, defaults.inactivityWarningDays)),
    reigns: Array.isArray(value.reigns) ? value.reigns.map(normalizeReign).filter((item): item is ChampionshipReign => item !== null) : [],
    rankings: Array.isArray(value.rankings) ? value.rankings.map(normalizeRanking).filter((item): item is ContenderRanking => item !== null).sort((a, b) => a.rank - b.rank) : [],
    legacyNames: Array.isArray(value.legacyNames) ? value.legacyNames.filter((item): item is string => typeof item === "string") : [],
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

export function emptyChampionshipUniverse(): ChampionshipUniverse {
  return { championships: [] };
}

export function parseChampionshipUniverse(value: unknown): ChampionshipUniverse {
  if (!isRecord(value)) throw new Error("The championship data is not in a supported format.");
  const championships = Array.isArray(value.championships)
    ? value.championships.map(normalizeChampionship).filter((item): item is Championship => item !== null)
    : [];
  return { championships };
}

export function loadChampionshipUniverse(storage: Pick<Storage, "getItem">): ChampionshipUniverse {
  const stored = storage.getItem(CHAMPIONSHIP_STORAGE_KEY);
  if (!stored) return emptyChampionshipUniverse();
  try {
    return parseChampionshipUniverse(JSON.parse(stored) as unknown);
  } catch {
    return emptyChampionshipUniverse();
  }
}

export function saveChampionshipUniverse(
  storage: Pick<Storage, "setItem">,
  universe: ChampionshipUniverse,
): void {
  storage.setItem(CHAMPIONSHIP_STORAGE_KEY, JSON.stringify(universe));
}
