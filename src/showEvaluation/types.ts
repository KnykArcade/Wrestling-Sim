import type { AnglePerformanceRole } from "../planner/types";

export type AngleEvaluationStatus = "Calculated" | "Accepted" | "Overridden";

export interface AngleParticipantEvaluation {
  workerKey: string;
  workerName: string;
  role: AnglePerformanceRole;
  performanceScore: number;
  momentumDelta: number;
  popularityDelta: number;
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
  calculatedScore: number;
  finalScore: number;
  overrideReason: string;
  factors: Array<{ label: string; value: number; detail: string }>;
  participants: AngleParticipantEvaluation[];
  calculatedAt: string;
  finalizedAt: string;
  appliedAt: string;
}

export interface CrowdProgressionEntry {
  segmentId: string;
  segmentTitle: string;
  segmentType: "match" | "angle";
  score: number;
  importanceWeight: number;
  crowdBefore: number;
  crowdAfter: number;
  reaction: string;
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
  promotionPopularityBefore: number;
  promotionPopularityAfter: number;
  promotionPopularityDelta: number;
  crowdStart: number;
  crowdFinish: number;
  segments: CrowdProgressionEntry[];
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
}
