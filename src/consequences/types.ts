import type { ChampionshipUniverse, TitleResultDecision } from "../championships/types";
import type { CompetitionResultType, CompetitionUniverse } from "../competitions/types";
import type { MatchResolutionAttempt, MatchResolutionFinalResult } from "../matchResolution/types";
import type { PlannedShow } from "../planner/types";

export type ConsequenceApplicationStatus = "Applied" | "Rolled Back";
export type ConsequenceDecisionStatus = "Pending" | "Confirmed" | "Deferred" | "Blocked";
export type ConsequencePromptKind = "Winner Celebration" | "Loser Reaction" | "Disputed Finish" | "Respect" | "Rematch Review" | "Championship Reaction" | "Competition Advancement" | "Incident Follow-Up";

export interface StandaloneMatchHistoryEntry {
  id: string;
  resolutionRecordId: string;
  resolutionAttemptId: string;
  showId: string;
  showName: string;
  showDate: string;
  segmentId: string;
  segmentTitle: string;
  opponentKeys: string[];
  opponentNames: string[];
  result: "W" | "L" | "D" | "NC";
  winnerName: string;
  finishDescription: string;
  durationMinutes: number;
  matchScore: number;
  starRating: number;
  performanceScore: number;
  competitiveScore: number;
  performanceLeader: boolean;
  engineResultAccepted: boolean;
  overrideReason: string;
  incident: string;
  occurredAt: string;
}

export interface StandaloneWorkerRecord {
  workerKey: string;
  workerId: string;
  workerName: string;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  currentStreakType: "W" | "L" | "D" | "NC" | "";
  currentStreakCount: number;
  lastFive: Array<"W" | "L" | "D" | "NC">;
  rankingPoints: number;
  rankingPosition: number;
  previousRankingPosition: number;
  momentum: number;
  health: number;
  fatigue: number;
  injuryStatus: "Healthy" | "Minor Concern" | "Injured";
  injuryNote: string;
  matchHistory: StandaloneMatchHistoryEntry[];
  updatedAt: string;
}

export interface ConditionChange {
  workerKey: string;
  workerName: string;
  healthBefore: number;
  healthAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  momentumBefore: number;
  momentumAfter: number;
  rankingPointsBefore: number;
  rankingPointsAfter: number;
  injuryStatus: StandaloneWorkerRecord["injuryStatus"];
  explanation: string[];
}

export interface FutureBookingConflict {
  id: string;
  sourceShowId: string;
  sourceSegmentId: string;
  futureShowId: string;
  futureShowName: string;
  futureShowDate: string;
  futureSegmentId: string;
  futureSegmentTitle: string;
  severity: "Review" | "Important";
  reason: string;
  winnerName: string;
  loserName: string;
  resolved: boolean;
  resolutionNote: string;
}

export interface GroundedBookingPrompt {
  id: string;
  kind: ConsequencePromptKind;
  title: string;
  factualBasis: string[];
  suggestedPurpose: string;
  sourceShowId: string;
  sourceSegmentId: string;
  dismissed: boolean;
  usedShowId: string;
  usedSegmentId: string;
}

export interface ChampionshipConsequenceProposal {
  id: string;
  applicationId: string;
  championshipId: string;
  championshipName: string;
  showId: string;
  segmentId: string;
  championEntering: string;
  challenger: string;
  finalWinner: string;
  suggestedDecision: TitleResultDecision;
  selectedDecision: TitleResultDecision;
  status: ConsequenceDecisionStatus;
  reason: string;
  preview: string[];
  confirmedAt: string;
}

export interface CompetitionConsequenceProposal {
  id: string;
  applicationId: string;
  competitionId: string;
  competitionName: string;
  fixtureId: string;
  roundLabel: string;
  showId: string;
  segmentId: string;
  finalWinner: string;
  proposedWinnerParticipantId: string;
  proposedWinnerParticipantName: string;
  resultType: CompetitionResultType;
  status: ConsequenceDecisionStatus;
  reason: string;
  preview: string[];
  confirmedAt: string;
}

export interface ConsequenceSnapshot {
  workerRecords: StandaloneWorkerRecord[];
  shows: PlannedShow[];
  championships: ChampionshipUniverse;
  competitions: CompetitionUniverse;
}

export interface ResultConsequenceApplication {
  id: string;
  resolutionRecordId: string;
  resolutionAttemptId: string;
  showId: string;
  showName: string;
  segmentId: string;
  segmentTitle: string;
  finalResult: MatchResolutionFinalResult;
  engineAttempt: MatchResolutionAttempt;
  status: ConsequenceApplicationStatus;
  conditionChanges: ConditionChange[];
  futureConflictIds: string[];
  promptIds: string[];
  championshipProposalId: string;
  competitionProposalId: string;
  before: ConsequenceSnapshot;
  appliedAt: string;
  rolledBackAt: string;
  rollbackReason: string;
}

export interface ConsequenceAuditEntry {
  id: string;
  applicationId: string;
  action: "Core Consequences Applied" | "Core Consequences Rolled Back" | "Championship Confirmed" | "Championship Deferred" | "Competition Confirmed" | "Competition Deferred" | "Conflict Resolved" | "Prompt Used" | "Prompt Dismissed";
  detail: string;
  createdAt: string;
}

export interface ResultConsequenceSettings {
  activeTab: "overview" | "records" | "decisions" | "future" | "audit";
  selectedApplicationId: string;
  selectedWorkerKey: string;
}

export interface ResultConsequenceUniverse {
  workerRecords: StandaloneWorkerRecord[];
  applications: ResultConsequenceApplication[];
  championshipProposals: ChampionshipConsequenceProposal[];
  competitionProposals: CompetitionConsequenceProposal[];
  futureConflicts: FutureBookingConflict[];
  prompts: GroundedBookingPrompt[];
  audit: ConsequenceAuditEntry[];
  settings: ResultConsequenceSettings;
}
