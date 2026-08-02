import type { PlannedShow } from "../planner/types";
import { createWrapUpSession, emptyWrapUpUniverse } from "./model";
import type {
  ShowClosureReport,
  WrapUpArcDecision,
  WrapUpAuditKind,
  WrapUpAuditRecord,
  WrapUpBookingIdeaDecision,
  WrapUpChampionshipDecision,
  WrapUpCompetitionDecision,
  WrapUpDecisionStatus,
  WrapUpFollowUpDecision,
  WrapUpFollowUpDestination,
  WrapUpMilestoneDecision,
  WrapUpPlanOutcome,
  WrapUpSegmentReview,
  WrapUpSession,
  WrapUpStatus,
  WrapUpUniverse,
} from "./types";

export const WRAP_UP_STORAGE_KEY = "tew-story-tracker:wrap-up:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

const wrapStatuses: WrapUpStatus[] = ["Not Reviewed", "In Progress", "Closed", "Amendment Open"];
const planOutcomes: WrapUpPlanOutcome[] = ["Unresolved", "Yes", "Partially", "No"];
const decisionStatuses: WrapUpDecisionStatus[] = ["Pending", "Confirmed", "Deferred", "Reversed", "Amended"];
const followUpDestinations: WrapUpFollowUpDestination[] = ["Promotion Calendar Inbox", "Existing Segment", "New Match", "New Angle", "Dismissed", "Left Open"];
const auditKinds: WrapUpAuditKind[] = ["Segment Review", "Output Checkpoint", "Championship", "Competition", "Storyline Milestone", "Booking Idea", "Character Arc", "Follow-Up", "Closure", "Rollback", "Amendment"];

