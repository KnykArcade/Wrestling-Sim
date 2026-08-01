import { loadTrackerStorylines, parseTrackerStorylines, saveTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import { createEmptySegmentReconciliation, createPlannedSegment } from "./model";
import type {
  ActualMatchSnapshot,
  ActualShowSnapshot,
  PlannerBackup,
  PlannerBackupBundle,
  PlannedSegment,
  PlannedShow,
  PlannedStorylineReference,
  PlannedWorkerReference,
  SegmentReconciliation,
  ShowReconciliation,
} from "./types";

export const PLANNER_STORAGE_KEY = "tew-story-tracker:planned-shows:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeWorker(value: unknown): PlannedWorkerReference | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  return {
    id: text(value.id, `manual-${value.name}`),
    name: value.name,
    role: text(value.role),
    side: text(value.side),
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeStoryline(value: unknown): PlannedStorylineReference | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  return {
    id: text(value.id, `manual-${value.name}`),
    name: value.name,
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeActualMatch(value: unknown): ActualMatchSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  const placement =
    value.placement === "Pre-Show" || value.placement === "Post-Show"
      ? value.placement
      : "Main Show";
  return {
    id: value.id,
    description: text(value.description),
    rating: nullableNumber(value.rating),
    winner: text(value.winner),
    matchTime: text(value.matchTime),
    notes: text(value.notes),
    placement,
    workers: Array.isArray(value.workers)
      ? value.workers.filter((worker): worker is string => typeof worker === "string")
      : [],
  };
}

function normalizeSegmentReconciliation(value: unknown): SegmentReconciliation {
  const defaults = createEmptySegmentReconciliation();
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    linkedMatchId: text(value.linkedMatchId),
    actualMatch: normalizeActualMatch(value.actualMatch),
    happenedAsPlanned: nullableBoolean(value.happenedAsPlanned),
    actualRating: nullableNumber(value.actualRating),
    finalNarrative: text(value.finalNarrative),
    changes: text(value.changes),
    actualConsequences: text(value.actualConsequences),
    finalFollowUp: text(value.finalFollowUp),
    reconciledAt: text(value.reconciledAt),
  };
}

function normalizeActualShow(value: unknown): ActualShowSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: text(value.name),
    date: text(value.date),
    rating: nullableNumber(value.rating),
    attendance: nullableNumber(value.attendance),
    venue: text(value.venue),
    company: text(value.company),
    broadcast: text(value.broadcast),
    sourceFile: text(value.sourceFile),
  };
}

function normalizeShowReconciliation(value: unknown): ShowReconciliation | null {
  if (!isRecord(value)) {
    return null;
  }
  const actualShow = normalizeActualShow(value.actualShow);
  if (!actualShow) {
    return null;
  }
  return {
    linkedShowId: text(value.linkedShowId, actualShow.id),
    actualShow,
    linkedAt: text(value.linkedAt),
    completedAt: text(value.completedAt),
    notes: text(value.notes),
  };
}

function normalizeSegment(value: unknown): PlannedSegment | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.type !== "match" && value.type !== "angle") ||
    (value.section !== "Pre-Show" && value.section !== "Main Show" && value.section !== "Post-Show") ||
    typeof value.title !== "string"
  ) {
    return null;
  }

  const defaults = createPlannedSegment(value.type);
  const workers = Array.isArray(value.workers)
    ? value.workers.map(normalizeWorker).filter((item): item is PlannedWorkerReference => item !== null)
    : [];
  const storylines = Array.isArray(value.storylines)
    ? value.storylines
        .map(normalizeStoryline)
        .filter((item): item is PlannedStorylineReference => item !== null)
    : [];
  const workflowStatus =
    value.workflowStatus === "Entered in TEW" ||
    value.workflowStatus === "Completed" ||
    value.workflowStatus === "Reconciled"
      ? value.workflowStatus
      : "Planned";

  return {
    ...defaults,
    id: value.id,
    type: value.type,
    section: value.section,
    title: value.title,
    durationMinutes: Math.max(1, finiteNumber(value.durationMinutes, defaults.durationMinutes)),
    notes: text(value.notes),
    workers,
    storylines,
    purpose: text(value.purpose),
    consequences: text(value.consequences),
    followUp: text(value.followUp),
    privateNotes: text(value.privateNotes),
    matchType: text(value.matchType, defaults.matchType),
    championship: text(value.championship),
    plannedWinner: text(value.plannedWinner),
    plannedFinish: text(value.plannedFinish),
    matchStory: text(value.matchStory),
    keyMoments: text(value.keyMoments),
    interference: text(value.interference),
    postMatch: text(value.postMatch),
    angleLocation: text(value.angleLocation, defaults.angleLocation),
    angleContentType: text(value.angleContentType, defaults.angleContentType),
    segmentOutput: text(value.segmentOutput),
    audienceTakeaway: text(value.audienceTakeaway),
    workflowStatus,
    reconciliation: normalizeSegmentReconciliation(value.reconciliation),
  };
}

