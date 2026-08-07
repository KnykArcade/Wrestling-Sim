import type { MatchAimId, MatchEngineProfile, MentalStateDefinition, MentalStateId, PaceStatus, StaminaStatus } from "../matchEngine/types";
import type { LiveAudienceResult, MatchAnticipation } from "../crowd/types";
import type { ImportedApproachFormulaId, StartingUniverseWorkbookMetrics } from "../startingUniverse/types";

export type ResolutionApproachId = ImportedApproachFormulaId;
export type ResolutionApproachMode = "AI" | "Manual";
export type MatchResolutionImportance = "Television" | "Feature" | "Main Event" | "Championship" | "Tournament";
export type MatchResolutionStatus = "Unresolved" | "Calculated" | "Accepted" | "Overridden";
export type MatchResolutionAttemptStatus = "Calculated" | "Accepted" | "Overridden" | "Superseded";
export type MatchResolutionFormat = "Singles" | "Team" | "Multi Person" | "Elimination" | "Battle Royal";
export type MatchResolutionFinishType =
  | "Pinfall"
  | "Submission"
  | "Knockout"
  | "Referee Stoppage"
  | "Count Out"
  | "Disqualification"
  | "No Contest";

export interface ResolutionApproachDefinition {
  id: ResolutionApproachId;
  name: string;
  workbookName: string;
  pace: 1 | 2 | 3;
  staminaCost: 1 | 2 | 3;
  paceSource: "Workbook" | "Wrestling Sim Extension";
  summary: string;
}

export interface MatchResolutionWorkerSettings {
  workerKey: string;
  workerId: string;
  workerName: string;
  approachMode: ResolutionApproachMode;
  lockedApproachIds: ResolutionApproachId[];
  manualApproachIds: ResolutionApproachId[];
  storyNeed: number;
  momentum: number;
  bookingBias: number;
  teamId?: string;
  teamName?: string;
}

export interface MatchResolutionTeamResult {
  id: string;
  name: string;
  memberKeys: string[];
  memberNames: string[];
  competitiveScore: number;
  winProbability: number;
}

export interface MatchResolutionElimination {
  order: number;
  eliminatedWorkerKey: string;
  eliminatedWorkerName: string;
  eliminatedTeamId: string;
  byWorkerKey: string;
  byWorkerName: string;
  finishType: MatchResolutionFinishType;
}

export interface MatchResolutionSetup {
  showId: string;
  showName: string;
  showDate: string;
  segmentId: string;
  segmentTitle: string;
  matchType: string;
  durationMinutes: number;
  approachLimit?: number | null;
  aimId: MatchAimId;
  importance: MatchResolutionImportance;
  championship: string;
  competitionRound: string;
  chemistry: number;
  volatility: number;
  anticipation?: MatchAnticipation;
  workers: MatchResolutionWorkerSettings[];
  format?: MatchResolutionFormat;
  eliminationRules?: boolean;
}

export interface MatchResolutionWorkerSource {
  profile: MatchEngineProfile;
  workbookMetrics: StartingUniverseWorkbookMetrics | null;
}

export interface MatchResolutionApproachScore {
  approachId: ResolutionApproachId;
  approachName: string;
  rating: number;
  aimFit: number;
  styleFit: number;
  opponentFit: number;
  paceFit: number;
  staminaEfficiency: number;
  total: number;
  reasons: string[];
}

