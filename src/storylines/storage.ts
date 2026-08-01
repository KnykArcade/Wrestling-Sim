import { createStorylineMilestone, createTrackerStoryline } from "./model";
import type {
  StorylineMilestone,
  StorylineParticipant,
  StorylineReferenceLink,
  TrackerStoryline,
} from "./types";

export const STORYLINE_STORAGE_KEY = "tew-story-tracker:storylines:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeParticipant(value: unknown): StorylineParticipant | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  return {
    id: text(value.id, `participant-${value.name}`),
    name: value.name,
    role: text(value.role, "Supporting participant"),
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeReference(value: unknown): StorylineReferenceLink | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  return {
    id: text(value.id, `reference-${value.name}`),
    source: value.source === "tew" ? "tew" : "manual",
    referenceId: text(value.referenceId),
    name: value.name,
  };
}

function normalizeMilestone(value: unknown, index: number): StorylineMilestone | null {
  if (!isRecord(value)) {
    return null;
  }
  const defaults = createStorylineMilestone(index + 1);
  const types = [
    "Inciting Incident",
    "Escalation",
    "Betrayal",
    "Reveal",
    "Match",
    "Title Change",
    "Turn",
    "Climax",
    "Aftermath",
    "Other",
  ];
  const statuses = ["Unassigned", "Assigned", "Completed", "Delayed", "Cancelled"];
  return {
    ...defaults,
    id: text(value.id, defaults.id),
    type: types.includes(text(value.type))
      ? (value.type as StorylineMilestone["type"])
      : defaults.type,
    title: text(value.title, defaults.title),
    targetDate: text(value.targetDate),
    status: statuses.includes(text(value.status))
      ? (value.status as StorylineMilestone["status"])
      : defaults.status,
    assignedShowId: text(value.assignedShowId),
    notes: text(value.notes),
  };
}

function normalizeStoryline(value: unknown, index: number): TrackerStoryline | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const defaults = createTrackerStoryline(index + 1);
  const statuses = ["Idea", "Planned", "Active", "Paused", "Completed", "Abandoned"];
  const participants = Array.isArray(value.participants)
    ? value.participants
        .map(normalizeParticipant)
        .filter((item): item is StorylineParticipant => item !== null)
    : [];
  const referenceLinks = Array.isArray(value.referenceLinks)
    ? value.referenceLinks
        .map(normalizeReference)
        .filter((item): item is StorylineReferenceLink => item !== null)
    : [];
  const milestones = Array.isArray(value.milestones)
    ? value.milestones
        .map(normalizeMilestone)
        .filter((item): item is StorylineMilestone => item !== null)
    : [];
  return {
    ...defaults,
    id: value.id,
    name: value.name,
    status: statuses.includes(text(value.status))
      ? (value.status as TrackerStoryline["status"])
      : defaults.status,
    startDate: text(value.startDate, defaults.startDate),
    plannedEndDate: text(value.plannedEndDate),
    currentPhase: text(value.currentPhase, defaults.currentPhase),
    linkedChampionship: text(value.linkedChampionship),
    premise: text(value.premise),
    centralConflict: text(value.centralConflict),
    motivations: text(value.motivations),
    plannedBeginning: text(value.plannedBeginning),
    plannedClimax: text(value.plannedClimax),
    plannedEnding: text(value.plannedEnding),
    aftermath: text(value.aftermath),
    privateNotes: text(value.privateNotes),
    participants,
    referenceLinks,
    milestones,
    knownSegmentIds: Array.isArray(value.knownSegmentIds)
      ? value.knownSegmentIds.filter((id): id is string => typeof id === "string")
      : [],
    createdAt: text(value.createdAt, defaults.createdAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

export function parseTrackerStorylines(value: unknown): TrackerStoryline[] {
  if (!Array.isArray(value)) {
    throw new Error("The storyline data is not in a supported format.");
  }
  const storylines = value.map(normalizeStoryline);
  if (storylines.some((storyline) => storyline === null)) {
    throw new Error("The storyline data is not in a supported format.");
  }
  return storylines as TrackerStoryline[];
}

export function loadTrackerStorylines(
  storage: Pick<Storage, "getItem">,
): TrackerStoryline[] {
  const stored = storage.getItem(STORYLINE_STORAGE_KEY);
  if (!stored) {
    return [];
  }
  try {
    return parseTrackerStorylines(JSON.parse(stored) as unknown);
  } catch {
    return [];
  }
}

export function saveTrackerStorylines(
  storage: Pick<Storage, "setItem">,
  storylines: TrackerStoryline[],
): void {
  storage.setItem(STORYLINE_STORAGE_KEY, JSON.stringify(storylines));
}