function normalizeSegmentReview(value: unknown): WrapUpSegmentReview | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.segmentId)) return null;
  const segmentType = value.segmentType === "angle" ? "angle" : "match";
  return {
    id: text(value.id),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    segmentType,
    status: value.status === "Reviewed" ? "Reviewed" : "Pending",
    deliberatelyUnresolved: bool(value.deliberatelyUnresolved),
    happenedAsPlanned: enumValue(value.happenedAsPlanned, planOutcomes, "Unresolved"),
    actualAngleRating: nullableNumber(value.actualAngleRating),
    finalNarrative: text(value.finalNarrative),
    changes: text(value.changes),
    actualConsequences: text(value.actualConsequences),
    finalFollowUp: text(value.finalFollowUp),
    privateCorrectionNotes: text(value.privateCorrectionNotes),
    sourceSnapshotFile: text(value.sourceSnapshotFile),
    outputItemId: text(value.outputItemId),
    outputVersionId: text(value.outputVersionId),
    reviewedAt: text(value.reviewedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeChampionshipDecision(value: unknown): WrapUpChampionshipDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.segmentId) || !text(value.championshipId)) return null;
  const decisions: WrapUpChampionshipDecision["decision"][] = ["Retained", "Changed Hands", "Vacated", "Unresolved", "Deferred"];
  const suggested: WrapUpChampionshipDecision["suggestedDecision"][] = ["Retained", "Changed Hands", "Vacated", "Unresolved"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    championshipId: text(value.championshipId),
    championshipName: text(value.championshipName),
    championEntering: text(value.championEntering),
    challenger: text(value.challenger),
    actualWinner: text(value.actualWinner),
    resolvedChampionNames: text(value.resolvedChampionNames),
    suggestedDecision: enumValue(value.suggestedDecision, suggested, "Unresolved"),
    decision: enumValue(value.decision, decisions, "Unresolved"),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    preview: text(value.preview),
    reason: text(value.reason),
    auditId: text(value.auditId),
    appliedAt: text(value.appliedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeCompetitionDecision(value: unknown): WrapUpCompetitionDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.segmentId) || !text(value.competitionId) || !text(value.fixtureId)) return null;
  const resultTypes: WrapUpCompetitionDecision["resultType"][] = ["Decision", "Draw", "No Contest", "Cancelled", "Deferred"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    competitionId: text(value.competitionId),
    competitionName: text(value.competitionName),
    fixtureId: text(value.fixtureId),
    roundLabel: text(value.roundLabel),
    actualWinner: text(value.actualWinner),
    proposedWinnerParticipantId: text(value.proposedWinnerParticipantId),
    proposedWinnerName: text(value.proposedWinnerName),
    resultType: enumValue(value.resultType, resultTypes, "Decision"),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    preview: text(value.preview),
    reason: text(value.reason),
    auditId: text(value.auditId),
    appliedAt: text(value.appliedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeMilestoneDecision(value: unknown): WrapUpMilestoneDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.storylineId) || !text(value.milestoneId)) return null;
  const decisions: WrapUpMilestoneDecision["decision"][] = ["Completed", "Delayed", "Cancelled", "Reassigned", "Unchanged"];
  const storylineStatuses: WrapUpMilestoneDecision["storylineStatus"][] = ["", "Idea", "Planned", "Active", "Paused", "Completed", "Abandoned"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    storylineId: text(value.storylineId),
    storylineName: text(value.storylineName),
    milestoneId: text(value.milestoneId),
    milestoneTitle: text(value.milestoneTitle),
    decision: enumValue(value.decision, decisions, "Unchanged"),
    targetShowId: text(value.targetShowId),
    storylineStatus: enumValue(value.storylineStatus, storylineStatuses, ""),
    currentPhase: text(value.currentPhase),
    aftermath: text(value.aftermath),
    note: text(value.note),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    auditId: text(value.auditId),
    appliedAt: text(value.appliedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeIdeaDecision(value: unknown): WrapUpBookingIdeaDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.ideaId)) return null;
  const decisions: WrapUpBookingIdeaDecision["decision"][] = ["Completed", "Delayed", "Keep Active", "Reassigned", "Archived"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    ideaId: text(value.ideaId),
    ideaTitle: text(value.ideaTitle),
    decision: enumValue(value.decision, decisions, "Keep Active"),
    targetShowId: text(value.targetShowId),
    note: text(value.note),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    auditId: text(value.auditId),
    appliedAt: text(value.appliedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeArcDecision(value: unknown): WrapUpArcDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.workerId) || !text(value.arcId)) return null;
  const decisions: WrapUpArcDecision["decision"][] = ["Progress", "Turning Point", "Resolution", "Delayed", "Keep Active"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    workerId: text(value.workerId),
    workerName: text(value.workerName),
    arcId: text(value.arcId),
    arcName: text(value.arcName),
    decision: enumValue(value.decision, decisions, "Keep Active"),
    targetShowId: text(value.targetShowId),
    progressNote: text(value.progressNote),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    auditId: text(value.auditId),
    appliedAt: text(value.appliedAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeFollowUpDecision(value: unknown): WrapUpFollowUpDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.sourceSegmentId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    sourceSegmentId: text(value.sourceSegmentId),
    sourceSegmentTitle: text(value.sourceSegmentTitle),
    plannedFollowUp: text(value.plannedFollowUp),
    finalFollowUp: text(value.finalFollowUp),
    destination: enumValue(value.destination, followUpDestinations, "Left Open"),
    targetShowId: text(value.targetShowId),
    targetSegmentId: text(value.targetSegmentId),
    obligationKey: text(value.obligationKey),
    reason: text(value.reason),
    status: enumValue(value.status, decisionStatuses, "Pending"),
    auditId: text(value.auditId),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeReport(value: unknown): ShowClosureReport | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    showName: text(value.showName),
    generatedAt: text(value.generatedAt),
    amendmentNumber: Math.max(0, Math.floor(numberValue(value.amendmentNumber))),
    outstandingCount: Math.max(0, Math.floor(numberValue(value.outstandingCount))),
    outputVersionIds: strings(value.outputVersionIds),
    text: text(value.text),
    json: text(value.json),
  };
}

