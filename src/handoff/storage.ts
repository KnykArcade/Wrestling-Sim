import {
  createEmptyChecklist,
  createEmptyHandoffUniverse,
  createSegmentProgress,
  createShowHandoffRecord,
} from "./model";
import type {
  HandoffChecklist,
  HandoffFieldKey,
  HandoffMapping,
  HandoffMappingKind,
  HandoffSegmentProgress,
  HandoffSegmentSnapshot,
  HandoffStatus,
  HandoffUniverse,
  HandoffVersion,
  ShowHandoffRecord,
} from "./types";

export const HANDOFF_STORAGE_KEY = "tew-story-tracker:handoff:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function normalizeChecklist(value: unknown): HandoffChecklist {
  const defaults = createEmptyChecklist();
  if (!isRecord(value)) return defaults;
  return {
    showCreated: bool(value.showCreated),
    eventSettingsEntered: bool(value.eventSettingsEntered),
    matchesEntered: bool(value.matchesEntered),
    anglesEntered: bool(value.anglesEntered),
    workersAssigned: bool(value.workersAssigned),
    winnersAndFinishesEntered: bool(value.winnersAndFinishesEntered),
    championshipsAssigned: bool(value.championshipsAssigned),
    storylinesAssigned: bool(value.storylinesAssigned),
    durationsChecked: bool(value.durationsChecked),
    runningOrderConfirmed: bool(value.runningOrderConfirmed),
    finalCardReviewed: bool(value.finalCardReviewed),
  };
}

function normalizeSegment(value: unknown, index: number): HandoffSegmentSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const type = value.type === "match" ? "match" : "angle";
  const section = value.section === "Pre-Show" || value.section === "Post-Show" ? value.section : "Main Show";
  return {
    id: value.id,
    order: Math.max(1, number(value.order, index + 1)),
    type,
    section,
    title: text(value.title),
    durationMinutes: Math.max(0, number(value.durationMinutes)),
    notes: text(value.notes),
    workers: Array.isArray(value.workers)
      ? value.workers.filter(isRecord).map((worker) => ({
          id: text(worker.id, text(worker.name)),
          name: text(worker.name),
          role: text(worker.role),
          side: text(worker.side),
          source: worker.source === "tew" ? "tew" as const : "manual" as const,
        })).filter((worker) => Boolean(worker.name))
      : [],
    storylines: Array.isArray(value.storylines)
      ? value.storylines.filter(isRecord).map((storyline) => ({
          id: text(storyline.id, text(storyline.name)),
          name: text(storyline.name),
          source: storyline.source === "tew" ? "tew" as const : "manual" as const,
        })).filter((storyline) => Boolean(storyline.name))
      : [],
    purpose: text(value.purpose),
    consequences: text(value.consequences),
    followUp: text(value.followUp),
    privateNotes: text(value.privateNotes),
    matchType: text(value.matchType),
    championship: text(value.championship),
    championshipId: text(value.championshipId),
    championshipMatchPurpose: text(value.championshipMatchPurpose),
    championEntering: text(value.championEntering),
    challenger: text(value.challenger),
    expectedTitleChange: nullableBoolean(value.expectedTitleChange),
    championshipStakes: text(value.championshipStakes),
    plannedWinner: text(value.plannedWinner),
    plannedFinish: text(value.plannedFinish),
    matchStory: text(value.matchStory),
    keyMoments: text(value.keyMoments),
    interference: text(value.interference),
    postMatch: text(value.postMatch),
    angleLocation: text(value.angleLocation),
    angleContentType: text(value.angleContentType),
    segmentOutput: text(value.segmentOutput),
    audienceTakeaway: text(value.audienceTakeaway),
    bookingIdeaId: text(value.bookingIdeaId),
  };
}

