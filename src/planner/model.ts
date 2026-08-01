import type {
  PlannedSegment,
  PlannedSegmentSection,
  PlannedSegmentType,
  PlannedShow,
} from "./types";

function fallbackId(): string {
  return `planner-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPlannerId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackId();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createPlannedShow(sequence: number): PlannedShow {
  const timestamp = new Date().toISOString();
  return {
    id: createPlannerId(),
    name: `Untitled Show ${sequence}`,
    date: today(),
    company: "",
    showType: "Television",
    venue: "",
    expectedMinutes: 120,
    status: "Draft",
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    segments: [],
  };
}

export function createPlannedSegment(type: PlannedSegmentType): PlannedSegment {
  return {
    id: createPlannerId(),
    type,
    section: "Main Show",
    title: type === "match" ? "Untitled Match" : "Untitled Angle",
    durationMinutes: type === "match" ? 12 : 5,
    notes: "",
  };
}

export function touchShow(show: PlannedShow): PlannedShow {
  return { ...show, updatedAt: new Date().toISOString() };
}

export function duplicatePlannedShow(show: PlannedShow): PlannedShow {
  const timestamp = new Date().toISOString();
  return {
    ...show,
    id: createPlannerId(),
    name: `${show.name} Copy`,
    status: "Draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    segments: show.segments.map((segment) => ({ ...segment, id: createPlannerId() })),
  };
}

export function movePlannedSegment(
  segments: PlannedSegment[],
  segmentId: string,
  direction: -1 | 1,
): PlannedSegment[] {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= segments.length) {
    return segments;
  }
  const next = [...segments];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function sectionLabel(section: PlannedSegmentSection): string {
  return section;
}

export function totalPlannedMinutes(show: PlannedShow): number {
  return show.segments.reduce((total, segment) => total + segment.durationMinutes, 0);
}
