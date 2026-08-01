import type { PlannerBackup, PlannedSegment, PlannedShow } from "./types";

export const PLANNER_STORAGE_KEY = "tew-story-tracker:planned-shows:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSegment(value: unknown): value is PlannedSegment {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    (value.type === "match" || value.type === "angle") &&
    (value.section === "Pre-Show" ||
      value.section === "Main Show" ||
      value.section === "Post-Show") &&
    typeof value.title === "string" &&
    typeof value.durationMinutes === "number" &&
    Number.isFinite(value.durationMinutes) &&
    typeof value.notes === "string"
  );
}

function isShow(value: unknown): value is PlannedShow {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.date === "string" &&
    typeof value.company === "string" &&
    typeof value.showType === "string" &&
    typeof value.venue === "string" &&
    typeof value.expectedMinutes === "number" &&
    Number.isFinite(value.expectedMinutes) &&
    (value.status === "Draft" || value.status === "Ready" || value.status === "Completed") &&
    typeof value.notes === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.segments.every(isSegment)
  );
}

export function parsePlannerShows(value: unknown): PlannedShow[] {
  if (!Array.isArray(value) || !value.every(isShow)) {
    throw new Error("The planned-show data is not in a supported format.");
  }
  return value;
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
    version: 1,
    exportedAt: new Date().toISOString(),
    shows,
  };
}

export function parsePlannerBackup(text: string): PlannedShow[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }
  if (!isRecord(value) || value.product !== "TEW IX Story Tracker" || value.version !== 1) {
    throw new Error("The selected file is not a supported TEW Story Tracker backup.");
  }
  return parsePlannerShows(value.shows);
}
