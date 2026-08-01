export type MatchApproachId =
  | "aerial-showstopper"
  | "big-match-performer"
  | "chain-technician"
  | "dirty-rulebreaker"
  | "hardcore-daredevil"
  | "heavy-striker-brawler"
  | "high-tempo-hybrid"
  | "opportunistic-schemer"
  | "pace-controller"
  | "power-dominance"
  | "psychological-manipulator"
  | "resilient-underdog"
  | "showman"
  | "strong-style-specialist"
  | "submission-specialist";

export type WrestlerSkill =
  | "Aerial"
  | "Athleticism"
  | "Basics"
  | "Brawling"
  | "Charisma"
  | "Consistency"
  | "Flashiness"
  | "Hardcore"
  | "Menace"
  | "Power"
  | "Psychology"
  | "Puroresu"
  | "Resilience"
  | "Safety"
  | "Selling"
  | "Stamina"
  | "Technical"
  | "Toughness";

export interface ApproachSkillWeight {
  skill: WrestlerSkill;
  weight: number;
}

export interface ApproachNarrativePhrases {
  styleSummary: string;
  offensePhrase: string;
  sellingPhrase: string;
  finishPhrase: string;
}

export interface MatchApproachDefinition {
  id: MatchApproachId;
  name: string;
  summary: string;
  formula: ApproachSkillWeight[];
  pace: 0 | 1 | 2 | 3;
  staminaCost: 1 | 2 | 3;
  sourceNames: string[];
  narrative: ApproachNarrativePhrases | null;
  sourceNotes: string[];
}

export type MatchAimId =
  | "call-it-in-the-ring"
  | "comedy-entertainment"
  | "competitive-tv-match"
  | "crowd-work-showcase"
  | "epic-main-event-slow-burn"
  | "elimination"
  | "feature-match"
  | "feud-grudge-match"
  | "hardcore-war"
  | "high-spots-spectacle"
  | "monster-fight-hoss-battle"
  | "open-match"
  | "sprint"
  | "storytelling-match"
  | "strong-style-duel"
  | "survival-chaos"
  | "technical-showcase"
  | "underdog-drama"
  | "wild-brawl";

export interface MatchAimDefinition {
  id: MatchAimId;
  name: string;
  style: string;
  idealPace: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  bestFitStyles: string[];
  clashStyles: string[];
}

export type MentalStateId = "hot-night" | "focused" | "neutral" | "distracted" | "off-night";

export interface MentalStateDefinition {
  id: MentalStateId;
  name: "HOT NIGHT" | "FOCUSED" | "NEUTRAL" | "DISTRACTED" | "OFF NIGHT";
  modifier: number;
  minimumScore: number | null;
}

export type PaceStatus = "IDEAL PACE" | "OPEN PACE" | "OFF PACE" | "NOTICEABLY OFF" | "POOR PACING" | "BAD PACING" | "FAILED";
export type StaminaStatus = "PASS" | "WINDED" | "GASSED" | "DEAD";

export interface PaceEvaluation {
  difference: number;
  status: PaceStatus;
  modifier: number;
}

export interface StaminaEvaluation {
  overBudget: number;
  status: StaminaStatus;
  modifier: number;
}

export interface MatchImportanceProfile {
  name: string;
  sourceApproachCount: number;
  inRingWeight: number;
  bookingWeight: number;
  sourceDurationBand: string;
}

export type AliasStatus = "canonical" | "alias" | "legacy-unmapped";

export interface ApproachAliasRecord {
  sourceName: string;
  normalizedName: string;
  canonicalId: MatchApproachId | null;
  status: AliasStatus;
  note: string;
}

export interface SourceConflictRecord {
  id: string;
  area: string;
  sourceValues: string[];
  canonicalValue: string;
  resolution: string;
}

export interface MentalStateInputs {
  health: number;
  popularity: number;
  experience: number;
  fanReaction: number;
  gimmick: number;
  overall: number;
  luck: number;
  swing: number;
}