export interface MatchResolutionWorkerResult {
  workerKey: string;
  workerId: string;
  workerName: string;
  selectedApproachIds: ResolutionApproachId[];
  selectedApproachNames: string[];
  approachScores: MatchResolutionApproachScore[];
  averageApproachRating: number;
  approachExecution: number;
  presentationScore: number;
  performanceScore: number;
  competitiveScore: number;
  winProbability: number;
  mentalStateId: MentalStateId;
  mentalStateName: MentalStateDefinition["name"];
  mentalBase: number;
  mentalStateScore: number;
  mentalModifier: number;
  luck: number;
  swing: number;
  consistencyVariance: number;
  actualPace: number;
  paceStatus: PaceStatus;
  paceModifier: number;
  staminaUsed: number;
  staminaAvailable: number;
  staminaStatus: StaminaStatus;
  staminaModifier: number;
  interactionModifier: number;
  storyNeedModifier: number;
  momentumModifier: number;
  bookingModifier: number;
  volatilityNoise: number;
  botchRisk: number;
  incident: string;
  decisiveComponents: Array<{ label: string; value: number }>;
}

export interface MatchResolutionEngineResult {
  winnerKey: string;
  winnerName: string;
  loserKey: string;
  loserName: string;
  winnerTeamId?: string;
  winnerTeamName?: string;
  winnerMemberKeys?: string[];
  winnerMemberNames?: string[];
  loserKeys?: string[];
  loserNames?: string[];
  fallWinnerKey?: string;
  fallWinnerName?: string;
  fallLoserKey?: string;
  fallLoserName?: string;
  teamResults?: MatchResolutionTeamResult[];
  eliminationOrder?: MatchResolutionElimination[];
  finishType: MatchResolutionFinishType;
  finishDescription: string;
  actualDurationMinutes: number;
  matchScore: number;
  starRating: number;
  performanceLeaderKey: string;
  performanceLeaderName: string;
  winnerProbability: number;
  resultRoll: number;
  confidenceLabel: "Low" | "Moderate" | "High";
  upset: boolean;
  decisiveFactors: string[];
  matchFacts: string[];
}

export interface MatchResolutionFinalResult {
  winnerKey: string;
  winnerName: string;
  loserKey: string;
  loserName: string;
  winnerTeamId?: string;
  winnerTeamName?: string;
  winnerMemberKeys?: string[];
  winnerMemberNames?: string[];
  loserKeys?: string[];
  loserNames?: string[];
  fallWinnerKey?: string;
  fallWinnerName?: string;
  fallLoserKey?: string;
  fallLoserName?: string;
  eliminationOrder?: MatchResolutionElimination[];
  finishType: MatchResolutionFinishType;
  finishDescription: string;
  actualDurationMinutes: number;
  matchScore: number;
  starRating: number;
  performanceRating?: number;
  audience?: LiveAudienceResult;
  acceptedEngineResult: boolean;
  overrideReason: string;
  finalizedAt: string;
}

export interface MatchResolutionAttempt {
  id: string;
  number: number;
  seed: string;
  setupFingerprint: string;
  setupChangeReason: string;
  calculationVersion: string;
  generatedAt: string;
  status: MatchResolutionAttemptStatus;
  workerResults: MatchResolutionWorkerResult[];
  engineResult: MatchResolutionEngineResult;
  finalResult: MatchResolutionFinalResult | null;
}

export interface MatchResolutionRecord {
  id: string;
  showId: string;
  showName: string;
  segmentId: string;
  segmentTitle: string;
  setup: MatchResolutionSetup;
  attempts: MatchResolutionAttempt[];
  activeAttemptId: string;
  status: MatchResolutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MatchResolutionSettings {
  defaultImportance: MatchResolutionImportance;
  defaultChemistry: number;
  defaultVolatility: number;
  requireOverrideReason: boolean;
  selectedShowId: string;
  selectedSegmentId: string;
}

export interface MatchResolutionUniverse {
  records: MatchResolutionRecord[];
  settings: MatchResolutionSettings;
}

export interface ResolveSinglesMatchInput {
  setup: MatchResolutionSetup;
  workers: [MatchResolutionWorkerSource, MatchResolutionWorkerSource];
  seed?: string;
  setupChangeReason?: string;
}

export interface ResolveMatchInput {
  setup: MatchResolutionSetup;
  workers: MatchResolutionWorkerSource[];
  seed?: string;
  setupChangeReason?: string;
}
