import {
  applyTitleResult,
  buildTitleResultSuggestions,
  competitorNames,
  competitorsFromNames,
} from "../championships/model";
import type {
  Championship,
  ChampionshipUniverse,
  TitleResultDecision,
} from "../championships/types";
import type { BookingIdea, CreativeControlData } from "../control/types";
import {
  buildCompetitionStandings,
  recordCompetitionResult,
} from "../competitions/model";
import type {
  Competition,
  CompetitionResultType,
  CompetitionUniverse,
} from "../competitions/types";
import { createPlannedSegment, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow, ReconciliationPlanOutcome } from "../planner/types";
import {
  createContinuityDecision,
  upsertContinuityDecision,
} from "../schedule/model";
import type { PromotionScheduleUniverse } from "../schedule/types";
import type { TrackerStoryline } from "../storylines/types";
import type { WorkerArc, WorkerProfile, WorkerUniverse } from "../workers/types";
import type {
  ShowClosureReport,
  WrapUpArcDecision,
  WrapUpAuditKind,
  WrapUpAuditRecord,
  WrapUpBookingIdeaDecision,
  WrapUpChampionshipDecision,
  WrapUpCompetitionDecision,
  WrapUpFollowUpDecision,
  WrapUpMilestoneDecision,
  WrapUpPlanOutcome,
  WrapUpProgress,
  WrapUpSegmentReview,
  WrapUpSession,
  WrapUpSnapshotPayload,
  WrapUpUniverse,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function wrapUpId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function appendText(existing: string, addition: string): string {
  const clean = addition.trim();
  if (!clean) return existing;
  if (!existing.trim()) return clean;
  if (existing.includes(clean)) return existing;
  return `${existing.trim()}\n\n${clean}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reviewOutcomeFromSegment(segment: PlannedSegment): WrapUpPlanOutcome {
  const detail = segment.reconciliation.happenedAsPlannedDetail;
  if (detail && detail !== "Unresolved") return detail;
  if (segment.reconciliation.happenedAsPlanned === true) return "Yes";
  if (segment.reconciliation.happenedAsPlanned === false) return "No";
  return "Unresolved";
}

function booleanOutcome(value: WrapUpPlanOutcome): boolean | null {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

export function emptyWrapUpUniverse(): WrapUpUniverse {
  return { sessions: [], audits: [] };
}

export function createWrapUpSegmentReview(show: PlannedShow, segment: PlannedSegment): WrapUpSegmentReview {
  const timestamp = now();
  const finalNarrative = segment.reconciliation.finalNarrative
    || (segment.type === "match" ? segment.matchStory : segment.segmentOutput);
  return {
    id: wrapUpId("segment-review"),
    showId: show.id,
    segmentId: segment.id,
    segmentType: segment.type,
    status: "Pending",
    deliberatelyUnresolved: false,
    happenedAsPlanned: reviewOutcomeFromSegment(segment),
    actualAngleRating: segment.type === "angle" ? segment.reconciliation.actualRating : null,
    finalNarrative,
    changes: segment.reconciliation.changes,
    actualConsequences: segment.reconciliation.actualConsequences || segment.consequences,
    finalFollowUp: segment.reconciliation.finalFollowUp || segment.followUp,
    privateCorrectionNotes: "",
    sourceSnapshotFile: show.reconciliation?.actualShow.sourceFile ?? "",
    outputItemId: "",
    outputVersionId: "",
    reviewedAt: "",
    updatedAt: timestamp,
  };
}

export function createWrapUpSession(show: PlannedShow): WrapUpSession {
  const timestamp = now();
  return {
    id: wrapUpId("wrap-up-session"),
    showId: show.id,
    status: "Not Reviewed",
    segmentReviews: show.segments.map((segment) => createWrapUpSegmentReview(show, segment)),
    championshipDecisions: [],
    competitionDecisions: [],
    milestoneDecisions: [],
    bookingIdeaDecisions: [],
    arcDecisions: [],
    followUpDecisions: [],
    closureReports: [],
    auditIds: [],
    preWrapSnapshotJson: "",
    amendmentCount: 0,
    startedAt: "",
    updatedAt: timestamp,
    closedAt: "",
  };
}

export function wrapUpSessionForShow(show: PlannedShow, universe: WrapUpUniverse): WrapUpSession {
  return universe.sessions.find((session) => session.showId === show.id) ?? createWrapUpSession(show);
}

export function upsertWrapUpSession(universe: WrapUpUniverse, session: WrapUpSession): WrapUpUniverse {
  const updated = { ...session, updatedAt: now() };
  return {
    ...universe,
    sessions: universe.sessions.some((item) => item.showId === session.showId)
      ? universe.sessions.map((item) => item.showId === session.showId ? updated : item)
      : [updated, ...universe.sessions],
  };
}

export function capturePreWrapSnapshot(payload: WrapUpSnapshotPayload): string {
  return JSON.stringify(payload);
}

export function parsePreWrapSnapshot(value: string): WrapUpSnapshotPayload | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WrapUpSnapshotPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      shows: parsed.shows ?? [],
      championships: parsed.championships ?? { championships: [] },
      competitions: parsed.competitions ?? { competitions: [] },
      storylines: parsed.storylines ?? [],
      control: parsed.control ?? { ideas: [], settings: {} },
      workers: parsed.workers ?? { profiles: [], relationships: [] },
      promotionSchedule: parsed.promotionSchedule ?? {},
      outputLibrary: parsed.outputLibrary ?? {},
    };
  } catch {
    return null;
  }
}

export function beginWrapUpSession(session: WrapUpSession, preWrapSnapshotJson: string): WrapUpSession {
  if (session.status === "Closed") return session;
  const timestamp = now();
  return {
    ...session,
    status: session.status === "Amendment Open" ? "Amendment Open" : "In Progress",
    preWrapSnapshotJson: session.preWrapSnapshotJson || preWrapSnapshotJson,
    startedAt: session.startedAt || timestamp,
    updatedAt: timestamp,
  };
}

function championshipDecisionKey(championshipId: string, segmentId: string): string {
  return `${championshipId}:${segmentId}`;
}

function competitionDecisionKey(competitionId: string, fixtureId: string): string {
  return `${competitionId}:${fixtureId}`;
}

function milestoneDecisionKey(storylineId: string, milestoneId: string): string {
  return `${storylineId}:${milestoneId}`;
}

function arcDecisionKey(workerId: string, arcId: string): string {
  return `${workerId}:${arcId}`;
}

export function resolveCompetitionWinner(
  competition: Competition,
  actualWinner: string,
): { participantId: string; participantName: string; ambiguous: boolean } {
  const winner = normalize(actualWinner);
  if (!winner) return { participantId: "", participantName: "", ambiguous: false };
  const matches = competition.participants.filter((participant) => {
    if (normalize(participant.name) === winner) return true;
    return participant.memberNames.some((name) => normalize(name) === winner);
  });
  return {
    participantId: matches.length === 1 ? matches[0].id : "",
    participantName: matches.length === 1 ? matches[0].name : "",
    ambiguous: matches.length > 1,
  };
}

function resultTypeFromWinner(value: string): WrapUpCompetitionDecision["resultType"] {
  const winner = normalize(value);
  if (winner.includes("no contest") || winner === "nc") return "No Contest";
  if (winner.includes("draw")) return "Draw";
  return "Decision";
}

function defaultChampionshipDecision(
  show: PlannedShow,
  championship: Championship,
  segment: PlannedSegment,
): WrapUpChampionshipDecision | null {
  const suggestion = buildTitleResultSuggestions(championship, [show]).find((item) => item.segmentId === segment.id);
  if (!suggestion) return null;
  const timestamp = now();
  return {
    id: wrapUpId("championship-decision"),
    showId: show.id,
    segmentId: segment.id,
    championshipId: championship.id,
    championshipName: championship.name,
    championEntering: suggestion.championEntering,
    challenger: suggestion.challenger,
    actualWinner: suggestion.actualWinner,
    resolvedChampionNames: championship.division === "Singles" ? suggestion.actualWinner : "",
    suggestedDecision: suggestion.suggestedDecision || "Unresolved",
    decision: suggestion.suggestedDecision || "Unresolved",
    status: "Pending",
    preview: suggestion.reason,
    reason: "",
    auditId: "",
    appliedAt: "",
    updatedAt: timestamp,
  };
}

function defaultCompetitionDecision(
  show: PlannedShow,
  competition: Competition,
  segment: PlannedSegment,
): WrapUpCompetitionDecision | null {
  const fixture = competition.fixtures.find((item) => item.id === segment.competitionFixtureId);
  if (!fixture || ["Completed", "Bye", "Cancelled"].includes(fixture.status)) return null;
  const actualWinner = segment.reconciliation.actualMatch?.winner ?? "";
  const resolved = resolveCompetitionWinner(competition, actualWinner);
  const timestamp = now();
  return {
    id: wrapUpId("competition-decision"),
    showId: show.id,
    segmentId: segment.id,
    competitionId: competition.id,
    competitionName: competition.name,
    fixtureId: fixture.id,
    roundLabel: fixture.roundLabel,
    actualWinner,
    proposedWinnerParticipantId: resolved.participantId,
    proposedWinnerName: resolved.participantName,
    resultType: resultTypeFromWinner(actualWinner),
    status: "Pending",
    preview: resolved.ambiguous
      ? "The TEW winner matches more than one competition participant. Choose the participant manually."
      : resolved.participantId
        ? `${resolved.participantName} can be applied to ${fixture.roundLabel}.`
        : actualWinner
          ? "The TEW winner does not exactly match a competition participant. Choose the participant manually or defer."
          : "No winner is available from the reconciled TEW result.",
    reason: "",
    auditId: "",
    appliedAt: "",
    updatedAt: timestamp,
  };
}

function defaultMilestoneDecision(show: PlannedShow, storyline: TrackerStoryline, milestone: TrackerStoryline["milestones"][number]): WrapUpMilestoneDecision {
  const timestamp = now();
  return {
    id: wrapUpId("milestone-decision"),
    showId: show.id,
    storylineId: storyline.id,
    storylineName: storyline.name,
    milestoneId: milestone.id,
    milestoneTitle: milestone.title || milestone.type,
    decision: "Unchanged",
    targetShowId: milestone.assignedShowId,
    storylineStatus: "",
    currentPhase: storyline.currentPhase,
    aftermath: storyline.aftermath,
    note: milestone.notes,
    status: "Pending",
    auditId: "",
    appliedAt: "",
    updatedAt: timestamp,
  };
}

function defaultBookingIdeaDecision(show: PlannedShow, idea: BookingIdea): WrapUpBookingIdeaDecision {
  const timestamp = now();
  return {
    id: wrapUpId("idea-decision"),
    showId: show.id,
    ideaId: idea.id,
    ideaTitle: idea.title,
    decision: "Keep Active",
    targetShowId: idea.targetShowId,
    note: "",
    status: "Pending",
    auditId: "",
    appliedAt: "",
    updatedAt: timestamp,
  };
}

function defaultArcDecision(show: PlannedShow, worker: WorkerProfile, arc: WorkerArc): WrapUpArcDecision {
  const timestamp = now();
  return {
    id: wrapUpId("arc-decision"),
    showId: show.id,
    workerId: worker.id,
    workerName: worker.displayName,
    arcId: arc.id,
    arcName: arc.name,
    decision: "Keep Active",
    targetShowId: arc.targetShowId,
    progressNote: "",
    status: "Pending",
    auditId: "",
    appliedAt: "",
    updatedAt: timestamp,
  };
}

export function followUpObligationKey(segment: PlannedSegment, followUp: string): string {
  return `follow-up:${segment.id}:${normalize(followUp)}`;
}

function defaultFollowUpDecision(show: PlannedShow, segment: PlannedSegment): WrapUpFollowUpDecision | null {
  const finalFollowUp = segment.reconciliation.finalFollowUp || segment.followUp;
  if (!finalFollowUp.trim()) return null;
  const timestamp = now();
  return {
    id: wrapUpId("follow-up-decision"),
    showId: show.id,
    sourceSegmentId: segment.id,
    sourceSegmentTitle: segment.title,
    plannedFollowUp: segment.followUp,
    finalFollowUp,
    destination: "Left Open",
    targetShowId: "",
    targetSegmentId: "",
    obligationKey: followUpObligationKey(segment, finalFollowUp),
    reason: "",
    status: "Pending",
    auditId: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function synchronizeWrapUpSession(input: {
  session: WrapUpSession;
  show: PlannedShow;
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
  storylines: TrackerStoryline[];
  control: CreativeControlData;
  workers: WorkerUniverse;
}): WrapUpSession {
  const { show } = input;
  const allowNewConsequences = input.session.status !== "Closed";
  const reviews = show.segments.map((segment) => input.session.segmentReviews.find((review) => review.segmentId === segment.id) ?? createWrapUpSegmentReview(show, segment));
  if (!allowNewConsequences) return { ...input.session, segmentReviews: reviews, updatedAt: now() };

  const championshipExisting = new Map(input.session.championshipDecisions.map((decision) => [championshipDecisionKey(decision.championshipId, decision.segmentId), decision]));
  const championshipDecisions = [...input.session.championshipDecisions];
  for (const championship of input.championships.championships) {
    for (const segment of show.segments.filter((item) => item.type === "match" && !item.titleResultConfirmedAt)) {
      const decision = defaultChampionshipDecision(show, championship, segment);
      if (!decision) continue;
      const key = championshipDecisionKey(decision.championshipId, decision.segmentId);
      if (!championshipExisting.has(key)) {
        championshipDecisions.push(decision);
        championshipExisting.set(key, decision);
      }
    }
  }

  const competitionExisting = new Map(input.session.competitionDecisions.map((decision) => [competitionDecisionKey(decision.competitionId, decision.fixtureId), decision]));
  const competitionDecisions = [...input.session.competitionDecisions];
  for (const segment of show.segments.filter((item) => item.type === "match" && item.competitionId && item.competitionFixtureId)) {
    const competition = input.competitions.competitions.find((item) => item.id === segment.competitionId);
    if (!competition) continue;
    const decision = defaultCompetitionDecision(show, competition, segment);
    if (!decision) continue;
    const key = competitionDecisionKey(decision.competitionId, decision.fixtureId);
    if (!competitionExisting.has(key)) {
      competitionDecisions.push(decision);
      competitionExisting.set(key, decision);
    }
  }

  const milestoneExisting = new Map(input.session.milestoneDecisions.map((decision) => [milestoneDecisionKey(decision.storylineId, decision.milestoneId), decision]));
  const milestoneDecisions = [...input.session.milestoneDecisions];
  input.storylines.forEach((storyline) => storyline.milestones
    .filter((milestone) => milestone.assignedShowId === show.id && !["Completed", "Cancelled"].includes(milestone.status))
    .forEach((milestone) => {
      const key = milestoneDecisionKey(storyline.id, milestone.id);
      if (!milestoneExisting.has(key)) {
        const decision = defaultMilestoneDecision(show, storyline, milestone);
        milestoneDecisions.push(decision);
        milestoneExisting.set(key, decision);
      }
    }));

  const showSegmentIds = new Set(show.segments.map((segment) => segment.id));
  const ideaExisting = new Map(input.session.bookingIdeaDecisions.map((decision) => [decision.ideaId, decision]));
  const bookingIdeaDecisions = [...input.session.bookingIdeaDecisions];
  input.control.ideas
    .filter((idea) => idea.targetShowId === show.id || (idea.scheduledSegmentId && showSegmentIds.has(idea.scheduledSegmentId)) || show.segments.some((segment) => segment.bookingIdeaId === idea.id))
    .filter((idea) => !["Completed", "Archived", "Cancelled"].includes(idea.status))
    .forEach((idea) => {
      if (!ideaExisting.has(idea.id)) {
        const decision = defaultBookingIdeaDecision(show, idea);
        bookingIdeaDecisions.push(decision);
        ideaExisting.set(idea.id, decision);
      }
    });

  const arcExisting = new Map(input.session.arcDecisions.map((decision) => [arcDecisionKey(decision.workerId, decision.arcId), decision]));
  const arcDecisions = [...input.session.arcDecisions];
  input.workers.profiles.forEach((worker) => worker.arcs
    .filter((arc) => arc.targetShowId === show.id && !["Completed", "Abandoned"].includes(arc.status))
    .forEach((arc) => {
      const key = arcDecisionKey(worker.id, arc.id);
      if (!arcExisting.has(key)) {
        const decision = defaultArcDecision(show, worker, arc);
        arcDecisions.push(decision);
        arcExisting.set(key, decision);
      }
    }));

  const followUpExisting = new Map(input.session.followUpDecisions.map((decision) => [decision.sourceSegmentId, decision]));
  const followUpDecisions = [...input.session.followUpDecisions];
  show.segments.forEach((segment) => {
    const decision = defaultFollowUpDecision(show, segment);
    if (decision && !followUpExisting.has(segment.id)) {
      followUpDecisions.push(decision);
      followUpExisting.set(segment.id, decision);
    }
  });

  return {
    ...input.session,
    segmentReviews: reviews,
    championshipDecisions,
    competitionDecisions,
    milestoneDecisions,
    bookingIdeaDecisions,
    arcDecisions,
    followUpDecisions,
    updatedAt: now(),
  };
}

export function applySegmentReview(show: PlannedShow, review: WrapUpSegmentReview): { show: PlannedShow; review: WrapUpSegmentReview } {
  const segment = show.segments.find((item) => item.id === review.segmentId);
  if (!segment) throw new Error("The segment linked to this wrap-up review no longer exists.");
  if (segment.type === "match" && !segment.reconciliation.actualMatch && !review.deliberatelyUnresolved) {
    throw new Error("Link the actual TEW match or mark the match deliberately unresolved before reviewing it.");
  }
  if (!review.finalNarrative.trim()) throw new Error("Record the final Match Story or Angle Output before completing the review.");
  const timestamp = now();
  const outcome = review.happenedAsPlanned as ReconciliationPlanOutcome;
  const updatedSegment: PlannedSegment = {
    ...segment,
    workflowStatus: "Reconciled",
    reconciliation: {
      ...segment.reconciliation,
      happenedAsPlanned: booleanOutcome(review.happenedAsPlanned),
      happenedAsPlannedDetail: outcome,
      actualRating: segment.type === "angle" ? review.actualAngleRating : segment.reconciliation.actualRating,
      finalNarrative: review.finalNarrative,
      changes: review.changes,
      actualConsequences: review.actualConsequences,
      finalFollowUp: review.finalFollowUp,
      reconciledAt: timestamp,
    },
  };
  const updatedShow = touchShow({
    ...show,
    segments: show.segments.map((item) => item.id === updatedSegment.id ? updatedSegment : item),
  });
  return {
    show: updatedShow,
    review: { ...review, status: "Reviewed", reviewedAt: timestamp, updatedAt: timestamp },
  };
}

function resolvedChampionCount(value: string): number {
  return value.split(/\s*(?:&|,|\/| and )\s*/i).map((item) => item.trim()).filter(Boolean).length;
}

export function previewChampionshipDecision(input: {
  championship: Championship;
  show: PlannedShow;
  segment: PlannedSegment;
  decision: WrapUpChampionshipDecision;
  knownWorkers?: Array<{ id: string; name: string }>;
}): { blocked: boolean; message: string; championship: Championship; show: PlannedShow } {
  const { championship, show, segment, decision } = input;
  if (decision.decision === "Deferred" || decision.decision === "Unresolved") {
    return { blocked: false, message: `${decision.decision} records no championship-lineage change.`, championship, show };
  }
  if (!segment.reconciliation.actualMatch && decision.decision !== "Vacated") {
    return { blocked: true, message: "A confirmed TEW match result is required before changing championship lineage.", championship, show };
  }
  let workingSegment = clone(segment);
  if (decision.decision === "Changed Hands") {
    const resolved = decision.resolvedChampionNames.trim() || decision.actualWinner.trim();
    if (!resolved) return { blocked: true, message: "Identify the new champion or champions before confirming a title change.", championship, show };
    const minimum = championship.division === "Tag Team" ? 2 : championship.division === "Trios" ? 3 : 1;
    if (resolvedChampionCount(resolved) < minimum) {
      return { blocked: true, message: `${championship.division} title changes require at least ${minimum} resolved champion name${minimum === 1 ? "" : "s"}.`, championship, show };
    }
    if (!workingSegment.reconciliation.actualMatch) return { blocked: true, message: "The reconciled match does not contain a winner.", championship, show };
    workingSegment = {
      ...workingSegment,
      reconciliation: {
        ...workingSegment.reconciliation,
        actualMatch: { ...workingSegment.reconciliation.actualMatch, winner: resolved },
      },
    };
  }
  const result = applyTitleResult(championship, show, workingSegment, decision.decision as TitleResultDecision, input.knownWorkers ?? []);
  const beforeChampions = competitorNames(championship.currentChampions) || "Vacant";
  const afterChampions = competitorNames(result.championship.currentChampions) || "Vacant";
  const message = decision.decision === "Retained"
    ? `${beforeChampions} remains champion. Defenses change from ${championship.defenses} to ${result.championship.defenses}.`
    : decision.decision === "Changed Hands"
      ? `${beforeChampions} → ${afterChampions}. A new reign begins from ${show.reconciliation?.actualShow.date || show.date}.`
      : `${championship.name} becomes vacant and the active reign is closed.`;
  return { blocked: false, message, championship: result.championship, show: result.show };
}

export function applyChampionshipConsequence(input: {
  universe: ChampionshipUniverse;
  show: PlannedShow;
  decision: WrapUpChampionshipDecision;
  knownWorkers?: Array<{ id: string; name: string }>;
}): { universe: ChampionshipUniverse; show: PlannedShow; decision: WrapUpChampionshipDecision; previousState: unknown; nextState: unknown } {
  const championship = input.universe.championships.find((item) => item.id === input.decision.championshipId);
  const segment = input.show.segments.find((item) => item.id === input.decision.segmentId);
  if (!championship || !segment) throw new Error("The championship or source match no longer exists.");
  const previousState = { championship: clone(championship), show: clone(input.show) };
  if (input.decision.decision === "Deferred" || input.decision.decision === "Unresolved") {
    const updatedDecision = {
      ...input.decision,
      status: input.decision.decision === "Deferred" ? "Deferred" as const : "Confirmed" as const,
      preview: `${input.decision.decision} records no championship-lineage change.`,
      appliedAt: now(),
      updatedAt: now(),
    };
    return { universe: input.universe, show: input.show, decision: updatedDecision, previousState, nextState: previousState };
  }
  const preview = previewChampionshipDecision({ championship, show: input.show, segment, decision: input.decision, knownWorkers: input.knownWorkers });
  if (preview.blocked) throw new Error(preview.message);
  const updatedDecision = {
    ...input.decision,
    status: "Confirmed" as const,
    preview: preview.message,
    appliedAt: now(),
    updatedAt: now(),
  };
  const universe = {
    ...input.universe,
    championships: input.universe.championships.map((item) => item.id === championship.id ? preview.championship : item),
  };
  return {
    universe,
    show: preview.show,
    decision: updatedDecision,
    previousState,
    nextState: { championship: clone(preview.championship), show: clone(preview.show) },
  };
}

export function previewCompetitionDecision(input: {
  competition: Competition;
  decision: WrapUpCompetitionDecision;
}): { blocked: boolean; message: string; competition: Competition } {
  const fixture = input.competition.fixtures.find((item) => item.id === input.decision.fixtureId);
  if (!fixture) return { blocked: true, message: "The linked competition fixture no longer exists.", competition: input.competition };
  if (input.decision.resultType === "Deferred") return { blocked: false, message: "Competition advancement is deferred.", competition: input.competition };
  const resultType = input.decision.resultType as CompetitionResultType;
  if (resultType === "Decision" && !input.decision.proposedWinnerParticipantId) {
    return { blocked: true, message: "Choose the competition participant that matches the actual TEW winner.", competition: input.competition };
  }
  if (input.competition.format === "Single Elimination" && resultType === "Draw") {
    return { blocked: true, message: "A single-elimination fixture cannot advance from a draw. Resolve or defer the result.", competition: input.competition };
  }
  const beforeStandings = buildCompetitionStandings(input.competition);
  const next = recordCompetitionResult(
    input.competition,
    fixture.id,
    resultType,
    resultType === "Decision" ? input.decision.proposedWinnerParticipantId : "",
    fixture.scoreText,
  );
  if (next === input.competition || JSON.stringify(next) === JSON.stringify(input.competition)) {
    return { blocked: true, message: "The proposed result did not pass the competition validation rules.", competition: input.competition };
  }
  if (input.competition.format === "Single Elimination") {
    const nextFixture = next.fixtures.find((item) => item.sourceFixtureAId === fixture.id || item.sourceFixtureBId === fixture.id);
    const winner = next.participants.find((participant) => participant.id === input.decision.proposedWinnerParticipantId)?.name || input.decision.proposedWinnerName;
    return {
      blocked: false,
      message: resultType === "Decision"
        ? `${winner || "The confirmed winner"} completes ${fixture.roundLabel}${nextFixture ? ` and advances into ${nextFixture.roundLabel}` : ""}.`
        : `${fixture.roundLabel} is recorded as ${resultType}; no winner is guessed.`,
      competition: next,
    };
  }
  const afterStandings = buildCompetitionStandings(next);
  const changed = afterStandings.map((standing) => {
    const before = beforeStandings.find((item) => item.participantId === standing.participantId);
    return `${standing.rank}. ${standing.participantName}: ${before?.points ?? 0} → ${standing.points} points (${standing.wins}-${standing.draws}-${standing.losses})`;
  });
  return { blocked: false, message: changed.join("\n"), competition: next };
}

export function applyCompetitionConsequence(input: {
  universe: CompetitionUniverse;
  decision: WrapUpCompetitionDecision;
}): { universe: CompetitionUniverse; decision: WrapUpCompetitionDecision; previousState: unknown; nextState: unknown } {
  const competition = input.universe.competitions.find((item) => item.id === input.decision.competitionId);
  if (!competition) throw new Error("The competition linked to this decision no longer exists.");
  const previousState = clone(competition);
  if (input.decision.resultType === "Deferred") {
    const decision = { ...input.decision, status: "Deferred" as const, preview: "Competition advancement is deferred.", appliedAt: now(), updatedAt: now() };
    return { universe: input.universe, decision, previousState, nextState: previousState };
  }
  const preview = previewCompetitionDecision({ competition, decision: input.decision });
  if (preview.blocked) throw new Error(preview.message);
  const decision = { ...input.decision, status: "Confirmed" as const, preview: preview.message, appliedAt: now(), updatedAt: now() };
  return {
    universe: { ...input.universe, competitions: input.universe.competitions.map((item) => item.id === competition.id ? preview.competition : item) },
    decision,
    previousState,
    nextState: clone(preview.competition),
  };
}

export function applyMilestoneConsequence(input: {
  storylines: TrackerStoryline[];
  decision: WrapUpMilestoneDecision;
}): { storylines: TrackerStoryline[]; decision: WrapUpMilestoneDecision; previousState: unknown; nextState: unknown } {
  const storyline = input.storylines.find((item) => item.id === input.decision.storylineId);
  if (!storyline) throw new Error("The storyline linked to this milestone no longer exists.");
  const milestone = storyline.milestones.find((item) => item.id === input.decision.milestoneId);
  if (!milestone) throw new Error("The storyline milestone no longer exists.");
  const previousState = clone(storyline);
  let updatedMilestone = { ...milestone };
  if (input.decision.decision === "Completed") updatedMilestone = { ...updatedMilestone, status: "Completed" };
  if (input.decision.decision === "Delayed") updatedMilestone = { ...updatedMilestone, status: "Delayed", assignedShowId: input.decision.targetShowId || milestone.assignedShowId };
  if (input.decision.decision === "Cancelled") updatedMilestone = { ...updatedMilestone, status: "Cancelled" };
  if (input.decision.decision === "Reassigned") {
    if (!input.decision.targetShowId) throw new Error("Choose the show receiving the reassigned milestone.");
    updatedMilestone = { ...updatedMilestone, status: "Assigned", assignedShowId: input.decision.targetShowId };
  }
  const nextStoryline: TrackerStoryline = {
    ...storyline,
    status: input.decision.storylineStatus || storyline.status,
    currentPhase: input.decision.currentPhase || storyline.currentPhase,
    aftermath: input.decision.aftermath || storyline.aftermath,
    privateNotes: appendText(storyline.privateNotes, input.decision.note ? `Wrap-up note: ${input.decision.note}` : ""),
    milestones: storyline.milestones.map((item) => item.id === milestone.id ? { ...updatedMilestone, notes: appendText(updatedMilestone.notes, input.decision.note) } : item),
    updatedAt: now(),
  };
  const decision = { ...input.decision, status: "Confirmed" as const, appliedAt: now(), updatedAt: now() };
  return {
    storylines: input.storylines.map((item) => item.id === storyline.id ? nextStoryline : item),
    decision,
    previousState,
    nextState: clone(nextStoryline),
  };
}

export function applyBookingIdeaConsequence(input: {
  control: CreativeControlData;
  decision: WrapUpBookingIdeaDecision;
}): { control: CreativeControlData; decision: WrapUpBookingIdeaDecision; previousState: unknown; nextState: unknown } {
  const idea = input.control.ideas.find((item) => item.id === input.decision.ideaId);
  if (!idea) throw new Error("The booking idea linked to this wrap-up no longer exists.");
  const previousState = clone(idea);
  let updated: BookingIdea = { ...idea };
  if (input.decision.decision === "Completed") updated = { ...updated, status: "Completed", completedAt: now() };
  if (input.decision.decision === "Delayed") updated = { ...updated, status: "Delayed", targetShowId: input.decision.targetShowId || idea.targetShowId };
  if (input.decision.decision === "Reassigned") {
    if (!input.decision.targetShowId) throw new Error("Choose the later show receiving this booking idea.");
    updated = { ...updated, status: "Ready", targetShowId: input.decision.targetShowId, scheduledSegmentId: "" };
  }
  if (input.decision.decision === "Archived") updated = { ...updated, status: "Archived" };
  if (input.decision.decision === "Keep Active") updated = { ...updated, status: ["Inbox", "Developing", "Ready", "Scheduled"].includes(idea.status) ? idea.status : "Ready" };
  updated = { ...updated, privateNotes: appendText(updated.privateNotes, input.decision.note ? `Wrap-up note: ${input.decision.note}` : ""), updatedAt: now() };
  const decision = { ...input.decision, status: "Confirmed" as const, appliedAt: now(), updatedAt: now() };
  return {
    control: { ...input.control, ideas: input.control.ideas.map((item) => item.id === idea.id ? updated : item) },
    decision,
    previousState,
    nextState: clone(updated),
  };
}

export function applyArcConsequence(input: {
  workers: WorkerUniverse;
  decision: WrapUpArcDecision;
}): { workers: WorkerUniverse; decision: WrapUpArcDecision; previousState: unknown; nextState: unknown } {
  const worker = input.workers.profiles.find((item) => item.id === input.decision.workerId);
  const arc = worker?.arcs.find((item) => item.id === input.decision.arcId);
  if (!worker || !arc) throw new Error("The worker or character arc linked to this wrap-up no longer exists.");
  if (["Progress", "Turning Point", "Resolution"].includes(input.decision.decision) && !input.decision.progressNote.trim()) {
    throw new Error("Record what occurred before advancing a character arc.");
  }
  const previousState = clone(worker);
  let updatedArc: WorkerArc = { ...arc };
  const datedNote = input.decision.progressNote ? `${new Date().toISOString().slice(0, 10)}: ${input.decision.progressNote}` : "";
  if (input.decision.decision === "Progress") updatedArc = { ...updatedArc, status: "Active", aftermath: appendText(updatedArc.aftermath, datedNote) };
  if (input.decision.decision === "Turning Point") updatedArc = { ...updatedArc, status: "Active", turningPoint: appendText(updatedArc.turningPoint, datedNote) };
  if (input.decision.decision === "Resolution") updatedArc = { ...updatedArc, status: "Completed", aftermath: appendText(updatedArc.aftermath, datedNote), targetShowId: "", targetDate: "" };
  if (input.decision.decision === "Delayed") updatedArc = { ...updatedArc, status: "Paused", targetShowId: input.decision.targetShowId || updatedArc.targetShowId };
  if (input.decision.decision === "Keep Active") updatedArc = { ...updatedArc, status: "Active" };
  updatedArc = { ...updatedArc, updatedAt: now() };
  const nextWorker: WorkerProfile = { ...worker, arcs: worker.arcs.map((item) => item.id === arc.id ? updatedArc : item), updatedAt: now() };
  const decision = { ...input.decision, status: "Confirmed" as const, appliedAt: now(), updatedAt: now() };
  return {
    workers: { ...input.workers, profiles: input.workers.profiles.map((item) => item.id === worker.id ? nextWorker : item) },
    decision,
    previousState,
    nextState: clone(nextWorker),
  };
}

function sourceReferences(segment: PlannedSegment) {
  return {
    storylines: segment.storylines.map((item) => ({ ...item })),
    championship: segment.championship,
    championshipId: segment.championshipId,
    competitionId: segment.competitionId,
    competitionFixtureId: segment.competitionFixtureId,
    competitionRoundLabel: segment.competitionRoundLabel,
  };
}

function createFollowUpSegment(source: PlannedSegment, followUp: string, type: "match" | "angle"): PlannedSegment {
  const segment = createPlannedSegment(type);
  return {
    ...segment,
    ...sourceReferences(source),
    title: `Follow up: ${source.title}`,
    notes: followUp,
    purpose: followUp,
    privateNotes: `Post-show rollforward from ${source.title} (${source.id}).\nNo wrestlers, winner, finish, dialogue, or new creative development was invented.`,
    championship: type === "match" ? source.championship : "",
    championshipId: type === "match" ? source.championshipId : "",
    competitionId: type === "match" ? source.competitionId : "",
    competitionFixtureId: type === "match" ? source.competitionFixtureId : "",
    competitionRoundLabel: type === "match" ? source.competitionRoundLabel : "",
  };
}

export function applyFollowUpConsequence(input: {
  shows: PlannedShow[];
  schedule: PromotionScheduleUniverse;
  sourceShow: PlannedShow;
  decision: WrapUpFollowUpDecision;
}): { shows: PlannedShow[]; schedule: PromotionScheduleUniverse; decision: WrapUpFollowUpDecision; previousState: unknown; nextState: unknown } {
  const sourceSegment = input.sourceShow.segments.find((item) => item.id === input.decision.sourceSegmentId);
  if (!sourceSegment) throw new Error("The source segment for this follow-up no longer exists.");
  const followUp = input.decision.finalFollowUp.trim() || input.decision.plannedFollowUp.trim();
  if (!followUp && input.decision.destination !== "Dismissed") throw new Error("Record a final follow-up or dismiss the item with a reason.");
  const previousState = { shows: clone(input.shows), schedule: clone(input.schedule) };
  let shows = input.shows;
  let schedule = input.schedule;
  let targetSegmentId = input.decision.targetSegmentId;
  let status: WrapUpFollowUpDecision["status"] = "Confirmed";

  if (input.decision.destination === "New Match" || input.decision.destination === "New Angle") {
    const targetShow = shows.find((show) => show.id === input.decision.targetShowId);
    if (!targetShow) throw new Error("Choose the scheduled show receiving the follow-up.");
    const segment = createFollowUpSegment(sourceSegment, followUp, input.decision.destination === "New Match" ? "match" : "angle");
    targetSegmentId = segment.id;
    shows = shows.map((show) => show.id === targetShow.id ? touchShow({ ...show, segments: [...show.segments, segment] }) : show);
    schedule = upsertContinuityDecision(schedule, createContinuityDecision(
      input.decision.obligationKey,
      input.sourceShow.id,
      input.decision.destination === "New Match" ? "Added as Match" : "Added as Angle",
      targetShow.id,
      segment.id,
      input.decision.reason,
    ));
  } else if (input.decision.destination === "Existing Segment") {
    const targetShow = shows.find((show) => show.id === input.decision.targetShowId);
    const target = targetShow?.segments.find((segment) => segment.id === input.decision.targetSegmentId);
    if (!targetShow || !target) throw new Error("Choose the existing segment receiving the follow-up.");
    const updatedTarget: PlannedSegment = {
      ...target,
      notes: appendText(target.notes, followUp),
      privateNotes: appendText(target.privateNotes, `Post-show rollforward from ${sourceSegment.title} (${sourceSegment.id}).`),
      storylines: sourceSegment.storylines.reduce((items, storyline) => items.some((item) => item.id === storyline.id) ? items : [...items, { ...storyline }], [...target.storylines]),
    };
    shows = shows.map((show) => show.id === targetShow.id ? touchShow({ ...show, segments: show.segments.map((segment) => segment.id === target.id ? updatedTarget : segment) }) : show);
    schedule = upsertContinuityDecision(schedule, createContinuityDecision(input.decision.obligationKey, input.sourceShow.id, "Attached to Segment", targetShow.id, target.id, input.decision.reason));
  } else if (input.decision.destination === "Promotion Calendar Inbox") {
    if (input.decision.targetShowId) {
      schedule = upsertContinuityDecision(schedule, createContinuityDecision(input.decision.obligationKey, input.sourceShow.id, "Deferred", input.decision.targetShowId, "", input.decision.reason));
    }
  } else if (input.decision.destination === "Dismissed") {
    if (!input.decision.reason.trim()) throw new Error("Record why this follow-up is being dismissed.");
    schedule = upsertContinuityDecision(schedule, createContinuityDecision(input.decision.obligationKey, input.sourceShow.id, "Dismissed", "", "", input.decision.reason));
  } else if (input.decision.destination === "Left Open") {
    status = "Confirmed";
  }

  const decision = { ...input.decision, targetSegmentId, status, updatedAt: now() };
  return {
    shows,
    schedule,
    decision,
    previousState,
    nextState: { shows: clone(shows), schedule: clone(schedule) },
  };
}

export function createWrapUpAudit(input: {
  session: WrapUpSession;
  kind: WrapUpAuditKind;
  segmentId?: string;
  entityId?: string;
  action: string;
  reason?: string;
  previousState: unknown;
  nextState: unknown;
  amendmentOfAuditId?: string;
}): WrapUpAuditRecord {
  return {
    id: wrapUpId("wrap-up-audit"),
    sessionId: input.session.id,
    showId: input.session.showId,
    segmentId: input.segmentId ?? "",
    kind: input.kind,
    entityId: input.entityId ?? "",
    action: input.action,
    reason: input.reason ?? "",
    previousStateJson: JSON.stringify(input.previousState),
    nextStateJson: JSON.stringify(input.nextState),
    amendmentOfAuditId: input.amendmentOfAuditId ?? "",
    createdAt: now(),
    reversedAt: "",
  };
}

export function appendWrapUpAudit(universe: WrapUpUniverse, session: WrapUpSession, audit: WrapUpAuditRecord): { universe: WrapUpUniverse; session: WrapUpSession } {
  const nextSession = { ...session, auditIds: [audit.id, ...session.auditIds], updatedAt: now() };
  return {
    session: nextSession,
    universe: {
      sessions: universe.sessions.some((item) => item.showId === session.showId)
        ? universe.sessions.map((item) => item.showId === session.showId ? nextSession : item)
        : [nextSession, ...universe.sessions],
      audits: [audit, ...universe.audits].slice(0, 1000),
    },
  };
}

export function reverseWrapUpAudit(universe: WrapUpUniverse, auditId: string): WrapUpUniverse {
  return {
    ...universe,
    audits: universe.audits.map((audit) => audit.id === auditId ? { ...audit, reversedAt: now() } : audit),
  };
}

export function buildWrapUpProgress(session: WrapUpSession, show: PlannedShow): WrapUpProgress {
  const segmentReviewsComplete = session.segmentReviews.filter((review) => review.status === "Reviewed").length;
  const outputCheckpointsComplete = session.segmentReviews.filter((review) => Boolean(review.outputVersionId)).length;
  const championshipPending = session.championshipDecisions.filter((decision) => decision.status === "Pending").length;
  const competitionPending = session.competitionDecisions.filter((decision) => decision.status === "Pending").length;
  const milestonePending = session.milestoneDecisions.filter((decision) => decision.status === "Pending").length;
  const bookingIdeaPending = session.bookingIdeaDecisions.filter((decision) => decision.status === "Pending").length;
  const arcPending = session.arcDecisions.filter((decision) => decision.status === "Pending").length;
  const followUpPending = session.followUpDecisions.filter((decision) => decision.status === "Pending").length;
  const unresolvedMatchResults = show.segments.filter((segment) => segment.type === "match" && !segment.reconciliation.actualMatch && !session.segmentReviews.find((review) => review.segmentId === segment.id)?.deliberatelyUnresolved).length;
  const pendingDecisions = championshipPending + competitionPending + milestonePending + bookingIdeaPending + arcPending + followUpPending;
  const canClose = session.segmentReviews.length === show.segments.length
    && segmentReviewsComplete === show.segments.length
    && outputCheckpointsComplete === show.segments.length
    && unresolvedMatchResults === 0
    && pendingDecisions === 0;
  return {
    showId: show.id,
    status: session.status,
    segmentReviewsComplete,
    segmentReviewsTotal: show.segments.length,
    outputCheckpointsComplete,
    outputCheckpointsTotal: show.segments.length,
    championshipPending,
    competitionPending,
    milestonePending,
    bookingIdeaPending,
    arcPending,
    followUpPending,
    unresolvedMatchResults,
    pendingDecisions,
    canClose,
  };
}

function decisionSummary(label: string, values: Array<{ status: string; decision?: string; title?: string; name?: string }>): string[] {
  if (values.length === 0) return [`${label}: None`];
  return [label, ...values.map((value) => `- ${value.title || value.name || "Decision"}: ${value.decision || value.status} (${value.status})`)];
}

export function buildShowClosureReport(input: {
  show: PlannedShow;
  session: WrapUpSession;
  progress: WrapUpProgress;
}): ShowClosureReport {
  const generatedAt = now();
  const actualShow = input.show.reconciliation?.actualShow;
  const outputVersionIds = input.session.segmentReviews.map((review) => review.outputVersionId).filter(Boolean);
  const runningOrder = input.show.segments.map((segment, index) => {
    const review = input.session.segmentReviews.find((item) => item.segmentId === segment.id);
    const actual = segment.reconciliation.actualMatch;
    const result = segment.type === "match"
      ? [actual?.winner ? `Winner: ${actual.winner}` : "Winner unresolved", actual?.matchTime ? `Time: ${actual.matchTime}` : "", actual?.rating !== null && actual?.rating !== undefined ? `Rating: ${actual.rating}` : ""].filter(Boolean).join(" · ")
      : [segment.reconciliation.actualRating !== null ? `Angle rating: ${segment.reconciliation.actualRating}` : "Angle rating unavailable", `Outcome: ${review?.happenedAsPlanned ?? "Unresolved"}`].join(" · ");
    return [
      `#${index + 1} · ${segment.section} · ${segment.title}`,
      result,
      `Final ${segment.type === "match" ? "Match Story" : "Angle Output"}: ${review?.finalNarrative || segment.reconciliation.finalNarrative || "Not recorded"}`,
      review?.changes ? `Changes: ${review.changes}` : "",
      review?.actualConsequences ? `Consequences: ${review.actualConsequences}` : "",
      review?.finalFollowUp ? `Follow-up: ${review.finalFollowUp}` : "",
    ].filter(Boolean).join("\n");
  });
  const text = [
    `SHOW CLOSURE REPORT: ${input.show.name}`,
    `Date: ${actualShow?.date || input.show.date || "Unscheduled"}`,
    `Company: ${actualShow?.company || input.show.company || "Not entered"}`,
    `Venue: ${actualShow?.venue || input.show.venue || "Not entered"}`,
    `Attendance: ${actualShow?.attendance ?? "Unavailable"}`,
    `Overall TEW rating: ${actualShow?.rating ?? "Unavailable"}`,
    `Source snapshot: ${actualShow?.sourceFile || "Unavailable"}`,
    `Wrap-up amendment: ${input.session.amendmentCount}`,
    `Outstanding decisions at closure: ${input.progress.pendingDecisions + input.progress.unresolvedMatchResults}`,
    "",
    "RUNNING ORDER",
    runningOrder.join("\n\n"),
    "",
    ...decisionSummary("CHAMPIONSHIP DECISIONS", input.session.championshipDecisions.map((decision) => ({ title: decision.championshipName, decision: decision.decision, status: decision.status }))),
    "",
    ...decisionSummary("COMPETITION DECISIONS", input.session.competitionDecisions.map((decision) => ({ title: `${decision.competitionName} · ${decision.roundLabel}`, decision: decision.resultType, status: decision.status }))),
    "",
    ...decisionSummary("STORYLINE MILESTONES", input.session.milestoneDecisions.map((decision) => ({ title: `${decision.storylineName} · ${decision.milestoneTitle}`, decision: decision.decision, status: decision.status }))),
    "",
    ...decisionSummary("BOOKING IDEAS", input.session.bookingIdeaDecisions.map((decision) => ({ title: decision.ideaTitle, decision: decision.decision, status: decision.status }))),
    "",
    ...decisionSummary("CHARACTER ARCS", input.session.arcDecisions.map((decision) => ({ title: `${decision.workerName} · ${decision.arcName}`, decision: decision.decision, status: decision.status }))),
    "",
    ...decisionSummary("FOLLOW-UPS", input.session.followUpDecisions.map((decision) => ({ title: decision.sourceSegmentTitle, decision: decision.destination, status: decision.status }))),
  ].join("\n");
  const report = {
    id: wrapUpId("closure-report"),
    showId: input.show.id,
    showName: input.show.name,
    generatedAt,
    amendmentNumber: input.session.amendmentCount,
    outstandingCount: input.progress.pendingDecisions + input.progress.unresolvedMatchResults,
    outputVersionIds,
    text,
    json: "",
  } satisfies ShowClosureReport;
  return {
    ...report,
    json: JSON.stringify({
      show: input.show,
      session: input.session,
      progress: input.progress,
      report: { ...report, json: undefined },
    }, null, 2),
  };
}

