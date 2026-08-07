import { createWorkerArc, createWorkerProfile, createWorkerRelationship } from "./model";
import type { WorkerArc, WorkerProfile, WorkerRelationship, WorkerUniverse } from "./types";

export const WORKER_STORAGE_KEY = "tew-story-tracker:workers:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeArc(value: unknown, index: number): WorkerArc | null {
  if (!isRecord(value)) return null;
  const defaults = createWorkerArc(index + 1);
  const statuses = ["Idea", "Planned", "Active", "Paused", "Completed", "Abandoned"];
  return {
    ...defaults,
    id: text(value.id, defaults.id),
    name: text(value.name, defaults.name),
    status: statuses.includes(text(value.status)) ? value.status as WorkerArc["status"] : defaults.status,
    startingSituation: text(value.startingSituation),
    motivation: text(value.motivation),
    internalConflict: text(value.internalConflict),
    externalConflict: text(value.externalConflict),
    turningPoint: text(value.turningPoint),
    plannedResolution: text(value.plannedResolution),
    aftermath: text(value.aftermath),
    linkedStorylineId: text(value.linkedStorylineId),
    targetShowId: text(value.targetShowId),
    targetDate: text(value.targetDate),
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeProfile(value: unknown, index: number): WorkerProfile | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.displayName !== "string") return null;
  const defaults = createWorkerProfile(index + 1);
  const sources = ["tew", "manual", "discovered"];
  const alignments = ["Unspecified", "Face", "Heel", "Tweener"];
  return {
    ...defaults,
    id: value.id,
    displayName: value.displayName,
    source: sources.includes(text(value.source)) ? value.source as WorkerProfile["source"] : defaults.source,
    linkedTewWorkerId: text(value.linkedTewWorkerId),
    linkedTewWorkerName: text(value.linkedTewWorkerName),
    companyId: text(value.companyId),
    companyName: text(value.companyName),
    currentRole: text(value.currentRole, defaults.currentRole),
    alignment: alignments.includes(text(value.alignment)) ? value.alignment as WorkerProfile["alignment"] : defaults.alignment,
    brand: text(value.brand),
    gimmickSummary: text(value.gimmickSummary),
    currentMotivation: text(value.currentMotivation),
    longTermObjective: text(value.longTermObjective),
    creativeDirection: text(value.creativeDirection),
    privateNotes: text(value.privateNotes),
    inactivityWarningDays: Math.max(1, number(value.inactivityWarningDays, defaults.inactivityWarningDays)),
    arcs: Array.isArray(value.arcs)
      ? value.arcs.map(normalizeArc).filter((arc): arc is WorkerArc => arc !== null)
      : [],
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeRelationship(value: unknown): WorkerRelationship | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const defaults = createWorkerRelationship(text(value.workerAId), text(value.workerBId));
  const types = ["Ally", "Rival", "Tag Partner", "Stable Member", "Manager / Client", "Mentor / Student", "Family", "Authority Conflict", "Former Ally", "Betrayal", "Respect", "Other"];
  const statuses = ["Planned", "Active", "Paused", "Ended"];
  return {
    ...defaults,
    id: value.id,
    workerAId: text(value.workerAId),
    workerBId: text(value.workerBId),
    type: types.includes(text(value.type)) ? value.type as WorkerRelationship["type"] : defaults.type,
    status: statuses.includes(text(value.status)) ? value.status as WorkerRelationship["status"] : defaults.status,
    startDate: text(value.startDate, defaults.startDate),
    endDate: text(value.endDate),
    importance: Math.min(100, Math.max(0, number(value.importance, defaults.importance))),
    publicDescription: text(value.publicDescription),
    privateNotes: text(value.privateNotes),
    linkedStorylineId: text(value.linkedStorylineId),
    history: text(value.history),
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

export function parseWorkerUniverse(value: unknown): WorkerUniverse {
  if (!isRecord(value)) throw new Error("The worker profile data is not in a supported format.");
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeProfile).filter((profile): profile is WorkerProfile => profile !== null)
    : [];
  const relationships = Array.isArray(value.relationships)
    ? value.relationships.map(normalizeRelationship).filter((relationship): relationship is WorkerRelationship => relationship !== null)
    : [];
  return { profiles, relationships };
}

export function emptyWorkerUniverse(): WorkerUniverse {
  return { profiles: [], relationships: [] };
}

export function loadWorkerUniverse(storage: Pick<Storage, "getItem">): WorkerUniverse {
  const stored = storage.getItem(WORKER_STORAGE_KEY);
  if (!stored) return emptyWorkerUniverse();
  try {
    return parseWorkerUniverse(JSON.parse(stored) as unknown);
  } catch {
    return emptyWorkerUniverse();
  }
}

export function saveWorkerUniverse(
  storage: Pick<Storage, "setItem">,
  universe: WorkerUniverse,
): void {
  storage.setItem(WORKER_STORAGE_KEY, JSON.stringify(universe));
}
