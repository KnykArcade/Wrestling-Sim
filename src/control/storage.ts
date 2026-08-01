import { createBookingIdea, defaultControlSettings } from "./model";
import type { BookingIdea, CreativeControlData } from "./types";

export const CONTROL_STORAGE_KEY = "tew-story-tracker:creative-control:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIdea(value: unknown, index: number): BookingIdea | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const defaults = createBookingIdea(index + 1);
  const types = ["Match", "Angle", "Promo", "Debut", "Return", "Turn", "Betrayal", "Title Change", "Challenge", "Reveal", "Mystery", "Interference", "Injury Story", "Custom"];
  const statuses = ["Inbox", "Developing", "Ready", "Scheduled", "Completed", "Delayed", "Cancelled", "Archived"];
  const priorities = ["Low", "Normal", "High", "Critical"];
  return {
    ...defaults,
    id: value.id,
    title: text(value.title, defaults.title),
    type: types.includes(text(value.type)) ? value.type as BookingIdea["type"] : defaults.type,
    status: statuses.includes(text(value.status)) ? value.status as BookingIdea["status"] : defaults.status,
    priority: priorities.includes(text(value.priority)) ? value.priority as BookingIdea["priority"] : defaults.priority,
    targetDate: text(value.targetDate),
    targetShowId: text(value.targetShowId),
    workers: Array.isArray(value.workers) ? value.workers.filter(isRecord).map((worker) => ({ id: text(worker.id), name: text(worker.name), role: text(worker.role) })).filter((worker) => worker.name.trim()) : [],
    storylines: Array.isArray(value.storylines) ? value.storylines.filter(isRecord).map((storyline) => ({ id: text(storyline.id), name: text(storyline.name) })).filter((storyline) => storyline.name.trim()) : [],
    championship: text(value.championship),
    concept: text(value.concept),
    creativePurpose: text(value.creativePurpose),
    plannedConsequences: text(value.plannedConsequences),
    followUp: text(value.followUp),
    privateNotes: text(value.privateNotes),
    scheduledSegmentId: text(value.scheduledSegmentId),
    completedAt: text(value.completedAt),
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

export function emptyCreativeControlData(): CreativeControlData {
  return { ideas: [], settings: defaultControlSettings() };
}

export function parseCreativeControlData(value: unknown): CreativeControlData {
  if (!isRecord(value)) return emptyCreativeControlData();
  const settings = isRecord(value.settings) ? value.settings : {};
  const calendarFilters = ["All", "Shows", "Milestones", "Arcs", "Ideas"];
  return {
    ideas: Array.isArray(value.ideas) ? value.ideas.map(normalizeIdea).filter((idea): idea is BookingIdea => idea !== null) : [],
    settings: {
      dashboardWindowDays: Math.max(7, Math.min(365, number(settings.dashboardWindowDays, 45))),
      calendarFilter: calendarFilters.includes(text(settings.calendarFilter)) ? settings.calendarFilter as CreativeControlData["settings"]["calendarFilter"] : "All",
      searchQuery: text(settings.searchQuery),
    },
  };
}

export function loadCreativeControlData(storage: Pick<Storage, "getItem">): CreativeControlData {
  const stored = storage.getItem(CONTROL_STORAGE_KEY);
  if (!stored) return emptyCreativeControlData();
  try {
    return parseCreativeControlData(JSON.parse(stored) as unknown);
  } catch {
    return emptyCreativeControlData();
  }
}

export function saveCreativeControlData(storage: Pick<Storage, "setItem">, data: CreativeControlData): void {
  storage.setItem(CONTROL_STORAGE_KEY, JSON.stringify(data));
}
