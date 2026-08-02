import { MATCH_AIMS } from "../matchEngine/catalog";
import { createEmptyMatchApproachSetup, getApproach } from "../matchEngine/model";
import { formatStarRating } from "../matchEngine/performance";
import type {
  PlannedSegment,
  PlannedSegmentSection,
  PlannedSegmentType,
  PlannedShow,
  SegmentReconciliation,
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

export function createEmptySegmentReconciliation(): SegmentReconciliation {
  return {
    linkedMatchId: "",
    actualMatch: null,
    happenedAsPlanned: null,
    actualRating: null,
    finalNarrative: "",
    changes: "",
    actualConsequences: "",
    finalFollowUp: "",
    reconciledAt: "",
  };
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
    reconciliation: null,
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
    workers: [],
    storylines: [],
    purpose: "",
    consequences: "",
    followUp: "",
    privateNotes: "",

    matchType: type === "match" ? "1 vs. 1" : "",
    championship: "",
    championshipId: "",
    championshipMatchPurpose: "",
    championEntering: "",
    challenger: "",
    expectedTitleChange: null,
    championshipStakes: "",
    titleResultDecision: "",
    titleResultConfirmedAt: "",
    plannedWinner: "",
    plannedFinish: "",
    matchStory: "",
    keyMoments: "",
    interference: "",
    postMatch: "",
    matchApproachSetup: createEmptyMatchApproachSetup(),
    competitionId: "",
    competitionFixtureId: "",
    competitionRoundLabel: "",

    angleLocation: type === "angle" ? "In The Ring" : "",
    angleContentType: type === "angle" ? "Serious" : "",
    segmentOutput: "",
    audienceTakeaway: "",

    bookingIdeaId: "",
    workflowStatus: "Planned",
    reconciliation: createEmptySegmentReconciliation(),
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
    reconciliation: null,
    segments: show.segments.map((segment) => ({
      ...segment,
      id: createPlannerId(),
      bookingIdeaId: "",
      competitionId: "",
      competitionFixtureId: "",
      competitionRoundLabel: "",
      titleResultDecision: "",
      titleResultConfirmedAt: "",
      workflowStatus: "Planned",
      reconciliation: createEmptySegmentReconciliation(),
      matchApproachSetup: {
        ...segment.matchApproachSetup,
        workerPlans: segment.matchApproachSetup.workerPlans.map((plan) => ({
          ...plan,
          selectedApproachIds: [...plan.selectedApproachIds],
          lockedApproachIds: [...plan.lockedApproachIds],
          generatedAt: "",
        })),
        performancePreview: null,
        updatedAt: "",
      },
      workers: segment.workers.map((worker) => ({ ...worker, id: createPlannerId() })),
      storylines: segment.storylines.map((storyline) => ({ ...storyline })),
    })),
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

export function buildTewEntrySummary(segment: PlannedSegment): string {
  const people = segment.workers
    .map((worker) => [worker.name, worker.role, worker.side].filter(Boolean).join(" — "))
    .join("\n");
  const storylines = segment.storylines.map((storyline) => storyline.name).join(", ");
  const lines = [
    segment.title,
    `${segment.type === "match" ? "Match" : "Angle"} · ${segment.section} · ${segment.durationMinutes} minutes`,
    people ? `Workers:\n${people}` : "",
    storylines ? `Storylines: ${storylines}` : "",
  ];

  if (segment.type === "match") {
    const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId);
    const approaches = segment.matchApproachSetup.workerPlans
      .filter((plan) => plan.selectedApproachIds.length > 0)
      .map((plan) => `${plan.workerName}: ${plan.selectedApproachIds.map((id) => getApproach(id)?.name ?? id).join(", ")}`)
      .join("\n");
    const preview = segment.matchApproachSetup.performancePreview;
    const previewWinner = preview?.projectedWinnerName ? ` · Preview winner: ${preview.projectedWinnerName}` : "";
    lines.push(
      segment.competitionId ? `Competition fixture: ${segment.competitionRoundLabel || "Linked competition round"}` : "",
      segment.matchType ? `Match type: ${segment.matchType}` : "",
      segment.championship ? `Championship: ${segment.championship}` : "",
      segment.championshipMatchPurpose ? `Title match purpose: ${segment.championshipMatchPurpose}` : "",
      segment.championEntering ? `Champion entering: ${segment.championEntering}` : "",
      segment.challenger ? `Challenger: ${segment.challenger}` : "",
      segment.expectedTitleChange === null ? "" : `Expected title change: ${segment.expectedTitleChange ? "Yes" : "No"}`,
      segment.championshipStakes ? `Championship stakes: ${segment.championshipStakes}` : "",
      aim ? `Match aim: ${aim.name} · Ideal pace ${aim.idealPace}` : "",
      approaches ? `Selected match approaches:\n${approaches}` : "",
      segment.matchApproachSetup.notes ? `Approach notes:\n${segment.matchApproachSetup.notes}` : "",
      preview ? `Tracker performance preview — advisory only: ${preview.matchScore.toFixed(1)}/100 · ${formatStarRating(preview.starRating)}${previewWinner}\n${preview.summary}` : "",
      segment.plannedWinner ? `Planned winner: ${segment.plannedWinner}` : "",
      segment.plannedFinish ? `Planned finish: ${segment.plannedFinish}` : "",
      segment.matchStory ? `Match story:\n${segment.matchStory}` : "",
    );
  } else {
    lines.push(
      segment.angleLocation ? `Location: ${segment.angleLocation}` : "",
      segment.angleContentType ? `Content type: ${segment.angleContentType}` : "",
      segment.segmentOutput ? `Segment output:\n${segment.segmentOutput}` : "",
    );
  }

  return lines.filter(Boolean).join("\n\n");
}
