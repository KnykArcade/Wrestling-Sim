import type { MatchRecord, ShowRecord } from "../tew/types";
import { createEmptySegmentReconciliation } from "./model";
import type {
  ActualMatchSnapshot,
  ActualShowSnapshot,
  PlannedSegment,
  PlannedShow,
} from "./types";

export interface RankedCandidate<T> {
  item: T;
  score: number;
  reasons: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1));
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function dateOnly(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : value.slice(0, 10);
}

function dateDistanceDays(left: string, right: string): number | null {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return null;
  }
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

export function scoreShowCandidate(planned: PlannedShow, actual: ShowRecord): RankedCandidate<ShowRecord> {
  let score = 0;
  const reasons: string[] = [];

  const nameScore = overlapScore(planned.name, actual.name);
  score += Math.round(nameScore * 35);
  if (nameScore >= 0.75) {
    reasons.push("show names closely match");
  } else if (nameScore > 0) {
    reasons.push("show names partially match");
  }

  const distance = dateDistanceDays(planned.date, actual.date);
  if (distance !== null) {
    if (distance === 0) {
      score += 35;
      reasons.push("same date");
    } else if (distance <= 1) {
      score += 25;
      reasons.push("dates are one day apart");
    } else if (distance <= 7) {
      score += 10;
      reasons.push("dates are within one week");
    }
  }

  const companyScore = overlapScore(planned.company, actual.company);
  score += Math.round(companyScore * 15);
  if (companyScore >= 0.75 && planned.company.trim()) {
    reasons.push("company matches");
  }

  const plannedMatches = planned.segments.filter((segment) => segment.type === "match").length;
  const actualMatches = actual.matches.length;
  if (plannedMatches === actualMatches) {
    score += 15;
    reasons.push("match counts agree");
  } else if (Math.abs(plannedMatches - actualMatches) === 1) {
    score += 8;
    reasons.push("match counts differ by one");
  }

  return { item: actual, score: Math.min(100, score), reasons };
}

export function rankShowCandidates(
  planned: PlannedShow,
  actualShows: ShowRecord[],
): Array<RankedCandidate<ShowRecord>> {
  return actualShows
    .map((show) => scoreShowCandidate(planned, show))
    .sort((left, right) => right.score - left.score || right.item.date.localeCompare(left.item.date));
}

function plannedWorkerNames(segment: PlannedSegment): string[] {
  return segment.workers.map((worker) => normalize(worker.name)).filter(Boolean);
}

function actualWorkerNames(match: MatchRecord): string[] {
  return match.workers.map((worker) => normalize(worker.name)).filter(Boolean);
}

function workerOverlap(segment: PlannedSegment, match: MatchRecord): number {
  const planned = new Set(plannedWorkerNames(segment));
  const actual = new Set(actualWorkerNames(match));
  if (planned.size === 0 || actual.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const name of planned) {
    if (actual.has(name)) {
      shared += 1;
    }
  }
  return shared / Math.max(planned.size, actual.size);
}

export function scoreMatchCandidate(
  segment: PlannedSegment,
  actual: MatchRecord,
  plannedIndex: number,
  actualIndex: number,
): RankedCandidate<MatchRecord> {
  let score = 0;
  const reasons: string[] = [];

  if (segment.section === actual.placement) {
    score += 20;
    reasons.push("card placement matches");
  }

  const workers = workerOverlap(segment, actual);
  score += Math.round(workers * 40);
  if (workers === 1) {
    reasons.push("all participants match");
  } else if (workers > 0) {
    reasons.push("some participants match");
  }

  const titleScore = Math.max(
    overlapScore(segment.title, actual.description),
    overlapScore(segment.matchStory, actual.description),
  );
  score += Math.round(titleScore * 20);
  if (titleScore >= 0.5) {
    reasons.push("description resembles the plan");
  }

  if (
    segment.plannedWinner.trim() &&
    normalize(actual.description).includes(normalize(segment.plannedWinner))
  ) {
    score += 10;
    reasons.push("planned winner appears in the result");
  }

  const orderDifference = Math.abs(plannedIndex - actualIndex);
  if (orderDifference === 0) {
    score += 10;
    reasons.push("same card order");
  } else if (orderDifference === 1) {
    score += 5;
    reasons.push("adjacent card order");
  }

  return { item: actual, score: Math.min(100, score), reasons };
}

export function rankMatchCandidates(
  segment: PlannedSegment,
  actualMatches: MatchRecord[],
  plannedIndex: number,
): Array<RankedCandidate<MatchRecord>> {
  return actualMatches
    .map((match, actualIndex) => scoreMatchCandidate(segment, match, plannedIndex, actualIndex))
    .sort((left, right) => right.score - left.score);
}

export function snapshotMatch(match: MatchRecord): ActualMatchSnapshot {
  return {
    id: match.id,
    description: match.description,
    rating: match.rating,
    winner: match.winner,
    matchTime: match.matchTime,
    notes: match.notes,
    placement: match.placement,
    workers: match.workers.map((worker) => worker.name),
  };
}

