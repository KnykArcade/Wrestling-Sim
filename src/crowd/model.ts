import { MATCH_AIMS } from "../matchEngine/catalog";
import { CALCULATION_FORMULAS, createCalculationStage, createCalculationTerm } from "../calculations/foundation";
import {
  calculateApproachRating,
  getApproach,
  getWrestlerStyle,
  profileApproachRatingInputs,
  scoreApproachCandidate,
} from "../matchEngine/model";
import type { MatchAimId, MatchEngineProfile, MatchWorkerApproachPlan } from "../matchEngine/types";
import type { PlannedSegment } from "../planner/types";
import type { AnticipationLabel, CrowdHeatLabel, LiveAudienceResult, MatchAnticipation, MomentumLabel } from "./types";

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function round(value: number, places = 1): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function fieldValue(values: number[], label: string) {
  const formula = CALCULATION_FORMULAS.anticipationField;
  if (!values.length) {
    const ledger = createCalculationStage(formula, [createCalculationTerm("fallback", `${label} fallback`, 50)], { notes: ["No participant values were available, so the neutral 50 baseline was used."] });
    return { value: 50, ledger };
  }
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const maximum = Math.max(...values);
  const ledger = createCalculationStage(formula, [
    createCalculationTerm("average", `${label} participant average`, average, formula.averageWeight),
    createCalculationTerm("maximum", `${label} highest participant`, maximum, formula.maximumWeight),
  ], { notes: [`Participant values: ${values.map((value) => round(value)).join(", ")}.`] });
  return { value: ledger.result, ledger };
}

export function momentumLabel(value: number): MomentumLabel {
  const rating = clamp(value);
  if (rating >= 80) return "White Hot";
  if (rating >= 60) return "Hot";
  if (rating >= 40) return "Even";
  if (rating >= 20) return "Cold";
  return "Ice Cold";
}

export function anticipationLabel(value: number): AnticipationLabel {
  const rating = clamp(value);
  if (rating >= 80) return "Must-See";
  if (rating >= 60) return "Hot";
  if (rating >= 40) return "Interested";
  if (rating >= 20) return "Low Interest";
  return "No Interest";
}

export function crowdHeatLabel(value: number): CrowdHeatLabel {
  const rating = clamp(value);
  if (rating >= 80) return "White Hot";
  if (rating >= 60) return "Hot";
  if (rating >= 40) return "Engaged";
  if (rating >= 20) return "Cold";
  return "Dead";
}

