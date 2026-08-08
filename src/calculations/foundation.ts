export const CALCULATION_SYSTEM_VERSION = "wrestling-sim-calculations-6b20c-v3";
export const CONSEQUENCE_CALCULATION_SYSTEM_VERSION = "wrestling-sim-consequences-6b20d-v1";
export const ANGLE_CALCULATION_SYSTEM_VERSION = "wrestling-sim-angles-6b20e-v1";
export const SHOW_CALCULATION_SYSTEM_VERSION = "wrestling-sim-shows-6b20e-v1";
export const COMPETITIVE_CALCULATION_SYSTEM_VERSION = "wrestling-sim-competitive-6b20f-v1";

export interface CalculationFormulaDefinition {
  id: string;
  label: string;
  formula: string;
  capMinimum: number | null;
  capMaximum: number | null;
  roundingPlaces: number;
}

export interface CalculationLedgerTerm {
  id: string;
  label: string;
  input: number;
  weight: number;
  contribution: number;
  detail: string;
}

export interface CalculationLedgerStage {
  formulaId: string;
  label: string;
  formula: string;
  terms: CalculationLedgerTerm[];
  rawSubtotal: number;
  cappedSubtotal: number;
  result: number;
  capMinimum: number | null;
  capMaximum: number | null;
  capApplied: boolean;
  roundingPlaces: number;
  roundingRule: "Nearest";
  notes: string[];
}

/**
 * Calculation formula registry. Runtime calculations read their weights from
 * this object so the written formula and the executed formula cannot drift.
 */
