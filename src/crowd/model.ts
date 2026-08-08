import { MATCH_AIMS } from "../matchEngine/catalog";
import { CALCULATION_FORMULAS, createCalculationStage, createCalculationTerm } from "../calculations/foundation";
import {
  calculateApproachRating,
  getApproach,
  getWrestlerStyle,
  profileApproachRatingInputs,
  scoreApproachCandidate,
} from "../matchEngine/model";
import type { MatchAimId, MatchEngineProfile, MatchWorkerApproachPlan, MentalStateDefinition } from "../matchEngine/types";
import { currentPerformancePreview } from "../matchEngine/previewIntegrity";
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

export function calculateMentalNightAdjustment(mentalStates: MentalStateDefinition["name"][]) {
  const formula = CALCULATION_FORMULAS.crowdMentalNight;
  const values = mentalStates.map((state) => formula.stateValues[state] ?? 0);
  const fieldScale = Math.min(formula.fieldScaleMaximum, values.length);
  const averageValue = values.length ? values.reduce<number>((total, value) => total + value, 0) / values.length : 0;
  const hotCount = mentalStates.filter((state) => state === "HOT NIGHT").length;
  const focusedCount = mentalStates.filter((state) => state === "FOCUSED").length;
  const negativeCount = mentalStates.filter((state) => state === "DISTRACTED" || state === "OFF NIGHT").length;
  const combinedAdjustment = hotCount >= 2
    ? formula.twoHotBonus
    : focusedCount >= 2
      ? formula.twoFocusedBonus
      : negativeCount >= 2
        ? formula.twoNegativePenalty
        : 0;
  return createCalculationStage(formula, [
    createCalculationTerm("field", "Average participant mental-night value", averageValue, fieldScale, mentalStates.length ? mentalStates.join(", ") : "No mental-night states were supplied."),
    createCalculationTerm("combined", combinedAdjustment > 0 ? "Combined strong-night bonus" : combinedAdjustment < 0 ? "Combined poor-night penalty" : "Combined-night adjustment", combinedAdjustment),
  ], { notes: [
    hotCount >= 2 ? "At least two HOT NIGHT performances amplify the crowd surge." :
      focusedCount >= 2 ? "At least two FOCUSED performances create a combined crowd boost." :
        negativeCount >= 2 ? "Multiple poor mental nights compound the crowd drop." : "No combined-night bonus or penalty applied.",
  ] });
}

