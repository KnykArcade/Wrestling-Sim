export type MatchApproachId =
  | "aerial-showstopper"
  | "big-match-performer"
  | "chain-technician"
  | "counter-specialist"
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

export type ApproachFormulaSource = WrestlerSkill | "Experience" | "Crowd Work";

export interface ApproachSkillWeight {
  skill: ApproachFormulaSource;
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
  | "squash-dominant-showcase"
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

export type WrestlerStyleId =
  | "all-rounder"
  | "brawler"
  | "comedy-performer"
  | "daredevil"
  | "entertainer"
  | "high-flyer"
  | "heavyweight-powerhouse"
  | "hybrid-technician-flyer"
  | "hybrid-technician-striker"
  | "impact-striker"
  | "luchador"
  | "mma-crossover"
  | "pure-technician"
  | "resilient-underdog"
  | "show-stealer-workhorse";

export interface WrestlerStyleDefinition {
  id: WrestlerStyleId;
  name: string;
  summary: string;
  approachBoosts: MatchApproachId[];
  aimBoosts: MatchAimId[];
  aimStyleNames: string[];
}

export interface MatchEngineProfile {
  id: string;
  workerKey: string;
  workerId: string;
  workerName: string;
  workerSource: "tew" | "manual";
  styleId: WrestlerStyleId;
  overall: number;
  health: number;
  popularity: number;
  momentum: number;
  experience: number;
  fanReaction: number;
  gimmick: number;
  skills: Record<WrestlerSkill, number>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchEngineUniverse {
  profiles: MatchEngineProfile[];
}

export type ApproachPlanMode = "AI" | "Manual";

export interface MatchWorkerApproachPlan {
  workerKey: string;
  workerName: string;
  selectedApproachIds: MatchApproachId[];
  lockedApproachIds: MatchApproachId[];
  mode: ApproachPlanMode;
  generatedAt: string;
}

export type MatchOutcomeAuthority = "tew-authoritative" | "booker-selected" | "competitive-preview";

export interface MatchPerformanceSettings {
  authority: MatchOutcomeAuthority;
  volatility: number;
  bookingInfluence: number;
}

export interface MatchWorkerPerformanceResult {
  workerKey: string;
  workerName: string;
  mentalStateId: MentalStateId;
  mentalStateName: MentalStateDefinition["name"];
  mentalStateScore: number;
  mentalModifier: number;
  luck: number;
  swing: number;
  consistencyVariance: number;
  averageApproachRating: number;
  approachExecution: number;
  presentationScore: number;
  staminaStatus: StaminaStatus;
  staminaModifier: number;
  paceStatus: PaceStatus;
  paceModifier: number;
  performanceScore: number;
  competitiveScore: number;
  winProbability: number;
}

export interface MatchPerformancePreview {
  id: string;
  generatedAt: string;
  seed: string;
  authority: MatchOutcomeAuthority;
  calculationVersion: string;
  matchScore: number;
  starRating: number;
  performanceLeaderKey: string;
  performanceLeaderName: string;
  projectedWinnerKey: string;
  projectedWinnerName: string;
  confidence: number;
  summary: string;
  workerResults: MatchWorkerPerformanceResult[];
}

export interface MatchApproachSetup {
  matchAimId: MatchAimId;
  approachLimit: number | null;
  workerPlans: MatchWorkerApproachPlan[];
  notes: string;
  performanceSettings: MatchPerformanceSettings;
  performancePreview: MatchPerformancePreview | null;
  updatedAt: string;
}

export interface ApproachCandidateScore {
  approachId: MatchApproachId;
  rating: number;
  styleBonus: number;
  aimCompatibility: number;
  paceBonus: number;
  staminaEfficiency: number;
  opponentCompatibility: number;
  total: number;
  reasons: string[];
}

export interface ApproachPlanResult {
  selectedApproachIds: MatchApproachId[];
  candidateScores: ApproachCandidateScore[];
  totalScore: number;
  usedStamina: number;
  availableStamina: number;
  stamina: StaminaEvaluation;
  actualPace: number;
  pace: PaceEvaluation;
  explanation: string[];
}
