import { createPlannedSegment } from "./model";
import type {
  PlannerBackup,
  PlannedSegment,
  PlannedShow,
  PlannedStorylineReference,
  PlannedWorkerReference,
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

  const status = value.status === "Ready" || value.status === "Completed" ? value.status : "Draft";
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

export function createPlannerBackup(shows: PlannedShow[]): PlannerBackup {
  return {
    product: "TEW IX Story Tracker",
    version: 2,
    exportedAt: new Date().toISOString(),
    shows,
  };
}

export function parsePlannerBackup(textValue: string): PlannedShow[] {
  let value: unknown;
  try {
    value = JSON.parse(textValue) as unknown;
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }
  if (
    !isRecord(value) ||
    value.product !== "TEW IX Story Tracker" ||
    (value.version !== 1 && value.version !== 2)
  ) {
    throw new Error("The selected file is not a supported TEW Story Tracker backup.");
  }
  return parsePlannerShows(value.shows);
}
