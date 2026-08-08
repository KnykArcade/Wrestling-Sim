export type CompetitionKind = "Tournament" | "Cup" | "League" | "Classic" | "Custom";
export type CompetitionFormat = "Single Elimination" | "Round Robin" | "Double Round Robin" | "Round Robin + Final" | "Group Stage + Knockout";
export type CompetitionParticipantType = "Singles" | "Tag Team" | "Trios" | "Custom";
export type CompetitionStatus = "Planning" | "Active" | "Completed" | "Archived";
export type CompetitionParticipantStatus = "Active" | "Eliminated" | "Withdrawn" | "Champion";
export type CompetitionFixtureStatus = "Unscheduled" | "Scheduled" | "Completed" | "Bye" | "Cancelled";
export type CompetitionResultType = "Decision" | "Draw" | "Bye" | "No Contest" | "Cancelled";
export type CompetitionStageType = "League" | "Group" | "Knockout";
export type CompetitionAssignmentMode = "Seeded" | "Manual";
export type CompetitionTiebreakRule = "Head to Head" | "Submission Differential" | "Committee Decision" | "Playoff";
export type CompetitionActionStatus = "Open" | "Resolved";

export interface CompetitionParticipant {
  id: string;
  name: string;
  memberNames: string[];
  seed: number;
  status: CompetitionParticipantStatus;
  source: "tew" | "manual";
  sourceWorkerIds: string[];
  companyId: string;
  companyName: string;
  groupId: string;
  notes: string;
}

export interface CompetitionFixture {
  id: string;
  roundNumber: number;
  roundLabel: string;
  bracketPosition: number;
  participantAId: string;
  participantBId: string;
  sourceFixtureAId: string;
  sourceFixtureBId: string;
  stageId: string;
  stageType: CompetitionStageType;
  groupId: string;
  sourceGroupAId: string;
  sourceGroupARank: number;
  sourceGroupBId: string;
  sourceGroupBRank: number;
  status: CompetitionFixtureStatus | (string & {});
  resultType: CompetitionResultType | "" | (string & {});
  winnerId: string;
  loserId: string;
  scoreText: string;
  scheduledShowId: string;
  plannedSegmentId: string;
  completedAt: string;
  notes: string;
  sourceResultId: string;
  submissionWinnerCount: number;
  submissionLoserCount: number;
  matchRating: number | null;
}

export interface CompetitionGroup {
  id: string;
  name: string;
  order: number;
  participantIds: string[];
  qualifierCount: number;
}

export interface CompetitionStage {
  id: string;
  name: string;
  order: number;
  type: CompetitionStageType;
  groupIds: string[];
}

export type CompetitionSubmissionTiebreak = "Unresolved" | "Submission Differential" | "Disabled";

export interface CompetitionPointsRules {
  win: number;
  draw: number;
  loss: number;
  noContest: number;
}

export interface Competition {
  id: string;
  name: string;
  kind: CompetitionKind;
  format: CompetitionFormat;
  participantType: CompetitionParticipantType;
  status: CompetitionStatus;
  seriesId: string;
  companyId: string;
  companyName: string;
  company: string;
  brand: string;
  startDate: string;
  endDate: string;
  editionLabel: string;
  prize: string;
  trophyName: string;
  traditions: string;
  championPresentation: string;
  linkedChampionshipId: string;
  linkedStorylineId: string;
  championParticipantId: string;
  runnerUpParticipantId: string;
  pointsRules: CompetitionPointsRules;
  submissionTiebreak: CompetitionSubmissionTiebreak;
  committeeDecisionParticipantId: string;
  unresolvedTieParticipantIds: string[];
  topAdvanceCount: number;
  groupCount: number;
  qualifiersPerGroup: number;
  groupAssignmentMode: CompetitionAssignmentMode;
  tiebreakOrder: CompetitionTiebreakRule[];
  expectedParticipantCount: number;
  participants: CompetitionParticipant[];
  groups: CompetitionGroup[];
  stages: CompetitionStage[];
  fixtures: CompetitionFixture[];
  audit: CompetitionAuditEntry[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionSeries {
  id: string;
  name: string;
  kind: CompetitionKind;
  companyId: string;
  companyName: string;
  editionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionAuditEntry {
  id: string;
  action: string;
  detail: string;
  fixtureId: string;
  sourceResultId: string;
  createdAt: string;
}

export interface CompetitionActionItem {
  id: string;
  competitionId: string;
  fixtureId: string;
  type: "Ambiguous Winner" | "Participant Mismatch" | "Invalid Draw" | "Unresolved Tie" | "Missing Planned Match";
  message: string;
  status: CompetitionActionStatus;
  createdAt: string;
  resolvedAt: string;
}

export interface CompetitionUniverse {
  competitions: Competition[];
  series?: CompetitionSeries[];
  actionQueue?: CompetitionActionItem[];
}

export interface CompetitionStanding {
  participantId: string;
  participantName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  noContests: number;
  points: number;
  rank: number;
  headToHeadPoints: number;
  submissionDifferential: number;
  tied: boolean;
  tiebreakExplanation: string[];
  qualified: boolean;
}

export interface CompetitionWarning {
  id: string;
  severity: "Info" | "Warning";
  message: string;
  fixtureId: string;
  participantId: string;
}