export function calculateMatchAnticipation(input: {
  profiles: MatchEngineProfile[];
  plans: MatchWorkerApproachPlan[];
  aimId: MatchAimId;
}): MatchAnticipation {
  const formula = CALCULATION_FORMULAS.anticipation;
  const aim = MATCH_AIMS.find((item) => item.id === input.aimId) ?? MATCH_AIMS[0];
  const plans = new Map(input.plans.map((plan) => [plan.workerKey, plan]));
  const popularityValues = input.profiles.map((profile) => clamp(profile.popularity * formula.participantPopularityWeight + profile.fanReaction * 20 * formula.participantFanReactionWeight));
  const momentumValues = input.profiles.map((profile) => clamp(profile.momentum));
  const skillValues = input.profiles.map((profile) => {
    const plan = plans.get(profile.workerKey);
    const approachRatings = plan?.selectedApproachIds.flatMap((id) => {
      const approach = getApproach(id);
      return approach ? [calculateApproachRating(approach, profileApproachRatingInputs(profile))] : [];
    }) ?? [];
    const approachScore = approachRatings.length ? approachRatings.reduce((total, value) => total + value, 0) / approachRatings.length : profile.overall;
    return clamp(profile.overall * formula.skillOverallWeight + profile.skills.Psychology * formula.skillPsychologyWeight + profile.skills.Charisma * formula.skillCharismaWeight + approachScore * formula.skillApproachWeight);
  });
  const styleValues = input.profiles.map((profile) => {
    const style = getWrestlerStyle(profile);
    const styleFit = style.aimBoosts.includes(aim.id)
      ? 82
      : style.aimStyleNames.some((name) => aim.bestFitStyles.includes(name))
        ? 70
        : style.aimStyleNames.some((name) => aim.clashStyles.includes(name))
          ? 30
          : 50;
    const selected = plans.get(profile.workerKey)?.selectedApproachIds ?? [];
    const approachFit = selected.length
      ? selected.reduce((total, id) => {
          const approach = getApproach(id);
          return total + (approach ? clamp(50 + scoreApproachCandidate(profile, aim.id, approach).aimCompatibility * 4) : 50);
        }, 0) / selected.length
      : 50;
    return clamp(styleFit * formula.styleDefinitionWeight + approachFit * formula.styleApproachFitWeight);
  });
  const popularityResult = fieldValue(popularityValues, "Popularity");
  const momentumResult = fieldValue(momentumValues, "Momentum");
  const skillsResult = fieldValue(skillValues, "Skills");
  const styleResult = fieldValue(styleValues, "Style appeal");
  const popularity = popularityResult.value;
  const momentum = momentumResult.value;
  const skills = skillsResult.value;
  const styleAppeal = styleResult.value;
  const total = createCalculationStage(formula, [
    createCalculationTerm("popularity", "Popularity field", popularity, formula.popularityWeight),
    createCalculationTerm("momentum", "Momentum field", momentum, formula.momentumWeight),
    createCalculationTerm("skills", "Skills field", skills, formula.skillsWeight),
    createCalculationTerm("style", "Style appeal field", styleAppeal, formula.styleAppealWeight),
  ], { notes: ["Each field first favors both the participant average and the match's highest-rated star."] });
  const score = total.result;
  return {
    score,
    label: anticipationLabel(score),
    popularity,
    momentum,
    skills,
    styleAppeal,
    calculationLedger: {
      popularity: popularityResult.ledger,
      momentum: momentumResult.ledger,
      skills: skillsResult.ledger,
      styleAppeal: styleResult.ledger,
      total,
    },
  };
}

export function calculateLiveMatchAudience(performanceRating: number, anticipation: number, crowdBefore: number): LiveAudienceResult {
  const expectationFormula = CALCULATION_FORMULAS.expectationAdjustment;
  const responseFormula = CALCULATION_FORMULAS.crowdResponse;
  const finalFormula = CALCULATION_FORMULAS.finalRating;
  const movementFormula = CALCULATION_FORMULAS.crowdMovement;
  const performance = clamp(performanceRating);
  const expected = clamp(anticipation);
  const incoming = clamp(crowdBefore);
  const expectationLedger = createCalculationStage(expectationFormula, [
    createCalculationTerm("performance-gap", "Performance above/below anticipation", performance - expected, expectationFormula.differenceWeight),
  ]);
  const expectationAdjustment = expectationLedger.result;
  const responseLedger = createCalculationStage(responseFormula, [
    createCalculationTerm("performance", "Raw in-ring performance", performance, responseFormula.performanceWeight),
    createCalculationTerm("anticipation", "Anticipation", expected, responseFormula.anticipationWeight),
    createCalculationTerm("incoming", "Incoming crowd heat", incoming, responseFormula.incomingCrowdWeight),
    createCalculationTerm("expectation", "Expectation adjustment", expectationAdjustment),
  ]);
  const crowdResponse = responseLedger.result;
  const finalLedger = createCalculationStage(finalFormula, [
    createCalculationTerm("performance", "Raw in-ring performance", performance, finalFormula.performanceWeight),
    createCalculationTerm("crowd-response", "Live crowd response", crowdResponse, finalFormula.crowdResponseWeight),
  ], { notes: ["This final rating replaces the raw in-ring rating only after the result is locked into the live card."] });
  const finalRating = finalLedger.result;
  const uncappedMovement = (crowdResponse - incoming) / movementFormula.divisor;
  const movement = clamp(uncappedMovement, movementFormula.movementMinimum, movementFormula.movementMaximum);
  const crowdAfterLedger = createCalculationStage(movementFormula, [
    createCalculationTerm("incoming", "Incoming crowd heat", incoming),
    createCalculationTerm("movement", "Capped crowd movement", movement),
  ], { notes: [`Uncapped movement ${(uncappedMovement >= 0 ? "+" : "")}${round(uncappedMovement)} is capped between ${movementFormula.movementMinimum} and +${movementFormula.movementMaximum}.`] });
  const crowdAfter = crowdAfterLedger.result;
  return {
    performanceRating: round(performance),
    anticipation: round(expected),
    anticipationLabel: anticipationLabel(expected),
    crowdBefore: round(incoming),
    crowdBeforeLabel: crowdHeatLabel(incoming),
    crowdResponse,
    expectationAdjustment,
    finalRating,
    crowdAfter,
    crowdAfterLabel: crowdHeatLabel(crowdAfter),
    calculationLedger: {
      expectationAdjustment: expectationLedger,
      crowdResponse: responseLedger,
      finalRating: finalLedger,
      crowdAfter: crowdAfterLedger,
    },
  };
}