function normalizeShow(value: unknown): PlannedShow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.segments)
  ) {
    return null;
  }

  const segments = value.segments.map(normalizeSegment);
  if (segments.some((segment) => segment === null)) {
    return null;
  }

  const status =
    value.status === "Ready" || value.status === "Completed" || value.status === "Reconciled"
      ? value.status
      : "Draft";
  return {
    id: value.id,
    name: value.name,
    date: text(value.date),
    company: text(value.company),
    showType: text(value.showType, "Television"),
    venue: text(value.venue),
    expectedMinutes: Math.max(15, finiteNumber(value.expectedMinutes, 120)),
    status,
    notes: text(value.notes),
    createdAt: text(value.createdAt, new Date().toISOString()),
    updatedAt: text(value.updatedAt, new Date().toISOString()),
    segments: segments as PlannedSegment[],
    reconciliation: normalizeShowReconciliation(value.reconciliation),
  };
}

export function parsePlannerShows(value: unknown): PlannedShow[] {
  if (!Array.isArray(value)) {
    throw new Error("The planned-show data is not in a supported format.");
  }
  const shows = value.map(normalizeShow);
  if (shows.some((show) => show === null)) {
    throw new Error("The planned-show data is not in a supported format.");
  }
  return shows as PlannedShow[];
}

export function loadPlannedShows(storage: Pick<Storage, "getItem">): PlannedShow[] {
  const stored = storage.getItem(PLANNER_STORAGE_KEY);
  if (!stored) {
    return [];
  }
  try {
    return parsePlannerShows(JSON.parse(stored) as unknown);
  } catch {
    return [];
  }
}

export function savePlannedShows(
  storage: Pick<Storage, "setItem">,
  shows: PlannedShow[],
): void {
  storage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(shows));
}

function browserStorylines(): TrackerStoryline[] {
  if (typeof window === "undefined") {
    return [];
  }
  return loadTrackerStorylines(window.localStorage);
}

export function createPlannerBackup(
  shows: PlannedShow[],
  storylines: TrackerStoryline[] = browserStorylines(),
): PlannerBackup {
  return {
    product: "TEW IX Story Tracker",
    version: 4,
    exportedAt: new Date().toISOString(),
    shows,
    storylines,
  };
}

export function parsePlannerBackupBundle(textValue: string): PlannerBackupBundle {
  let value: unknown;
  try {
    value = JSON.parse(textValue) as unknown;
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }
  if (
    !isRecord(value) ||
    value.product !== "TEW IX Story Tracker" ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4)
  ) {
    throw new Error("The selected file is not a supported TEW Story Tracker backup.");
  }
  return {
    shows: parsePlannerShows(value.shows),
    storylines: value.version === 4 ? parseTrackerStorylines(value.storylines ?? []) : [],
  };
}

export function parsePlannerBackup(textValue: string): PlannedShow[] {
  const bundle = parsePlannerBackupBundle(textValue);
  if (typeof window !== "undefined") {
    saveTrackerStorylines(window.localStorage, bundle.storylines);
  }
  return bundle.shows;
}