function normalizeAudit(value: unknown): WrapUpAuditRecord | null {
  if (!isRecord(value) || !text(value.id) || !text(value.sessionId) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    sessionId: text(value.sessionId),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    kind: enumValue(value.kind, auditKinds, "Segment Review"),
    entityId: text(value.entityId),
    action: text(value.action),
    reason: text(value.reason),
    previousStateJson: text(value.previousStateJson),
    nextStateJson: text(value.nextStateJson),
    amendmentOfAuditId: text(value.amendmentOfAuditId),
    createdAt: text(value.createdAt),
    reversedAt: text(value.reversedAt),
  };
}

function normalizeSession(value: unknown): WrapUpSession | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    status: enumValue(value.status, wrapStatuses, "Not Reviewed"),
    segmentReviews: Array.isArray(value.segmentReviews) ? value.segmentReviews.map(normalizeSegmentReview).filter((item): item is WrapUpSegmentReview => item !== null) : [],
    championshipDecisions: Array.isArray(value.championshipDecisions) ? value.championshipDecisions.map(normalizeChampionshipDecision).filter((item): item is WrapUpChampionshipDecision => item !== null) : [],
    competitionDecisions: Array.isArray(value.competitionDecisions) ? value.competitionDecisions.map(normalizeCompetitionDecision).filter((item): item is WrapUpCompetitionDecision => item !== null) : [],
    milestoneDecisions: Array.isArray(value.milestoneDecisions) ? value.milestoneDecisions.map(normalizeMilestoneDecision).filter((item): item is WrapUpMilestoneDecision => item !== null) : [],
    bookingIdeaDecisions: Array.isArray(value.bookingIdeaDecisions) ? value.bookingIdeaDecisions.map(normalizeIdeaDecision).filter((item): item is WrapUpBookingIdeaDecision => item !== null) : [],
    arcDecisions: Array.isArray(value.arcDecisions) ? value.arcDecisions.map(normalizeArcDecision).filter((item): item is WrapUpArcDecision => item !== null) : [],
    followUpDecisions: Array.isArray(value.followUpDecisions) ? value.followUpDecisions.map(normalizeFollowUpDecision).filter((item): item is WrapUpFollowUpDecision => item !== null) : [],
    closureReports: Array.isArray(value.closureReports) ? value.closureReports.map(normalizeReport).filter((item): item is ShowClosureReport => item !== null) : [],
    auditIds: strings(value.auditIds),
    preWrapSnapshotJson: text(value.preWrapSnapshotJson),
    amendmentCount: Math.max(0, Math.floor(numberValue(value.amendmentCount))),
    startedAt: text(value.startedAt),
    updatedAt: text(value.updatedAt),
    closedAt: text(value.closedAt),
  };
}

export function parseWrapUpUniverse(value: unknown): WrapUpUniverse {
  if (!isRecord(value)) return emptyWrapUpUniverse();
  return {
    sessions: Array.isArray(value.sessions) ? value.sessions.map(normalizeSession).filter((item): item is WrapUpSession => item !== null) : [],
    audits: Array.isArray(value.audits) ? value.audits.map(normalizeAudit).filter((item): item is WrapUpAuditRecord => item !== null) : [],
  };
}

export function migrateShowsToWrapUp(shows: PlannedShow[]): WrapUpUniverse {
  return {
    sessions: shows.filter((show) => show.status === "Reconciled" || Boolean(show.reconciliation?.completedAt)).map((show) => createWrapUpSession(show)),
    audits: [],
  };
}

export function loadWrapUpUniverse(storage: Pick<Storage, "getItem">): WrapUpUniverse {
  const raw = storage.getItem(WRAP_UP_STORAGE_KEY);
  if (!raw) return emptyWrapUpUniverse();
  try { return parseWrapUpUniverse(JSON.parse(raw) as unknown); } catch { return emptyWrapUpUniverse(); }
}

export function saveWrapUpUniverse(storage: Pick<Storage, "setItem">, universe: WrapUpUniverse): void {
  storage.setItem(WRAP_UP_STORAGE_KEY, JSON.stringify(universe));
}