export function projectedCrowdBeforeForSegment(input: {
  segments: PlannedSegment[];
  segmentId: string;
  profiles: MatchEngineProfile[];
  crowdStart?: number;
}): number {
  let crowd = round(clamp(input.crowdStart ?? 50));
  for (const segment of input.segments) {
    if (segment.id === input.segmentId) break;
    if (segment.type !== "match" || !segment.matchApproachSetup.performancePreview) continue;
    const profileKeys = new Set(segment.workers.map((worker) => `${worker.source}:${worker.id}`));
    const profiles = input.profiles.filter((profile) => profileKeys.has(profile.workerKey));
    if (profiles.length < 2) continue;
    const anticipation = calculateMatchAnticipation({
      profiles,
      plans: segment.matchApproachSetup.workerPlans,
      aimId: segment.matchApproachSetup.matchAimId,
    });
    crowd = calculateLiveMatchAudience(segment.matchApproachSetup.performancePreview.matchScore, anticipation.score, crowd).crowdAfter;
  }
  return crowd;
}

export function calculateLiveAngleAudience(performanceRating: number, crowdBefore: number): LiveAudienceResult {
  const performance = clamp(performanceRating);
  const incoming = clamp(crowdBefore);
  const crowdResponse = round(clamp(performance * .8 + incoming * .2));
  const finalRating = round(clamp(performance * .8 + crowdResponse * .2));
  const movement = clamp((crowdResponse - incoming) / 3, -12, 12);
  const crowdAfter = round(clamp(incoming + movement));
  const expectationLedger = createCalculationStage({ id: "crowd.angle-expectation", label: "Angle expectation adjustment", formula: "Angles do not use match anticipation", capMinimum: null, capMaximum: null, roundingPlaces: 1 }, [createCalculationTerm("adjustment", "Expectation adjustment", 0)]);
  const responseLedger = createCalculationStage({ id: "crowd.angle-response", label: "Angle crowd response", formula: "Angle performance 80% + incoming crowd 20%", capMinimum: 0, capMaximum: 100, roundingPlaces: 1 }, [createCalculationTerm("performance", "Angle performance", performance, .8), createCalculationTerm("incoming", "Incoming crowd heat", incoming, .2)]);
  const finalLedger = createCalculationStage({ id: "crowd.angle-final", label: "Final angle rating", formula: "Angle performance 80% + crowd response 20%", capMinimum: 0, capMaximum: 100, roundingPlaces: 1 }, [createCalculationTerm("performance", "Angle performance", performance, .8), createCalculationTerm("response", "Crowd response", crowdResponse, .2)]);
  const crowdAfterLedger = createCalculationStage(CALCULATION_FORMULAS.crowdMovement, [createCalculationTerm("incoming", "Incoming crowd heat", incoming), createCalculationTerm("movement", "Capped crowd movement", movement)]);
  return {
    performanceRating: round(performance),
    anticipation: round(performance),
    anticipationLabel: anticipationLabel(performance),
    crowdBefore: round(incoming),
    crowdBeforeLabel: crowdHeatLabel(incoming),
    crowdResponse,
    expectationAdjustment: 0,
    finalRating,
    crowdAfter,
    crowdAfterLabel: crowdHeatLabel(crowdAfter),
    calculationLedger: { expectationAdjustment: expectationLedger, crowdResponse: responseLedger, finalRating: finalLedger, crowdAfter: crowdAfterLedger },
  };
}