export function calculateLiveMatchAudience(
  performanceRating: number,
  anticipation: number,
  crowdBefore: number,
  mentalStates: MentalStateDefinition["name"][] = [],
): LiveAudienceResult {
  const expectationFormula = CALCULATION_FORMULAS.expectationAdjustment;
  const responseFormula = CALCULATION_FORMULAS.crowdResponse;
  const finalFormula = CALCULATION_FORMULAS.finalRating;
  const movementFormula = CALCULATION_FORMULAS.crowdMovement;
  const performance = clamp(performanceRating);
  const expected = clamp(anticipation);
  const incoming = clamp(crowdBefore);
  const performanceGap = performance - expected;
  const deliveryWeight = performanceGap >= 0 ? expectationFormula.overdeliveryWeight : expectationFormula.disappointmentWeight;
  const expectationLedger = createCalculationStage(expectationFormula, [
    createCalculationTerm("performance-gap", performanceGap >= 0 ? "Performance above anticipation" : "Performance below anticipation", performanceGap, deliveryWeight),
  ], { notes: [performanceGap >= 0
    ? `Overdelivery earns ${expectationFormula.overdeliveryWeight * 100}% of the positive performance gap, capped at +${expectationFormula.capMaximum}.`
    : `Disappointment loses ${expectationFormula.disappointmentWeight * 100}% of the negative performance gap, capped at ${expectationFormula.capMinimum}.`,
  ] });
  const expectationAdjustment = expectationLedger.result;
  const mentalNightLedger = calculateMentalNightAdjustment(mentalStates);
  const mentalNightAdjustment = mentalNightLedger.result;
  const responseLedger = createCalculationStage(responseFormula, [
    createCalculationTerm("anticipation", "Anticipation", expected, responseFormula.anticipationWeight),
    createCalculationTerm("incoming", "Incoming crowd heat", incoming, responseFormula.incomingCrowdWeight),
    createCalculationTerm("expectation", "Delivery adjustment", expectationAdjustment),
    createCalculationTerm("mental-night", "Mental-night adjustment", mentalNightAdjustment),
  ], { notes: ["Raw in-ring performance affects crowd response through expectation delivery, while the participants' combined mental nights directly amplify or suppress the live reaction."] });
  const crowdResponse = responseLedger.result;
  const finalLedger = createCalculationStage(finalFormula, [
    createCalculationTerm("performance", "Raw in-ring performance", performance, finalFormula.performanceWeight),
    createCalculationTerm("crowd-response", "Live crowd response", crowdResponse, finalFormula.crowdResponseWeight),
  ], { notes: ["The official rating keeps raw wrestling quality and live audience response as separate 60% and 40% lanes, and replaces the raw in-ring rating only after the result is locked into the live card."] });
  const finalRating = finalLedger.result;
  const responseGap = crowdResponse - incoming;
  const movementDivisor = responseGap >= 0 ? movementFormula.positiveDivisor : movementFormula.negativeDivisor;
  const uncappedMovement = responseGap / movementDivisor;
  const movement = clamp(uncappedMovement, movementFormula.movementMinimum, movementFormula.movementMaximum);
  const crowdAfterLedger = createCalculationStage(movementFormula, [
    createCalculationTerm("incoming", "Incoming crowd heat", incoming),
    createCalculationTerm("movement", "Capped crowd movement", movement),
  ], { notes: [`The ${responseGap >= 0 ? "positive" : "negative"} response gap uses divisor ${movementDivisor}. Uncapped movement ${(uncappedMovement >= 0 ? "+" : "")}${round(uncappedMovement)} is capped between ${movementFormula.movementMinimum} and +${movementFormula.movementMaximum}.`] });
  const crowdAfter = crowdAfterLedger.result;
  return {
    performanceRating: round(performance),
    anticipation: round(expected),
    anticipationLabel: anticipationLabel(expected),
    crowdBefore: round(incoming),
    crowdBeforeLabel: crowdHeatLabel(incoming),
    crowdResponse,
    expectationAdjustment,
    mentalNightAdjustment,
    finalRating,
    crowdAfter,
    crowdAfterLabel: crowdHeatLabel(crowdAfter),
    calculationLedger: {
      expectationAdjustment: expectationLedger,
      mentalNightAdjustment: mentalNightLedger,
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
    if (segment.type !== "match") continue;
    const preview = currentPerformancePreview({ segment, cardSegments: input.segments, profiles: input.profiles });
    if (!preview) continue;
    const profileKeys = new Set(segment.workers.map((worker) => `${worker.source}:${worker.id}`));
    const profiles = input.profiles.filter((profile) => profileKeys.has(profile.workerKey));
    if (profiles.length < 2) continue;
    const anticipation = calculateMatchAnticipation({
      profiles,
      plans: segment.matchApproachSetup.workerPlans,
      aimId: segment.matchApproachSetup.matchAimId,
    });
    crowd = calculateLiveMatchAudience(preview.matchScore, anticipation.score, crowd, preview.workerResults.map((result) => result.mentalStateName)).crowdAfter;
  }
  return crowd;
}

export function calculateLiveAngleAudience(performanceRating: number, anticipation: number, crowdBefore: number): LiveAudienceResult {
  const expectationFormula = CALCULATION_FORMULAS.angleExpectationAdjustment;
  const responseFormula = CALCULATION_FORMULAS.angleCrowdResponse;
  const finalFormula = CALCULATION_FORMULAS.angleFinalRating;
  const movementFormula = CALCULATION_FORMULAS.angleCrowdMovement;
  const performance = clamp(performanceRating);
  const expected = clamp(anticipation);
  const incoming = clamp(crowdBefore);
  const performanceGap = performance - expected;
  const deliveryWeight = performanceGap >= 0 ? expectationFormula.overdeliveryWeight : expectationFormula.disappointmentWeight;
  const expectationLedger = createCalculationStage(expectationFormula, [createCalculationTerm("performance-gap", performanceGap >= 0 ? "Performance above anticipation" : "Performance below anticipation", performanceGap, deliveryWeight)]);
  const expectationAdjustment = expectationLedger.result;
  const responseLedger = createCalculationStage(responseFormula, [
    createCalculationTerm("anticipation", "Angle anticipation", expected, responseFormula.anticipationWeight),
    createCalculationTerm("incoming", "Incoming crowd heat", incoming, responseFormula.incomingCrowdWeight),
    createCalculationTerm("expectation", "Delivery adjustment", expectationAdjustment),
  ], { notes: ["Raw angle performance affects crowd response only through overdelivery or disappointment; it is not directly counted again."] });
  const crowdResponse = responseLedger.result;
  const finalLedger = createCalculationStage(finalFormula, [
    createCalculationTerm("performance", "Raw angle performance", performance, finalFormula.performanceWeight),
    createCalculationTerm("crowd-response", "Live angle crowd response", crowdResponse, finalFormula.crowdResponseWeight),
  ]);
  const movement = clamp((crowdResponse - incoming) / movementFormula.divisor, movementFormula.movementMinimum, movementFormula.movementMaximum);
  const crowdAfterLedger = createCalculationStage(movementFormula, [
    createCalculationTerm("incoming", "Incoming crowd heat", incoming),
    createCalculationTerm("movement", "Capped crowd movement", movement),
  ]);
  return {
    performanceRating: round(performance),
    anticipation: round(expected),
    anticipationLabel: anticipationLabel(expected),
    crowdBefore: round(incoming),
    crowdBeforeLabel: crowdHeatLabel(incoming),
    crowdResponse,
    expectationAdjustment,
    finalRating: finalLedger.result,
    crowdAfter: crowdAfterLedger.result,
    crowdAfterLabel: crowdHeatLabel(crowdAfterLedger.result),
    calculationLedger: { expectationAdjustment: expectationLedger, crowdResponse: responseLedger, finalRating: finalLedger, crowdAfter: crowdAfterLedger },
  };
}
