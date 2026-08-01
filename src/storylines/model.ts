import { createPlannerId } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type {
  ContinuityWarning,
  StorylineMilestone,
  StorylineReferenceOption,
  StorylineTimelineEntry,
  TrackerStoryline,
} from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseDate(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

export function createTrackerStoryline(sequence: number): TrackerStoryline {
  const timestamp = new Date().toISOString();
  return {
    id: createPlannerId(),
    name: `Untitled Storyline ${sequence}`,
    status: "Idea",
    startDate: today(),
    plannedEndDate: "",
    currentPhase: "Setup",
    linkedChampionship: "",
    premise: "",
    centralConflict: "",
    motivations: "",
    plannedBeginning: "",
    plannedClimax: "",
    plannedEnding: "",
    aftermath: "",
    privateNotes: "",
    participants: [],
    referenceLinks: [],
    milestones: [],
    knownSegmentIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createStorylineMilestone(sequence: number): StorylineMilestone {
  return {
    id: createPlannerId(),
    type: "Escalation",
    title: `Milestone ${sequence}`,
    targetDate: "",
    status: "Unassigned",
    assignedShowId: "",
    notes: "",
  };
}

export function touchStoryline(storyline: TrackerStoryline): TrackerStoryline {
  return { ...storyline, updatedAt: new Date().toISOString() };
}

export function duplicateTrackerStoryline(storyline: TrackerStoryline): TrackerStoryline {
  const timestamp = new Date().toISOString();
  return {
    ...storyline,
    id: createPlannerId(),
    name: `${storyline.name} Copy`,
    status: "Idea",
    participants: storyline.participants.map((participant) => ({
      ...participant,
      id: createPlannerId(),
    })),
    referenceLinks: storyline.referenceLinks.map((reference) => ({
      ...reference,
      id: createPlannerId(),
    })),
    milestones: storyline.milestones.map((milestone) => ({
      ...milestone,
      id: createPlannerId(),
      status: milestone.status === "Cancelled" ? "Cancelled" : "Unassigned",
      assignedShowId: "",
    })),
    knownSegmentIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function collectStorylineReferences(shows: PlannedShow[]): StorylineReferenceOption[] {
  const references = new Map<string, StorylineReferenceOption>();
  for (const show of shows) {
    for (const segment of show.segments) {
      for (const reference of segment.storylines) {
        const key = `${reference.source}:${reference.id}:${normalize(reference.name)}`;
        const existing = references.get(key);
        if (existing) {
          existing.usageCount += 1;
        } else {
          references.set(key, {
            key,
            source: reference.source,
            referenceId: reference.id,
            name: reference.name,
            usageCount: 1,
          });
        }
      }
    }
  }
  return [...references.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function segmentMatchesStoryline(
  segment: PlannedSegment,
  storyline: TrackerStoryline,
): boolean {
  const storylineName = normalize(storyline.name);
  return segment.storylines.some((reference) => {
    if (normalize(reference.name) === storylineName) {
      return true;
    }
    return storyline.referenceLinks.some(
      (link) =>
        link.source === reference.source &&
        (link.referenceId === reference.id || normalize(link.name) === normalize(reference.name)),
    );
  });
}

function actualSummary(segment: PlannedSegment): string {
  if (segment.type === "match" && segment.reconciliation.actualMatch) {
    const actual = segment.reconciliation.actualMatch;
    return [
      actual.winner ? `Winner: ${actual.winner}` : "",
      actual.matchTime ? `Time: ${actual.matchTime}` : "",
      actual.rating !== null ? `Rating: ${actual.rating}` : "",
      actual.notes,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (segment.type === "angle" && segment.reconciliation.actualRating !== null) {
    return `Angle rating: ${segment.reconciliation.actualRating}`;
  }
  return "";
}

export function buildStorylineTimeline(
  storyline: TrackerStoryline,
  shows: PlannedShow[],
): StorylineTimelineEntry[] {
  const entries: StorylineTimelineEntry[] = [];
  for (const show of shows) {
    show.segments.forEach((segment, index) => {
      if (!segmentMatchesStoryline(segment, storyline)) {
        return;
      }
      const plannedNarrative =
        segment.type === "match"
          ? segment.matchStory || segment.notes
          : segment.segmentOutput || segment.notes;
      const finalNarrative = segment.reconciliation.finalNarrative || plannedNarrative;
      entries.push({
        id: `${show.id}:${segment.id}`,
        showId: show.id,
        segmentId: segment.id,
        showName: show.name,
        showDate: show.reconciliation?.actualShow.date || show.date,
        showStatus: show.status,
        segmentTitle: segment.title,
        segmentType: segment.type,
        section: segment.section,
        workflowStatus: segment.workflowStatus,
        workerNames: segment.workers.map((worker) => worker.name),
        plannedNarrative,
        finalNarrative,
        actualSummary: actualSummary(segment),
        consequences:
          segment.reconciliation.actualConsequences || segment.consequences,
        followUp: segment.reconciliation.finalFollowUp || segment.followUp,
        rating:
          segment.type === "match"
            ? segment.reconciliation.actualMatch?.rating ?? null
            : segment.reconciliation.actualRating,
        reconciled:
          segment.workflowStatus === "Reconciled" ||
          Boolean(segment.reconciliation.reconciledAt),
      });
      void index;
    });
  }
  return entries.sort((a, b) => {
    const aDate = parseDate(a.showDate) ?? 0;
    const bDate = parseDate(b.showDate) ?? 0;
    if (aDate !== bDate) {
      return aDate - bDate;
    }
    return a.id.localeCompare(b.id);
  });
}

export function syncKnownSegmentIds(
  storyline: TrackerStoryline,
  timeline: StorylineTimelineEntry[],
): TrackerStoryline {
  const known = new Set(storyline.knownSegmentIds);
  let changed = false;
  for (const entry of timeline) {
    if (!known.has(entry.segmentId)) {
      known.add(entry.segmentId);
      changed = true;
    }
  }
  return changed ? { ...storyline, knownSegmentIds: [...known] } : storyline;
}

export function buildContinuityWarnings(
  storyline: TrackerStoryline,
  shows: PlannedShow[],
  timeline: StorylineTimelineEntry[],
  now = new Date(),
): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  const todayValue = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const futureFollowUp = timeline.some((entry) => Boolean(entry.followUp.trim())) ||
    storyline.milestones.some(
      (milestone) =>
        milestone.status !== "Completed" &&
        milestone.status !== "Cancelled" &&
        (!milestone.targetDate || (parseDate(milestone.targetDate) ?? 0) >= todayValue),
    );

  if (storyline.status === "Active" && !futureFollowUp) {
    warnings.push({
      id: "missing-follow-up",
      category: "Follow-up",
      message: "This active storyline has no recorded future follow-up or open milestone.",
    });
  }

  for (const milestone of storyline.milestones) {
    const target = parseDate(milestone.targetDate);
    if (
      target !== null &&
      target < todayValue &&
      milestone.status !== "Completed" &&
      milestone.status !== "Cancelled"
    ) {
      warnings.push({
        id: `late-${milestone.id}`,
        category: "Milestone",
        message: `${milestone.title || milestone.type} passed its target date without being completed.`,
      });
    }
  }

  const latestTimelineDate = timeline.reduce<number | null>((latest, entry) => {
    const value = parseDate(entry.showDate);
    if (value === null) {
      return latest;
    }
    return latest === null || value > latest ? value : latest;
  }, null);

  for (const participant of storyline.participants) {
    const appearances = timeline.filter((entry) =>
      entry.workerNames.some((name) => normalize(name) === normalize(participant.name)),
    );
    if (appearances.length === 0 && timeline.length > 0) {
      warnings.push({
        id: `missing-participant-${participant.id}`,
        category: "Participant",
        message: `${participant.name} is assigned to the storyline but has not appeared in its linked segments.`,
      });
      continue;
    }
    if (latestTimelineDate !== null && appearances.length > 0) {
      const lastAppearance = appearances.reduce<number>((latest, entry) => {
        const value = parseDate(entry.showDate) ?? 0;
        return Math.max(latest, value);
      }, 0);
      const days = Math.floor((latestTimelineDate - lastAppearance) / 86_400_000);
      if (days >= 28) {
        warnings.push({
          id: `stale-participant-${participant.id}`,
          category: "Participant",
          message: `${participant.name} has not appeared in this storyline for ${days} days of show history.`,
        });
      }
    }
  }

  if (storyline.status === "Completed" && !storyline.aftermath.trim()) {
    warnings.push({
      id: "missing-aftermath",
      category: "Aftermath",
      message: "This completed storyline has no aftermath recorded.",
    });
  }

  const currentIds = new Set(timeline.map((entry) => entry.segmentId));
  for (const segmentId of storyline.knownSegmentIds) {
    if (!currentIds.has(segmentId)) {
      warnings.push({
        id: `broken-${segmentId}`,
        category: "Broken Link",
        message: "A segment previously linked to this storyline no longer exists on its planned show.",
      });
    }
  }

  const payoffMilestones = storyline.milestones.filter(
    (milestone) => milestone.type === "Match" || milestone.type === "Climax",
  );
  if (
    storyline.status === "Completed" &&
    payoffMilestones.some(
      (milestone) => milestone.status !== "Completed" && milestone.status !== "Cancelled",
    )
  ) {
    warnings.push({
      id: "unfinished-payoff",
      category: "Payoff",
      message: "The storyline is marked completed while a payoff match or climax remains unfinished.",
    });
  }

  for (const milestone of storyline.milestones) {
    if (milestone.assignedShowId && !shows.some((show) => show.id === milestone.assignedShowId)) {
      warnings.push({
        id: `missing-show-${milestone.id}`,
        category: "Broken Link",
        message: `${milestone.title || milestone.type} is assigned to a show that has been deleted.`,
      });
    }
  }

  return warnings;
}
