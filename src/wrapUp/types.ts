export type WrapUpStatus = "Not Reviewed" | "In Progress" | "Closed" | "Amendment Open";
export type WrapUpPlanOutcome = "Unresolved" | "Yes" | "Partially" | "No";
export type WrapUpDecisionStatus = "Pending" | "Confirmed" | "Deferred" | "Reversed" | "Amended";
export type WrapUpSegmentReviewStatus = "Pending" | "Reviewed";

export interface WrapUpSegmentReview {
  id: string;
  showId: string;
  segmentId: string;
  segmentType: "match" | "angle";
  status: WrapUpSegmentReviewStatus;
  deliberatelyUnresolved: boolean;
  happenedAsPlanned: WrapUpPlanOutcome;
  actualAngleRating: number | null;
  finalNarrative: string;
  changes: string;
  actualConsequences: string;
  finalFollowUp: string;
  privateCorrectionNotes: string;
  sourceSnapshotFile: string;
  outputItemId: string;
  outputVersionId: string;
  reviewedAt: string;
  updatedAt: string;
}

export interface WrapUpChampionshipDecision {
  id: string;
  showId: string;
  segmentId: string;
  championshipId: string;
  championshipName: string;
  championEntering: string;
  challenger: string;
  actualWinner: string;
  resolvedChampionNames: string;
  suggestedDecision: "Retained" | "Changed Hands" | "Vacated" | "Unresolved";
  decision: "Retained" | "Changed Hands" | "Vacated" | "Unresolved" | "Deferred";
  status: WrapUpDecisionStatus;
  preview: string;
  reason: string;
  auditId: string;
  appliedAt: string;
  updatedAt: string;
}

export interface WrapUpCompetitionDecision {
  id: string;
  showId: string;
  segmentId: string;
  competitionId: string;
  competitionName: string;
  fixtureId: string;
  roundLabel: string;
  actualWinner: string;
  proposedWinnerParticipantId: string;
  proposedWinnerName: string;
  resultType: "Decision" | "Draw" | "No Contest" | "Cancelled" | "Deferred";
  status: WrapUpDecisionStatus;
  preview: string;
  reason: string;
  auditId: string;
  appliedAt: string;
  updatedAt: string;
}

export interface WrapUpMilestoneDecision {
  id: string;
  showId: string;
  storylineId: string;
  storylineName: string;
  milestoneId: string;
  milestoneTitle: string;
  decision: "Completed" | "Delayed" | "Cancelled" | "Reassigned" | "Unchanged";
  targetShowId: string;
  storylineStatus: "" | "Idea" | "Planned" | "Active" | "Paused" | "Completed" | "Abandoned";
  currentPhase: string;
  aftermath: string;
  note: string;
  status: WrapUpDecisionStatus;
  auditId: string;
  appliedAt: string;
  updatedAt: string;
}

export interface WrapUpBookingIdeaDecision {
  id: string;
  showId: string;
  ideaId: string;
  ideaTitle: string;
  decision: "Completed" | "Delayed" | "Keep Active" | "Reassigned" | "Archived";
  targetShowId: string;
  note: string;
  status: WrapUpDecisionStatus;
  auditId: string;
  appliedAt: string;
  updatedAt: string;
}

export interface WrapUpArcDecision {
  id: string;
  showId: string;
  workerId: string;
  workerName: string;
  arcId: string;
  arcName: string;
  decision: "Progress" | "Turning Point" | "Resolution" | "Delayed" | "Keep Active";
  targetShowId: string;
  progressNote: string;
  status: WrapUpDecisionStatus;
  auditId: string;
  appliedAt: string;
  updatedAt: string;
}

export type WrapUpFollowUpDestination =
  | "Promotion Calendar Inbox"
  | "Existing Segment"
  | "New Match"
  | "New Angle"
  | "Dismissed"
  | "Left Open";

export interface WrapUpFollowUpDecision {
  id: string;
  showId: string;
  sourceSegmentId: string;
  sourceSegmentTitle: string;
  plannedFollowUp: string;
  finalFollowUp: string;
  destination: WrapUpFollowUpDestination;
  targetShowId: string;
  targetSegmentId: string;
  obligationKey: string;
  reason: string;
  status: WrapUpDecisionStatus;
  auditId: string;
  createdAt: string;
  updatedAt: string;
}

export type WrapUpAuditKind =
  | "Segment Review"
  | "Output Checkpoint"
  | "Championship"
  | "Competition"
  | "Storyline Milestone"
  | "Booking Idea"
  | "Character Arc"
  | "Follow-Up"
  | "Closure"
  | "Rollback"
  | "Amendment";

export interface WrapUpAuditRecord {
  id: string;
  sessionId: string;
  showId: string;
  segmentId: string;
  kind: WrapUpAuditKind;
  entityId: string;
  action: string;
  reason: string;
  previousStateJson: string;
  nextStateJson: string;
  amendmentOfAuditId: string;
  createdAt: string;
  reversedAt: string;
}

export interface ShowClosureReport {
  id: string;
  showId: string;
  showName: string;
  generatedAt: string;
  amendmentNumber: number;
  outstandingCount: number;
  outputVersionIds: string[];
  text: string;
  json: string;
}

export interface WrapUpSession {
  id: string;
  showId: string;
  status: WrapUpStatus;
  segmentReviews: WrapUpSegmentReview[];
  championshipDecisions: WrapUpChampionshipDecision[];
  competitionDecisions: WrapUpCompetitionDecision[];
  milestoneDecisions: WrapUpMilestoneDecision[];
  bookingIdeaDecisions: WrapUpBookingIdeaDecision[];
  arcDecisions: WrapUpArcDecision[];
  followUpDecisions: WrapUpFollowUpDecision[];
  closureReports: ShowClosureReport[];
  auditIds: string[];
  preWrapSnapshotJson: string;
  amendmentCount: number;
  startedAt: string;
  updatedAt: string;
  closedAt: string;
}

export interface WrapUpUniverse {
  sessions: WrapUpSession[];
  audits: WrapUpAuditRecord[];
}

export interface WrapUpProgress {
  showId: string;
  status: WrapUpStatus;
  segmentReviewsComplete: number;
  segmentReviewsTotal: number;
  outputCheckpointsComplete: number;
  outputCheckpointsTotal: number;
  championshipPending: number;
  competitionPending: number;
  milestonePending: number;
  bookingIdeaPending: number;
  arcPending: number;
  followUpPending: number;
  unresolvedMatchResults: number;
  pendingDecisions: number;
  canClose: boolean;
}

export interface WrapUpSnapshotPayload {
  shows: unknown;
  championships: unknown;
  competitions: unknown;
  storylines: unknown;
  control: unknown;
  workers: unknown;
  promotionSchedule: unknown;
  outputLibrary: unknown;
}
