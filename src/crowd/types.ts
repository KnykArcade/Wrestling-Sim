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
}

export interface LiveAudienceResult {
  performanceRating: number;
  anticipation: number;
  anticipationLabel: AnticipationLabel;
  crowdBefore: number;
  crowdBeforeLabel: CrowdHeatLabel;
  crowdResponse: number;
  expectationAdjustment: number;
  finalRating: number;
  crowdAfter: number;
  crowdAfterLabel: CrowdHeatLabel;
}