export function closeWrapUpSession(session: WrapUpSession, report: ShowClosureReport): WrapUpSession {
  const timestamp = now();
  return {
    ...session,
    status: "Closed",
    closureReports: [report, ...session.closureReports],
    closedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function openWrapUpAmendment(session: WrapUpSession): WrapUpSession {
  if (session.status !== "Closed") return session;
  return {
    ...session,
    status: "Amendment Open",
    amendmentCount: session.amendmentCount + 1,
    preWrapSnapshotJson: "",
    startedAt: now(),
    updatedAt: now(),
  };
}

export function markReviewCheckpoint(
  session: WrapUpSession,
  segmentId: string,
  outputItemId: string,
  outputVersionId: string,
): WrapUpSession {
  return {
    ...session,
    segmentReviews: session.segmentReviews.map((review) => review.segmentId === segmentId ? { ...review, outputItemId, outputVersionId, updatedAt: now() } : review),
    updatedAt: now(),
  };
}

export function updateWrapUpSegmentReview(session: WrapUpSession, review: WrapUpSegmentReview): WrapUpSession {
  return {
    ...session,
    status: session.status === "Not Reviewed" ? "In Progress" : session.status,
    segmentReviews: session.segmentReviews.map((item) => item.segmentId === review.segmentId ? { ...review, updatedAt: now() } : item),
    updatedAt: now(),
  };
}

export function updateChampionshipDecision(session: WrapUpSession, decision: WrapUpChampionshipDecision): WrapUpSession {
  return { ...session, championshipDecisions: session.championshipDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function updateCompetitionDecision(session: WrapUpSession, decision: WrapUpCompetitionDecision): WrapUpSession {
  return { ...session, competitionDecisions: session.competitionDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function updateMilestoneDecision(session: WrapUpSession, decision: WrapUpMilestoneDecision): WrapUpSession {
  return { ...session, milestoneDecisions: session.milestoneDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function updateBookingIdeaDecision(session: WrapUpSession, decision: WrapUpBookingIdeaDecision): WrapUpSession {
  return { ...session, bookingIdeaDecisions: session.bookingIdeaDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function updateArcDecision(session: WrapUpSession, decision: WrapUpArcDecision): WrapUpSession {
  return { ...session, arcDecisions: session.arcDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function updateFollowUpDecision(session: WrapUpSession, decision: WrapUpFollowUpDecision): WrapUpSession {
  return { ...session, followUpDecisions: session.followUpDecisions.map((item) => item.id === decision.id ? { ...decision, updatedAt: now() } : item), updatedAt: now() };
}

export function championshipPreviewLabel(championship: Championship, decision: WrapUpChampionshipDecision): string {
  const current = competitorNames(championship.currentChampions) || "Vacant";
  if (decision.decision === "Retained") return `${current} remains champion; a successful defense will be added.`;
  if (decision.decision === "Changed Hands") return `${current} → ${decision.resolvedChampionNames || decision.actualWinner || "new champion unresolved"}.`;
  if (decision.decision === "Vacated") return `${championship.name} becomes vacant.`;
  return `${decision.decision} makes no lineage change.`;
}

export function manualChampionsFromDecision(decision: WrapUpChampionshipDecision, knownWorkers: Array<{ id: string; name: string }> = []) {
  return competitorsFromNames(decision.resolvedChampionNames || decision.actualWinner, knownWorkers);
}
