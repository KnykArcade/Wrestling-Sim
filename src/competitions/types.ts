export type CompetitionKind = "Tournament" | "Cup" | "League" | "Classic" | "Custom";
export type CompetitionFormat = "Single Elimination" | "Round Robin" | "Double Round Robin" | "Round Robin + Final";
export type CompetitionParticipantType = "Singles" | "Tag Team" | "Trios" | "Custom";
export type CompetitionStatus = "Planning" | "Active" | "Completed" | "Archived";
export type CompetitionParticipantStatus = "Active" | "Eliminated" | "Withdrawn" | "Champion";
export type CompetitionFixtureStatus = "Unscheduled" | "Scheduled" | "Completed" | "Bye" | "Cancelled";
export type CompetitionResultType = "Decision" | "Draw" | "Bye" | "No Contest" | "Cancelled";

export interface CompetitionParticipant {
  id: string;
  name: string;
  memberNames: string[];
  seed: number;
  status: CompetitionParticipantStatus;
  source: "tew" | "manual";
  sourceWorkerIds: string[];
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
  expectedParticipantCount: number;
  participants: CompetitionParticipant[];
  fixtures: CompetitionFixture[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionUniverse {
  competitions: Competition[];
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
}

export interface CompetitionWarning {
  id: string;
  severity: "Info" | "Warning";
  message: string;
  fixtureId: string;
  participantId: string;
}
