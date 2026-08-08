import type { CalculationLedgerStage } from "../calculations/foundation";

export type MomentumLabel = "Ice Cold" | "Cold" | "Even" | "Hot" | "White Hot";
export type AnticipationLabel = "No Interest" | "Low Interest" | "Interested" | "Hot" | "Must-See";
export type CrowdHeatLabel = "Dead" | "Cold" | "Engaged" | "Hot" | "White Hot";

export interface MatchAnticipation {
  score: number;
  label: AnticipationLabel;
  popularity: number;
  momentum: number;
  skills: number;
  styleAppeal: number;
  calculationLedger?: {
    popularity: CalculationLedgerStage;
    momentum: CalculationLedgerStage;
    skills: CalculationLedgerStage;
    styleAppeal: CalculationLedgerStage;
    total: CalculationLedgerStage;
  };
}

export interface LiveAudienceResult {
  performanceRating: number;
  anticipation: number;
  anticipationLabel: AnticipationLabel;
  crowdBefore: number;
  crowdBeforeLabel: CrowdHeatLabel;
  crowdResponse: number;
  expectationAdjustment: number;
  mentalNightAdjustment?: number;
  finalRating: number;
  crowdAfter: number;
  crowdAfterLabel: CrowdHeatLabel;
  calculationLedger?: {
    expectationAdjustment: CalculationLedgerStage;
    mentalNightAdjustment?: CalculationLedgerStage;
    crowdResponse: CalculationLedgerStage;
    finalRating: CalculationLedgerStage;
    crowdAfter: CalculationLedgerStage;
  };
}
