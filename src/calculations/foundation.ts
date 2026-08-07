export const CALCULATION_SYSTEM_VERSION = "wrestling-sim-calculations-6b20b-v2";

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
 * Phase 6B20A formula registry. Runtime calculations read their weights from
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
    formula: "Approach execution 72% + presentation 28% + importance bonus",
    approachExecutionWeight: 0.72,
    presentationWeight: 0.28,
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
    formula: "Popularity 40% + momentum 25% + skills 20% + style appeal 15%",
    popularityWeight: 0.4,
    momentumWeight: 0.25,
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
    formula: "(Raw performance - anticipation) x 20%",
    differenceWeight: 0.2,
    capMinimum: -6,
    capMaximum: 6,
    roundingPlaces: 1,
  },
  crowdResponse: {
    id: "crowd.match-response",
    label: "Live crowd response",
    formula: "Raw performance 50% + anticipation 30% + incoming crowd 20% + expectation adjustment",
    performanceWeight: 0.5,
    anticipationWeight: 0.3,
    incomingCrowdWeight: 0.2,
    capMinimum: 0,
    capMaximum: 100,
    roundingPlaces: 1,
  },
  finalRating: {
    id: "crowd.final-rating",
    label: "Final match rating",
    formula: "Raw performance 70% + live crowd response 30%",
    performanceWeight: 0.7,
    crowdResponseWeight: 0.3,
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