export const CALCULATION_FORMULAS = {
  approachSuitability: {
    id: "approach.suitability",
    label: "Approach recommendation",
    formula: "(Raw approach rating x 75%) + (normalized match suitability x 25%)",
    abilityWeight: 0.75,
    suitabilityWeight: 0.25,
    contextualOffset: 10.5,
    contextualRange: 45,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  approachPlan: {
    id: "approach.plan",
    label: "Approach-plan score",
    formula: "Recommendation totals + (pace modifier x 1.5) + (stamina modifier x 3) + variety + long-match bonus - over-budget penalty",
    paceModifierWeight: 1.5,
    staminaModifierWeight: 3,
    diversityBonus: 3,
    longMatchBonus: 4,
    staminaOverBudgetPenalty: 25,
    capMinimum: null,
    capMaximum: null,
    roundingPlaces: 2,
  },
  mentalBase: {
    id: "performance.mental-base",
    label: "Mental-state base",
    formula: "60 + health adjustment + consistency adjustment + experience adjustment + overall adjustment",
    baseline: 60,
    healthReference: 75,
    healthWeight: 0.06,
    consistencyReference: 60,
    consistencyWeight: 0.08,
    experienceReference: 60,
    experienceWeight: 0.04,
    overallReference: 60,
    overallWeight: 0.04,
    capMinimum: 56,
    capMaximum: 64,
    roundingPlaces: 2,
  },
  mentalScore: {
    id: "performance.mental-score",
    label: "Mental-state score",
    formula: "Mental-state base + random luck + rare swing",
    capMinimum: null,
    capMaximum: null,
    roundingPlaces: 2,
  },
  executionRandomness: {
    luckMinimum: -12,
    luckMaximum: 12,
    swingMagnitude: 18,
    swingBaseProbability: 0.04,
    swingConsistencyDivisor: 2500,
    swingPressureWeight: 0.002,
    consistencyRangeWeight: 1.5,
    botchChanceWeight: 0.22,
    botchChanceMaximumPercent: 18,
    majorIncidentThreshold: 0.9,
    visibleIncidentThreshold: 0.55,
    majorIncidentPenalty: -10,
    visibleIncidentPenalty: -6,
    minorIncidentPenalty: -3,
  },
  approachExecution: {
    id: "performance.approach-execution",
    label: "Approach execution",
    formula: "Approach rating + mental + stamina + (pace x 25%) + consistency + (fit x 18%) + incident",
    paceModifierWeight: 0.25,
    fitWeight: 0.18,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  presentation: {
    id: "performance.presentation",
    label: "Presentation",
    formula: "Overall 24% + popularity 18% + experience 10% + charisma 14% + psychology 14% + selling 10% + fan reaction 6% + gimmick 4%",
    weights: {
      overall: 0.24,
      popularity: 0.18,
      experience: 0.1,
      charisma: 0.14,
      psychology: 0.14,
      selling: 0.1,
      fanReaction: 0.06,
      gimmick: 0.04,
    },
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  performance: {
    id: "performance.individual",
    label: "Individual performance",
    formula: "Approach execution 72% + presentation 28% + importance bonus + momentum form",
    approachExecutionWeight: 0.72,
    presentationWeight: 0.28,
    momentumWeight: 0.06,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  competitive: {
    id: "competitive.individual",
    label: "Competitive score",
    formula: "Performance 55% + psychology 12% + experience 8% + resilience/toughness 8% + finishing 7% + health 10% + all modifiers",
    performanceWeight: 0.55,
    psychologyWeight: 0.12,
    experienceWeight: 0.08,
    resilienceWeight: 0.08,
    finishingWeight: 0.07,
    healthWeight: 0.1,
    storyNeedWeight: 0.4,
    momentumWeight: 0.12,
    bookingWeight: 0.4,
    capMinimum: 0,
    capMaximum: 120,
    roundingPlaces: 2,
  },
  matchQuality: {
    id: "match.raw-quality",
    label: "Raw in-ring match score",
    formula: "Average performance 80% + structure 12% + closeness 8% + chemistry bonus",
    performanceWeight: 0.8,
    structureWeight: 0.12,
    closenessWeight: 0.08,
    chemistryWeight: 0.5,
    structureBaseline: 72,
    structurePaceWeight: 1.2,
    structureStaminaWeight: 2,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  outcomeProbability: {
    id: "competitive.probability",
    label: "Win probability",
    formula: "exp((competitive score - field minimum) / temperature), then divide by total weight",
    temperatureBase: 8,
    volatilityWeight: 0.8,
    capMinimum: 0,
    capMaximum: 1,
    roundingPlaces: 6,
  },
  anticipationField: {
    id: "crowd.anticipation-field",
    label: "Anticipation field component",
    formula: "Participant average 65% + highest participant 35%",
    averageWeight: 0.65,
    maximumWeight: 0.35,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  anticipation: {
    id: "crowd.anticipation",
    label: "Match anticipation",
    formula: "Popularity 35% + momentum 30% + skills 20% + style appeal 15%",
    popularityWeight: 0.35,
    momentumWeight: 0.3,
    skillsWeight: 0.2,
    styleAppealWeight: 0.15,
    participantPopularityWeight: 0.7,
    participantFanReactionWeight: 0.3,
    skillOverallWeight: 0.45,
    skillPsychologyWeight: 0.2,
    skillCharismaWeight: 0.15,
    skillApproachWeight: 0.2,
    styleDefinitionWeight: 0.6,
    styleApproachFitWeight: 0.4,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  expectationAdjustment: {
    id: "crowd.expectation-adjustment",
    label: "Expectation adjustment",
    formula: "Overdelivery x 25% or disappointment x 40%",
    overdeliveryWeight: 0.25,
    disappointmentWeight: 0.4,
    capMinimum: -15,
    capMaximum: 12,
    roundingPlaces: 1,
  },
  crowdResponse: {
    id: "crowd.match-response",
    label: "Live crowd response",
    formula: "Anticipation 55% + incoming crowd 45% + delivery adjustment",
    anticipationWeight: 0.55,
    incomingCrowdWeight: 0.45,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  finalRating: {
    id: "crowd.final-rating",
    label: "Final match rating",
    formula: "Raw performance 60% + live crowd response 40%",
    performanceWeight: 0.6,
    crowdResponseWeight: 0.4,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleExpectationAdjustment: {
    id: "crowd.angle-expectation-adjustment",
    label: "Angle expectation adjustment",
    formula: "Overdelivery x 25% or disappointment x 40%",
    overdeliveryWeight: 0.25,
    disappointmentWeight: 0.4,
    capMinimum: -15,
    capMaximum: 12,
    roundingPlaces: 1,
  },
  angleCrowdResponse: {
    id: "crowd.angle-response",
    label: "Live angle crowd response",
    formula: "Anticipation 55% + incoming crowd 45% + delivery adjustment",
    anticipationWeight: 0.55,
    incomingCrowdWeight: 0.45,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleFinalRating: {
    id: "crowd.angle-final-rating",
    label: "Official angle rating",
    formula: "Raw angle performance 60% + live crowd response 40%",
    performanceWeight: 0.6,
    crowdResponseWeight: 0.4,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleFinalRatingOverride: {
    id: "crowd.angle-final-rating-override",
    label: "Explained official angle override",
    formula: "Recalculated official angle rating + explained override adjustment",
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  crowdMovement: {
    id: "crowd.heat-movement",
    label: "Crowd heat after match",
    formula: "Incoming crowd + ((crowd response - incoming crowd) / 3), with movement capped at +/-12",
    divisor: 3,
    movementMinimum: -12,
    movementMaximum: 12,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleCrowdMovement: {
    id: "crowd.angle-heat-movement",
    label: "Crowd heat after angle",
    formula: "Incoming crowd + ((crowd response - incoming crowd) / 3), with movement capped at +/-12",
    divisor: 3,
    movementMinimum: -12,
    movementMaximum: 12,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  healthRecovery: {
    id: "consequence.health-recovery",
    label: "Health recovery before match",
    formula: "Current profile health - stored post-match health, minimum 0",
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  ordinaryWear: {
    id: "consequence.ordinary-wear",
    label: "Ordinary match wear",
    formula: "Duration x 0.035 + stamina cost x 0.12 + excess pace x 0.15 + stamina-state penalty",
    durationWeight: 0.035,
    staminaCostWeight: 0.12,
    excessPaceWeight: 0.15,
    staminaPenalties: { PASS: 0, WINDED: 0.75, GASSED: 2, DEAD: 4 },
    capMinimum: 0.4,
    capMaximum: 5.5,
    roundingPlaces: 2,
  },
  incidentDamage: {
    id: "consequence.incident-damage",
    label: "Incident damage",
    formula: "Visible botch +3 or major execution incident +8",
    visibleBotchPenalty: 3,
    majorIncidentPenalty: 8,
    capMinimum: 0,
    capMaximum: 8,
    roundingPlaces: 2,
  },
  fatigueRecovery: {
    id: "consequence.fatigue-recovery",
    label: "Fatigue recovery before match",
    formula: "Two fatigue points per full rest day between official show dates, capped by stored fatigue",
    recoveryPerFullRestDay: 2,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 2,
  },
  fatigueGain: {
    id: "consequence.fatigue-gain",
    label: "Match fatigue gained",
    formula: "Duration x 0.25 + stamina cost x 0.60 + excess pace x 0.50 + stamina-state penalty",
    durationWeight: 0.25,
    staminaCostWeight: 0.6,
    excessPaceWeight: 0.5,
    staminaPenalties: { PASS: 0, WINDED: 2, GASSED: 5, DEAD: 9 },
    capMinimum: 2,
    capMaximum: 25,
    roundingPlaces: 2,
  },
  momentumConsequence: {
    id: "consequence.momentum",
    label: "Momentum change",
    formula: "Result + upset + performance leadership + performance versus expectation",
    winChange: 3,
    lossChange: -3,
    upsetWinChange: 2,
    performanceLeaderChange: 1,
    expectationDivisor: 8,
    expectationMinimum: -2,
    expectationMaximum: 2,
    capMinimum: -6,
    capMaximum: 6,
    roundingPlaces: 2,
  },
  popularityConsequence: {
    id: "consequence.popularity",
    label: "Popularity change",
    formula: "(Performance - current popularity) / 25 + result adjustment",
    performanceGapWeight: 0.04,
    winChange: 0.3,
    lossChange: -0.1,
    capMinimum: -2,
    capMaximum: 2,
    roundingPlaces: 2,
  },
  rankingConsequence: {
    id: "consequence.ranking",
    label: "Ranking-points change",
    formula: "Result base + raw in-ring quality + official upset + performance leadership",
    winBase: 3,
    lossBase: -1,
    drawBase: 1,
    qualityThreshold: 60,
    qualityDivisor: 20,
    winnerQualityWeight: 1,
    loserQualityWeight: 0.4,
    drawQualityWeight: 0.5,
    upsetWinChange: 2,
    winnerLeaderChange: 0.5,
    loserLeaderChange: 1.25,
    capMinimum: null,
    capMaximum: null,
    roundingPlaces: 2,
  },
  angleParticipantExecution: {
    id: "angle.participant-execution",
    label: "Participant execution",
    formula: "Role-weighted participant average 70% + strongest performer 30%",
    averageWeight: 0.7,
    maximumWeight: 0.3,
    roleWeights: { Speaking: 1, Physical: 1, Reaction: 1, Presence: 0.6 },
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleRolePerformance: {
    id: "angle.role-performance",
    label: "Individual role performance",
    formula: "Role-specific skill, popularity, and normalized gimmick inputs",
    weights: {
      Speaking: { Charisma: 0.35, Psychology: 0.25, popularity: 0.25, gimmick: 0.15 },
      Physical: { Menace: 0.35, Brawling: 0.25, Charisma: 0.2, popularity: 0.2 },
      Reaction: { Selling: 0.35, Charisma: 0.25, Psychology: 0.2, popularity: 0.2 },
      Presence: { Charisma: 0.25, Menace: 0.25, popularity: 0.3, gimmick: 0.2 },
    },
    gimmickScale: 20,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleStructure: {
    id: "angle.structure",
    label: "Angle structure",
    formula: "50 base + duration + purpose + audience takeaway + one storyline connection",
    baseline: 50,
    idealDurationBonus: 10,
    acceptableDurationAdjustment: 0,
    longDurationPenalty: -10,
    extremeDurationPenalty: -20,
    purposeBonus: 10,
    missingPurposePenalty: -10,
    takeawayBonus: 8,
    missingTakeawayPenalty: -4,
    storylineBonus: 5,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleRawPerformance: {
    id: "angle.raw-performance",
    label: "Raw angle performance",
    formula: "Participant execution 80% + angle structure 20%",
    executionWeight: 0.8,
    structureWeight: 0.2,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleRawPerformanceOverride: {
    id: "angle.raw-performance-override",
    label: "Overridden raw angle performance",
    formula: "Raw performance derived from the explained official-rating override",
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleStoryStakes: {
    id: "angle.story-stakes",
    label: "Story stakes",
    formula: "50 base + high stakes + physical conflict + one storyline + show importance + placement",
    baseline: 50,
    highStakesBonus: 12,
    physicalConflictBonus: 8,
    storylineBonus: 5,
    importanceWeights: { major: 8, special: 5, television: 2, standard: 0, house: -3 },
    mainEventBonus: 8,
    prePostPenalty: -8,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleAnticipation: {
    id: "angle.anticipation",
    label: "Angle anticipation",
    formula: "Popularity 40% + momentum 25% + fan reaction and gimmick 15% + story stakes 20%",
    popularityWeight: 0.4,
    momentumWeight: 0.25,
    fanPresentationWeight: 0.15,
    storyStakesWeight: 0.2,
    fanReactionWeight: 0.5,
    gimmickWeight: 0.5,
    fivePointScale: 20,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleCreditedPerformance: {
    id: "angle.credited-performance",
    label: "Participant credited performance",
    formula: "Individual role performance 70% + final raw angle performance 30%",
    individualWeight: 0.7,
    angleWeight: 0.3,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  angleMomentumConsequence: {
    id: "angle.consequence-momentum",
    label: "Angle momentum change",
    formula: "(Credited performance - anticipation) / 10",
    divisor: 10,
    capMinimum: -3,
    capMaximum: 3,
    roundingPlaces: 1,
  },
  anglePopularityConsequence: {
    id: "angle.consequence-popularity",
    label: "Angle popularity change",
    formula: "(Credited performance - current popularity) / 25",
    divisor: 25,
    capMinimum: -1.5,
    capMaximum: 1.5,
    roundingPlaces: 1,
  },
  showDurationWeight: {
    id: "show.duration-weight",
    label: "Segment duration weight",
    formula: "0.5 + (minutes / 20), capped 0.6-1.5",
    baseline: 0.5,
    divisor: 20,
    capMinimum: 0.6,
    capMaximum: 1.5,
    roundingPlaces: 2,
  },
  showOverallRating: {
    id: "show.overall-rating",
    label: "Overall show rating",
    formula: "Weighted average of official segment ratings",
    mainShowWeight: 1,
    prePostShowWeight: 0.5,
    mainEventWeight: 1.4,
    standardSegmentWeight: 1,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  showExpectedScore: {
    id: "show.expected-score",
    label: "Expected show score",
    formula: "48 + promotion popularity 18% + prestige 12% + show importance, capped 45-82",
    baseline: 48,
    popularityWeight: 0.18,
    prestigeWeight: 0.12,
    capMinimum: 45,
    capMaximum: 82,
    roundingPlaces: 1,
  },
  showPromotionStrength: {
    id: "show.promotion-strength",
    label: "Promotion strength",
    formula: "Prestige 55% + company-size score 35% + promotion momentum 10%",
    prestigeWeight: 0.55,
    sizeWeight: 0.35,
    momentumWeight: 0.1,
    sizeScores: { insignificant: 15, tiny: 25, local: 25, small: 40, regional: 45, medium: 55, big: 70, national: 75, large: 82, huge: 90, international: 92, global: 100, titanic: 100 },
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  showStartingCrowd: {
    id: "show.starting-crowd",
    label: "Starting crowd heat",
    formula: "42 + promotion popularity 15% + show importance x 2.5",
    baseline: 42,
    popularityWeight: 0.15,
    importanceWeight: 2.5,
    capMinimum: 35,
    capMaximum: 70,
    roundingPlaces: 1,
  },
  showExpectedCardStrength: {
    id: "show.expected-card-strength",
    label: "Expected card strength",
    formula: "Unique participant average of overall 45% + popularity 35% + momentum 10% + health 10%",
    overallWeight: 0.45,
    popularityWeight: 0.35,
    momentumWeight: 0.1,
    healthWeight: 0.1,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  showPopularityConsequence: {
    id: "show.popularity-change",
    label: "Promotion popularity change",
    formula: "(Overall rating - expected show score) / 10, capped +/-2.5",
    divisor: 10,
    capMinimum: -2.5,
    capMaximum: 2.5,
    roundingPlaces: 1,
  },
  showAttendanceDemand: {
    id: "show.attendance-demand",
    label: "Attendance demand",
    formula: "Size baseline x popularity x market x card x recent performance x importance x momentum",
    popularityBase: 0.45,
    popularityRange: 0.75,
    marketBase: 0.55,
    marketRange: 0.9,
    cardBase: 0.75,
    cardRange: 0.5,
    recentBase: 0.85,
    recentRange: 0.3,
    importanceFactors: { major: 1.35, special: 1.18, television: 1, standard: 0.9, house: 0.75 },
    momentumBase: 0.8,
    momentumRange: 0.4,
    baselineThresholds: [
      { minimum: 95, value: 50000 }, { minimum: 85, value: 25000 }, { minimum: 78, value: 12000 },
      { minimum: 65, value: 6000 }, { minimum: 50, value: 2500 }, { minimum: 35, value: 1000 },
      { minimum: 20, value: 400 }, { minimum: 0, value: 150 },
    ],
    capMinimum: 50,
    capMaximum: null,
    roundingPlaces: 0,
  },
  starRating: {
    id: "display.star-rating",
    label: "Star rating",
    formula: "(Official rating - 20) / 15, capped 0-5 and rounded to the nearest quarter star",
    scoreOffset: 20,
    scoreDivisor: 15,
    step: 0.25,
    capMinimum: 0,
    capMaximum: 5,
    roundingPlaces: 2,
  },
} as const;

export type CalculationProvenance = "Imported" | "Manually Entered" | "Estimated Baseline";
export type CalculationQualityLabel = "Elite" | "Strong" | "Capable" | "Developing" | "Weak";

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function roundCalculation(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(finiteNumber(value) * scale) / scale;
}

export function clampCalculation(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, minimum)));
}

export function normalizeRating(value: number, places = 2): number {
  return roundCalculation(clampCalculation(value), places);
}

export function createCalculationTerm(
  id: string,
  label: string,
  input: number,
  weight = 1,
  detail = "",
): CalculationLedgerTerm {
  return {
    id,
    label,
    input: roundCalculation(input, 6),
    weight: roundCalculation(weight, 6),
    contribution: roundCalculation(input * weight, 6),
    detail,
  };
}

export function createCalculationStage(
  definition: CalculationFormulaDefinition,
  terms: CalculationLedgerTerm[],
  options: { rawSubtotal?: number; notes?: string[] } = {},
): CalculationLedgerStage {
  const raw = options.rawSubtotal ?? terms.reduce((total, term) => total + term.contribution, 0);
  const minimum = definition.capMinimum;
  const maximum = definition.capMaximum;
  const capped = Math.max(minimum ?? Number.NEGATIVE_INFINITY, Math.min(maximum ?? Number.POSITIVE_INFINITY, raw));
  return {
    formulaId: definition.id,
    label: definition.label,
    formula: definition.formula,
    terms,
    rawSubtotal: roundCalculation(raw, 6),
    cappedSubtotal: roundCalculation(capped, 6),
    result: roundCalculation(capped, definition.roundingPlaces),
    capMinimum: minimum,
    capMaximum: maximum,
    capApplied: Math.abs(raw - capped) > 0.0000001,
    roundingPlaces: definition.roundingPlaces,
    roundingRule: "Nearest",
    notes: options.notes ?? [],
  };
}

export interface SuitabilityComponents {
  style: number;
  aim: number;
  pace: number;
  stamina: number;
  opponent?: number;
}

export interface SuitabilityBreakdown {
  contextualTotal: number;
  contextualScore: number;
  ratingContribution: number;
  suitabilityContribution: number;
  total: number;
}

export function calculateSuitabilityBreakdown(rating: number, components: SuitabilityComponents): SuitabilityBreakdown {
  const formula = CALCULATION_FORMULAS.approachSuitability;
  const contextualTotal = components.style + components.aim + components.pace + components.stamina + (components.opponent ?? 0);
  const contextualScore = clampCalculation(((contextualTotal + formula.contextualOffset) / formula.contextualRange) * 100);
  const ratingContribution = normalizeRating(rating) * formula.abilityWeight;
  const suitabilityContribution = contextualScore * formula.suitabilityWeight;
  return {
    contextualTotal: roundCalculation(contextualTotal),
    contextualScore: roundCalculation(contextualScore),
    ratingContribution: roundCalculation(ratingContribution),
    suitabilityContribution: roundCalculation(suitabilityContribution),
    total: normalizeRating(ratingContribution + suitabilityContribution),
  };
}

/** Seventy-five percent ability and twenty-five percent match-specific fit. */
export function calculateSuitability(rating: number, components: SuitabilityComponents): number {
  return calculateSuitabilityBreakdown(rating, components).total;
}

export function calculateStarRating(matchScore: number): number {
  const formula = CALCULATION_FORMULAS.starRating;
  const raw = clampCalculation((matchScore - formula.scoreOffset) / formula.scoreDivisor, formula.capMinimum, formula.capMaximum);
  return Math.round(raw / formula.step) * formula.step;
}

export function calculationQualityLabel(value: number): CalculationQualityLabel {
  const rating = clampCalculation(value);
  if (rating >= 85) return "Elite";
  if (rating >= 75) return "Strong";
  if (rating >= 65) return "Capable";
  if (rating >= 50) return "Developing";
  return "Weak";
}
