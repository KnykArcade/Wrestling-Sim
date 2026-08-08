import type { AnglePerformanceRole } from "../planner/types";
import type { CalculationLedgerStage } from "../calculations/foundation";

export type AngleEvaluationStatus = "Calculated" | "Accepted" | "Overridden";

export interface AngleParticipantEvaluation {
  workerKey: string;
  workerName: string;
  role: AnglePerformanceRole;
  rolePerformance: number;
  performanceScore: number;
  momentumBefore: number;
  momentumDelta: number;
  momentumAfter: number;
  popularityBefore: number;
  popularityDelta: number;
  popularityAfter: number;
  calculationLedger?: {
    rolePerformance: CalculationLedgerStage;
    creditedPerformance: CalculationLedgerStage;
    momentum: CalculationLedgerStage;
    popularity: CalculationLedgerStage;
  };
  explanation: string[];
}

export interface AngleEvaluation {
  id: string;
  idempotencyKey: string;
  showId: string;
  showName: string;
  segmentId: string;
  segmentTitle: string;
  status: AngleEvaluationStatus;
  calculationVersion: string;
  setupFingerprint: string;
  rawPerformance: number;
  anticipation: number;
  crowdBefore: number;
  crowdResponse: number;
  calculatedScore: number;
  finalScore: number;
  overrideReason: string;
  factors: Array<{ label: string; value: number; detail: string }>;
  participants: AngleParticipantEvaluation[];
  calculationLedger?: {
    participantExecution: CalculationLedgerStage;
    structure: CalculationLedgerStage;
    rawPerformance: CalculationLedgerStage;
    popularity: CalculationLedgerStage;
    momentum: CalculationLedgerStage;
    fanPresentation: CalculationLedgerStage;
    storyStakes: CalculationLedgerStage;
    anticipation: CalculationLedgerStage;
    expectationAdjustment: CalculationLedgerStage;
    crowdResponse: CalculationLedgerStage;
    finalRating: CalculationLedgerStage;
    crowdAfter: CalculationLedgerStage;
  };
  calculatedAt: string;
  finalizedAt: string;
  appliedAt: string;
}

export interface CrowdProgressionEntry {
  segmentId: string;
  segmentTitle: string;
  segmentType: "match" | "angle";
  score: number;
  receptionScore: number;
  crowdModifier: number;
  durationMinutes: number;
  sectionWeight: number;
  durationWeight: number;
  mainEventWeight: number;
  importanceWeight: number;
  weightedContribution: number;
  mainEvent: boolean;
  crowdBefore: number;
  crowdAfter: number;
  reaction: string;
}

export interface PromotionStrengthSnapshot {
  source: "Imported Company" | "Saved Promotion" | "Estimated Baseline";
  companyName: string;
  companySize: string;
  sizeScore: number;
  prestige: number;
  momentum: number;
}

export interface AttendanceCalculation {
  expectedCardStrength: number;
  marketDemand: number;
  recentPerformance: number;
  showImportance: number;
  venueCapacity: number;
  unconstrainedDemand: number;
  capacityLimited: boolean;
}

export interface ShowExpectationSnapshot {
  calculationVersion: string;
  promotionPopularity: number;
  promotionStrength: PromotionStrengthSnapshot;
  expectedShowScore: number;
  expectedCardStrength: number;
  recentPerformance: number;
  estimatedAttendance: number;
  attendanceCalculation: AttendanceCalculation;
  crowdStart: number;
  calculationLedger?: {
    promotionStrength: CalculationLedgerStage;
    expectedCardStrength: CalculationLedgerStage;
    startingCrowd: CalculationLedgerStage;
    expectedShowScore: CalculationLedgerStage;
    attendanceDemand: CalculationLedgerStage;
  };
  createdAt: string;
}

export interface ShowEvaluationReport {
  id: string;
  showId: string;
  showName: string;
  showDate: string;
  calculationVersion: string;
  overallScore: number;
  audienceReaction: string;
  estimatedAttendance: number;
  expectedShowScore: number;
  promotionStrength: PromotionStrengthSnapshot;
  attendanceCalculation: AttendanceCalculation;
  promotionPopularityBefore: number;
  promotionPopularityAfter: number;
  promotionPopularityDelta: number;
  crowdStart: number;
  crowdFinish: number;
  segments: CrowdProgressionEntry[];
  calculationLedger?: {
    overallScore: CalculationLedgerStage;
    promotionStrength: CalculationLedgerStage;
    expectedCardStrength: CalculationLedgerStage;
    startingCrowd: CalculationLedgerStage;
    expectedShowScore: CalculationLedgerStage;
    promotionPopularity: CalculationLedgerStage;
    attendanceDemand: CalculationLedgerStage;
  };
  explanations: string[];
  createdAt: string;
  appliedAt: string;
}

export interface AngleWorkerImpact {
  workerKey: string;
  workerName: string;
  momentum: number;
  popularity: number;
  angleHistory: Array<{
    angleEvaluationId: string;
    showId: string;
    showName: string;
    segmentId: string;
    segmentTitle: string;
    score: number;
    momentumDelta: number;
    popularityDelta: number;
    occurredAt: string;
  }>;
  updatedAt: string;
}

export interface ShowEvaluationUniverse {
  angleEvaluations: AngleEvaluation[];
  workerImpacts: AngleWorkerImpact[];
  showReports: ShowEvaluationReport[];
  promotionPopularity: number;
  promotionPopularitySeeded: boolean;
}
