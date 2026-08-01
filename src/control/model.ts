import { createPlannerId, createPlannedSegment, totalPlannedMinutes } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { TrackerStoryline } from "../storylines/types";
import type { WorkerProfile, WorkerUniverse } from "../workers/types";
import type {
  BookingIdea,
  BookingIdeaStatus,
  CalendarEntry,
  ControlSettings,
  ControlWarning,
  GlobalSearchResult,
  ShowReadinessSummary,
} from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateValue(value: string): number {
  const parsed = Date.parse(`${value}T12:00:00`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function includes(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

export function defaultControlSettings(): ControlSettings {
  return { dashboardWindowDays: 45, calendarFilter: "All", searchQuery: "" };
}

export function createBookingIdea(sequence: number): BookingIdea {
  const timestamp = new Date().toISOString();
  return {
    id: createPlannerId(),
    title: `Untitled Booking Idea ${sequence}`,
    type: "Angle",
    status: "Inbox",
    priority: "Normal",
    targetDate: "",
    targetShowId: "",
    workers: [],
    storylines: [],
    championship: "",
    concept: "",
    creativePurpose: "",
    plannedConsequences: "",
    followUp: "",
    privateNotes: "",
    scheduledSegmentId: "",
    completedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchBookingIdea(idea: BookingIdea): BookingIdea {
  return { ...idea, updatedAt: new Date().toISOString() };
}

export function nextIdeaStatus(status: BookingIdeaStatus): BookingIdeaStatus {
  if (status === "Inbox") return "Developing";
  if (status === "Developing") return "Ready";
  if (status === "Ready") return "Scheduled";
  if (status === "Scheduled") return "Completed";
  return status;
}

function segmentTypeForIdea(idea: BookingIdea): PlannedSegment["type"] {
  return idea.type === "Match" || idea.type === "Title Change" ? "match" : "angle";
}

export function convertIdeaToSegment(idea: BookingIdea): PlannedSegment {
  const type = segmentTypeForIdea(idea);
  const segment = createPlannedSegment(type);
  segment.title = idea.title || (type === "match" ? "Booking Idea Match" : "Booking Idea Angle");
  segment.notes = idea.concept;
  segment.purpose = idea.creativePurpose;
  segment.consequences = idea.plannedConsequences;
  segment.followUp = idea.followUp;
  segment.privateNotes = [idea.privateNotes, `Booking idea: ${idea.id}`].filter(Boolean).join("\n\n");
  segment.workers = idea.workers.map((worker) => ({
    id: worker.id || createPlannerId(),
    name: worker.name,
    role: worker.role,
    side: type === "match" ? worker.role : "",
    source: "manual",
  }));
  segment.storylines = idea.storylines.map((storyline) => ({
    id: storyline.id || createPlannerId(),
    name: storyline.name,
    source: "manual",
  }));
  segment.championship = idea.championship;
  if (type === "match") {
    segment.matchStory = idea.concept;
    segment.matchType = idea.type === "Title Change" ? "Championship Match" : segment.matchType;
  } else {
    segment.segmentOutput = idea.concept;
    segment.angleContentType = idea.type;
  }
  segment.bookingIdeaId = idea.id;
  return segment;
}

export function ideaIsScheduled(idea: BookingIdea, shows: PlannedShow[]): boolean {
  return Boolean(
    idea.scheduledSegmentId ||
      shows.some((show) => show.segments.some((segment) => segment.bookingIdeaId === idea.id)),
  );
}

export function scheduleIdea(
  idea: BookingIdea,
  shows: PlannedShow[],
): { shows: PlannedShow[]; idea: BookingIdea; segment: PlannedSegment } {
  if (!idea.targetShowId) throw new Error("Choose a target show before scheduling this idea.");
  if (ideaIsScheduled(idea, shows)) throw new Error("This booking idea is already scheduled.");
  const target = shows.find((show) => show.id === idea.targetShowId);
  if (!target) throw new Error("The target show no longer exists.");
  const segment = convertIdeaToSegment(idea);
  const nextShows = shows.map((show) =>
    show.id === target.id
      ? { ...show, updatedAt: new Date().toISOString(), segments: [...show.segments, segment] }
      : show,
  );
  return {
    shows: nextShows,
    segment,
    idea: touchBookingIdea({ ...idea, status: "Scheduled", scheduledSegmentId: segment.id }),
  };
}

export function buildShowReadiness(
  show: PlannedShow,
  ideas: BookingIdea[],
  storylines: TrackerStoryline[],
): ShowReadinessSummary {
  const issues: ShowReadinessSummary["issues"] = [];
  const bookedMinutes = totalPlannedMinutes(show);
  if (bookedMinutes > show.expectedMinutes) {
    issues.push({ id: `time-over-${show.id}`, category: "Time", message: `${bookedMinutes - show.expectedMinutes} minutes over the expected show length.` });
  } else if (bookedMinutes < Math.max(15, show.expectedMinutes - 20)) {
    issues.push({ id: `time-under-${show.id}`, category: "Time", message: `${show.expectedMinutes - bookedMinutes} expected minutes remain unbooked.` });
  }
  show.segments.forEach((segment) => {
    const narrative = segment.type === "match" ? segment.matchStory : segment.segmentOutput;
    if (!narrative.trim()) issues.push({ id: `narrative-${segment.id}`, category: "Narrative", message: `${segment.title} is missing its ${segment.type === "match" ? "Match Story" : "Segment Output"}.` });
    if (segment.workers.length === 0) issues.push({ id: `workers-${segment.id}`, category: "Worker", message: `${segment.title} has no assigned workers.` });
    if (segment.storylines.length === 0 && (segment.consequences.trim() || segment.followUp.trim())) issues.push({ id: `storyline-${segment.id}`, category: "Storyline", message: `${segment.title} promises storyline consequences but is not linked to a storyline.` });
  });
  ideas.filter((idea) => idea.targetShowId === show.id && !ideaIsScheduled(idea, [show]) && !["Cancelled", "Archived"].includes(idea.status)).forEach((idea) => {
    issues.push({ id: `idea-${idea.id}`, category: "Idea", message: `${idea.title} is assigned to this show but has not been added to the card.` });
  });
  storylines.forEach((storyline) => storyline.milestones.filter((milestone) => milestone.assignedShowId === show.id && milestone.status !== "Completed" && milestone.status !== "Cancelled").forEach((milestone) => {
    const represented = show.segments.some((segment) => segment.storylines.some((reference) => reference.name.toLowerCase() === storyline.name.toLowerCase()));
    if (!represented) issues.push({ id: `milestone-${milestone.id}`, category: "Milestone", message: `${storyline.name}: ${milestone.title} is assigned here but not represented on the card.` });
  }));
  const score = Math.max(0, 100 - issues.length * 9);
  return { score, bookedMinutes, expectedMinutes: show.expectedMinutes, issues };
}

export function buildCreativeCalendar(
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  workers: WorkerUniverse,
  ideas: BookingIdea[],
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  shows.forEach((show) => entries.push({ id: `show-${show.id}`, date: show.date, type: "Show", title: show.name, subtitle: `${show.status} · ${show.segments.length} segments`, showId: show.id, storylineId: "", workerId: "", ideaId: "", status: show.status }));
  storylines.forEach((storyline) => storyline.milestones.forEach((milestone) => {
    const show = shows.find((item) => item.id === milestone.assignedShowId);
    entries.push({ id: `milestone-${milestone.id}`, date: milestone.targetDate || show?.date || "", type: "Milestone", title: milestone.title, subtitle: storyline.name, showId: milestone.assignedShowId, storylineId: storyline.id, workerId: "", ideaId: "", status: milestone.status });
  }));
  workers.profiles.forEach((worker) => worker.arcs.forEach((arc) => entries.push({ id: `arc-${arc.id}`, date: arc.targetDate || shows.find((show) => show.id === arc.targetShowId)?.date || "", type: "Arc", title: arc.name, subtitle: worker.displayName, showId: arc.targetShowId, storylineId: arc.linkedStorylineId, workerId: worker.id, ideaId: "", status: arc.status })));
  ideas.forEach((idea) => entries.push({ id: `idea-${idea.id}`, date: idea.targetDate || shows.find((show) => show.id === idea.targetShowId)?.date || "", type: "Idea", title: idea.title, subtitle: `${idea.type} · ${idea.priority}`, showId: idea.targetShowId, storylineId: idea.storylines[0]?.id ?? "", workerId: idea.workers[0]?.id ?? "", ideaId: idea.id, status: idea.status }));
  return entries.sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.type.localeCompare(b.type));
}

function workerHasFutureBooking(profile: WorkerProfile, shows: PlannedShow[]): boolean {
  const now = dateValue(today());
  return shows.some((show) => dateValue(show.date) >= now && show.segments.some((segment) => segment.workers.some((worker) => worker.name.toLowerCase() === profile.displayName.toLowerCase())));
}

export function buildControlWarnings(
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  workers: WorkerUniverse,
  ideas: BookingIdea[],
): ControlWarning[] {
  const warnings: ControlWarning[] = [];
  storylines.filter((storyline) => storyline.status === "Active").forEach((storyline) => {
    const upcoming = shows.some((show) => dateValue(show.date) >= dateValue(today()) && show.segments.some((segment) => segment.storylines.some((reference) => reference.name.toLowerCase() === storyline.name.toLowerCase())));
    if (!upcoming) warnings.push({ id: `storyline-${storyline.id}`, category: "Storyline", message: `${storyline.name} is active but has no next scheduled segment.`, showId: "", storylineId: storyline.id, workerId: "", ideaId: "" });
  });
  workers.profiles.forEach((worker) => {
    if (!workerHasFutureBooking(worker, shows) && worker.arcs.some((arc) => arc.status === "Active")) warnings.push({ id: `worker-${worker.id}`, category: "Worker", message: `${worker.displayName} has an active character arc but no upcoming appearance.`, showId: "", storylineId: "", workerId: worker.id, ideaId: "" });
    worker.arcs.filter((arc) => ["Planned", "Active"].includes(arc.status) && !arc.targetDate && !arc.targetShowId && !arc.turningPoint.trim()).forEach((arc) => warnings.push({ id: `arc-${arc.id}`, category: "Arc", message: `${worker.displayName}: ${arc.name} has no scheduled next step.`, showId: arc.targetShowId, storylineId: arc.linkedStorylineId, workerId: worker.id, ideaId: "" }));
  });
  storylines.forEach((storyline) => storyline.milestones.filter((milestone) => milestone.assignedShowId && !shows.some((show) => show.id === milestone.assignedShowId)).forEach((milestone) => warnings.push({ id: `broken-milestone-${milestone.id}`, category: "Milestone", message: `${storyline.name}: ${milestone.title} is assigned to a deleted show.`, showId: milestone.assignedShowId, storylineId: storyline.id, workerId: "", ideaId: "" })));
  ideas.forEach((idea) => {
    if (idea.targetShowId && !shows.some((show) => show.id === idea.targetShowId)) warnings.push({ id: `idea-show-${idea.id}`, category: "Idea", message: `${idea.title} is assigned to a deleted show.`, showId: idea.targetShowId, storylineId: "", workerId: "", ideaId: idea.id });
    if (idea.status === "Completed" && !ideaIsScheduled(idea, shows)) warnings.push({ id: `idea-complete-${idea.id}`, category: "Idea", message: `${idea.title} is marked completed but is not linked to a show segment.`, showId: idea.targetShowId, storylineId: "", workerId: "", ideaId: idea.id });
    if (idea.type === "Title Change" && !idea.targetShowId) warnings.push({ id: `title-${idea.id}`, category: "Championship", message: `${idea.title} is a title-change idea without a scheduled title match.`, showId: "", storylineId: "", workerId: "", ideaId: idea.id });
  });
  return warnings;
}

export function globalSearch(
  query: string,
  shows: PlannedShow[],
  storylines: TrackerStoryline[],
  workers: WorkerUniverse,
  ideas: BookingIdea[],
): GlobalSearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const results: GlobalSearchResult[] = [];
  shows.forEach((show) => {
    if ([show.name, show.company, show.venue, show.notes].some((value) => includes(value, q))) results.push({ id: `show-${show.id}`, kind: "Show", title: show.name, detail: `${show.date} · ${show.status}`, showId: show.id, segmentId: "", storylineId: "", workerId: "", ideaId: "" });
    show.segments.forEach((segment) => {
      const text = [segment.title, segment.notes, segment.matchStory, segment.segmentOutput, segment.purpose, segment.consequences, segment.followUp, segment.workers.map((worker) => worker.name).join(" "), segment.storylines.map((storyline) => storyline.name).join(" ")].join(" ");
      if (includes(text, q)) results.push({ id: `segment-${segment.id}`, kind: "Segment", title: segment.title, detail: `${show.name} · ${segment.type}`, showId: show.id, segmentId: segment.id, storylineId: "", workerId: "", ideaId: segment.bookingIdeaId });
    });
  });
  storylines.forEach((storyline) => {
    const text = [storyline.name, storyline.premise, storyline.centralConflict, storyline.motivations, storyline.currentPhase, storyline.privateNotes].join(" ");
    if (includes(text, q)) results.push({ id: `storyline-${storyline.id}`, kind: "Storyline", title: storyline.name, detail: `${storyline.status} · ${storyline.currentPhase}`, showId: "", segmentId: "", storylineId: storyline.id, workerId: "", ideaId: "" });
    storyline.milestones.filter((milestone) => includes(`${milestone.title} ${milestone.notes}`, q)).forEach((milestone) => results.push({ id: `milestone-${milestone.id}`, kind: "Milestone", title: milestone.title, detail: storyline.name, showId: milestone.assignedShowId, segmentId: "", storylineId: storyline.id, workerId: "", ideaId: "" }));
  });
  workers.profiles.forEach((worker) => {
    if (includes([worker.displayName, worker.currentRole, worker.brand, worker.gimmickSummary, worker.currentMotivation, worker.longTermObjective, worker.creativeDirection, worker.privateNotes].join(" "), q)) results.push({ id: `worker-${worker.id}`, kind: "Worker", title: worker.displayName, detail: `${worker.alignment} · ${worker.currentRole}`, showId: "", segmentId: "", storylineId: "", workerId: worker.id, ideaId: "" });
    worker.arcs.filter((arc) => includes([arc.name, arc.startingSituation, arc.motivation, arc.internalConflict, arc.externalConflict, arc.turningPoint, arc.plannedResolution, arc.aftermath].join(" "), q)).forEach((arc) => results.push({ id: `arc-${arc.id}`, kind: "Arc", title: arc.name, detail: worker.displayName, showId: arc.targetShowId, segmentId: "", storylineId: arc.linkedStorylineId, workerId: worker.id, ideaId: "" }));
  });
  workers.relationships.filter((relationship) => includes([relationship.type, relationship.publicDescription, relationship.privateNotes, relationship.history].join(" "), q)).forEach((relationship) => {
    const a = workers.profiles.find((profile) => profile.id === relationship.workerAId)?.displayName ?? "Unknown";
    const b = workers.profiles.find((profile) => profile.id === relationship.workerBId)?.displayName ?? "Unknown";
    results.push({ id: `relationship-${relationship.id}`, kind: "Relationship", title: `${a} / ${b}`, detail: `${relationship.type} · ${relationship.status}`, showId: "", segmentId: "", storylineId: relationship.linkedStorylineId, workerId: relationship.workerAId, ideaId: "" });
  });
  ideas.filter((idea) => includes([idea.title, idea.type, idea.status, idea.concept, idea.creativePurpose, idea.plannedConsequences, idea.followUp, idea.privateNotes, idea.workers.map((worker) => worker.name).join(" "), idea.storylines.map((storyline) => storyline.name).join(" ")].join(" "), q)).forEach((idea) => results.push({ id: `idea-${idea.id}`, kind: "Booking Idea", title: idea.title, detail: `${idea.status} · ${idea.priority}`, showId: idea.targetShowId, segmentId: idea.scheduledSegmentId, storylineId: idea.storylines[0]?.id ?? "", workerId: idea.workers[0]?.id ?? "", ideaId: idea.id }));
  return results.slice(0, 100);
}