export function snapshotShow(show: ShowRecord, sourceFile: string): ActualShowSnapshot {
  return {
    id: show.id,
    name: show.name,
    date: show.date,
    rating: show.rating,
    attendance: show.attendance,
    venue: show.venue,
    company: show.company,
    broadcast: show.broadcast,
    sourceFile,
  };
}

export function autoMatchSegments(
  plannedSegments: PlannedSegment[],
  actualMatches: MatchRecord[],
): PlannedSegment[] {
  const used = new Set<string>();
  let plannedMatchIndex = 0;

  return plannedSegments.map((segment) => {
    if (segment.type !== "match") {
      return segment;
    }

    const candidates = rankMatchCandidates(
      segment,
      actualMatches.filter((match) => !used.has(match.id)),
      plannedMatchIndex,
    );
    plannedMatchIndex += 1;
    const best = candidates[0];
    if (!best || best.score < 25) {
      return {
        ...segment,
        workflowStatus: segment.workflowStatus === "Reconciled" ? "Completed" : segment.workflowStatus,
        reconciliation: {
          ...segment.reconciliation,
          linkedMatchId: "",
          actualMatch: null,
          actualRating: null,
        },
      };
    }

    used.add(best.item.id);
    return {
      ...segment,
      workflowStatus: "Completed",
      reconciliation: {
        ...segment.reconciliation,
        linkedMatchId: best.item.id,
        actualMatch: snapshotMatch(best.item),
        actualRating: best.item.rating,
        finalNarrative: segment.reconciliation.finalNarrative || segment.matchStory,
      },
    };
  });
}

export function linkPlannedShow(
  planned: PlannedShow,
  actual: ShowRecord,
  sourceFile: string,
): PlannedShow {
  const now = new Date().toISOString();
  return {
    ...planned,
    status: "Completed",
    reconciliation: {
      linkedShowId: actual.id,
      actualShow: snapshotShow(actual, sourceFile),
      linkedAt: now,
      completedAt: "",
      notes: planned.reconciliation?.notes ?? "",
    },
    segments: autoMatchSegments(planned.segments, actual.matches).map((segment) =>
      segment.type === "angle"
        ? {
            ...segment,
            workflowStatus: segment.workflowStatus === "Planned" ? "Completed" : segment.workflowStatus,
            reconciliation: {
              ...segment.reconciliation,
              finalNarrative: segment.reconciliation.finalNarrative || segment.segmentOutput,
            },
          }
        : segment,
    ),
  };
}

export function setSegmentActualMatch(
  segment: PlannedSegment,
  match: MatchRecord | null,
): PlannedSegment {
  if (!match) {
    return {
      ...segment,
      workflowStatus: "Completed",
      reconciliation: {
        ...segment.reconciliation,
        linkedMatchId: "",
        actualMatch: null,
        actualRating: null,
      },
    };
  }
  return {
    ...segment,
    workflowStatus: "Completed",
    reconciliation: {
      ...segment.reconciliation,
      linkedMatchId: match.id,
      actualMatch: snapshotMatch(match),
      actualRating: match.rating,
      finalNarrative: segment.reconciliation.finalNarrative || segment.matchStory,
    },
  };
}

export function unlinkPlannedShow(show: PlannedShow): PlannedShow {
  return {
    ...show,
    status: "Completed",
    reconciliation: null,
    segments: show.segments.map((segment) => ({
      ...segment,
      workflowStatus: segment.workflowStatus === "Entered in TEW" ? "Entered in TEW" : "Completed",
      reconciliation: createEmptySegmentReconciliation(),
    })),
  };
}

export function finalizeReconciliation(show: PlannedShow): PlannedShow {
  if (!show.reconciliation) {
    return show;
  }
  const now = new Date().toISOString();
  return {
    ...show,
    status: "Reconciled",
    reconciliation: {
      ...show.reconciliation,
      completedAt: now,
    },
    segments: show.segments.map((segment) => ({
      ...segment,
      workflowStatus: "Reconciled",
      reconciliation: {
        ...segment.reconciliation,
        reconciledAt: now,
        finalNarrative:
          segment.reconciliation.finalNarrative ||
          (segment.type === "match" ? segment.matchStory : segment.segmentOutput),
        actualConsequences:
          segment.reconciliation.actualConsequences || segment.consequences,
        finalFollowUp: segment.reconciliation.finalFollowUp || segment.followUp,
      },
    })),
  };
}

export function reopenReconciliation(show: PlannedShow): PlannedShow {
  if (!show.reconciliation) {
    return show;
  }
  return {
    ...show,
    status: "Completed",
    reconciliation: { ...show.reconciliation, completedAt: "" },
    segments: show.segments.map((segment) => ({
      ...segment,
      workflowStatus: "Completed",
      reconciliation: { ...segment.reconciliation, reconciledAt: "" },
    })),
  };
}

export function reconciliationProgress(show: PlannedShow): { completed: number; total: number; percent: number } {
  const total = show.segments.length;
  const completed = show.segments.filter((segment) => segment.workflowStatus === "Reconciled").length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function sameCalendarDate(left: string, right: string): boolean {
  return dateOnly(left) === dateOnly(right);
}