function normalizeVersion(value: unknown): HandoffVersion | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.show) || !Array.isArray(value.segments)) return null;
  const segments = value.segments.map(normalizeSegment).filter((segment): segment is HandoffSegmentSnapshot => segment !== null);
  return {
    id: value.id,
    versionNumber: Math.max(1, number(value.versionNumber, 1)),
    createdAt: text(value.createdAt, new Date().toISOString()),
    show: {
      id: text(value.show.id),
      name: text(value.show.name),
      date: text(value.show.date),
      company: text(value.show.company),
      showType: text(value.show.showType, "Television"),
      venue: text(value.show.venue),
      expectedMinutes: Math.max(0, number(value.show.expectedMinutes, 120)),
      notes: text(value.show.notes),
      sourceUpdatedAt: text(value.show.sourceUpdatedAt),
    },
    segments,
    changesFromPrevious: Array.isArray(value.changesFromPrevious)
      ? value.changesFromPrevious.filter((item): item is string => typeof item === "string")
      : [],
  };
}

const fieldKeys: HandoffFieldKey[] = ["title", "participants", "duration", "winner", "finish", "championship", "narrative", "storylines", "agentNotes"];

function normalizeProgress(value: unknown): HandoffSegmentProgress | null {
  if (!isRecord(value) || typeof value.segmentId !== "string") return null;
  const defaults = createSegmentProgress(value.segmentId);
  const fields = isRecord(value.fields) ? value.fields : {};
  return {
    segmentId: value.segmentId,
    fields: Object.fromEntries(fieldKeys.map((key) => [key, bool(fields[key])])) as Record<HandoffFieldKey, boolean>,
    completed: bool(value.completed),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeRecord(value: unknown): ShowHandoffRecord | null {
  if (!isRecord(value) || typeof value.showId !== "string") return null;
  const defaults = createShowHandoffRecord(value.showId);
  const statuses: HandoffStatus[] = ["Draft", "Ready", "Finalized for TEW", "Entering in TEW", "Entered in TEW", "Completed", "Reconciled"];
  return {
    showId: value.showId,
    status: statuses.includes(text(value.status) as HandoffStatus) ? text(value.status) as HandoffStatus : defaults.status,
    activeVersionId: text(value.activeVersionId),
    versions: Array.isArray(value.versions) ? value.versions.map(normalizeVersion).filter((version): version is HandoffVersion => version !== null) : [],
    checklist: normalizeChecklist(value.checklist),
    segmentProgress: Array.isArray(value.segmentProgress) ? value.segmentProgress.map(normalizeProgress).filter((progress): progress is HandoffSegmentProgress => progress !== null) : [],
    entryNotes: text(value.entryNotes),
    startedAt: text(value.startedAt),
    enteredAt: text(value.enteredAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

function normalizeMapping(value: unknown): HandoffMapping | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const kinds: HandoffMappingKind[] = ["Worker", "Championship", "Storyline", "Company", "Match Term"];
  const kind = text(value.kind) as HandoffMappingKind;
  if (!kinds.includes(kind)) return null;
  return {
    id: value.id,
    kind,
    trackerId: text(value.trackerId),
    trackerName: text(value.trackerName),
    tewId: text(value.tewId),
    tewName: text(value.tewName),
    updatedAt: text(value.updatedAt, new Date().toISOString()),
  };
}

export function parseHandoffUniverse(value: unknown): HandoffUniverse {
  if (!isRecord(value)) throw new Error("The TEW handoff data is not in a supported format.");
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord).filter((record): record is ShowHandoffRecord => record !== null) : [],
    mappings: Array.isArray(value.mappings) ? value.mappings.map(normalizeMapping).filter((mapping): mapping is HandoffMapping => mapping !== null) : [],
  };
}

export function emptyHandoffUniverse(): HandoffUniverse {
  return createEmptyHandoffUniverse();
}

export function loadHandoffUniverse(storage: Pick<Storage, "getItem">): HandoffUniverse {
  const stored = storage.getItem(HANDOFF_STORAGE_KEY);
  if (!stored) return emptyHandoffUniverse();
  try {
    return parseHandoffUniverse(JSON.parse(stored) as unknown);
  } catch {
    return emptyHandoffUniverse();
  }
}

export function saveHandoffUniverse(storage: Pick<Storage, "setItem">, universe: HandoffUniverse): void {
  storage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(universe));
}
