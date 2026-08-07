import { MATCH_AIMS } from "../matchEngine/catalog";
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

function fieldValue(values: number[]): number {
  if (!values.length) return 50;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return round(clamp(average * .65 + Math.max(...values) * .35));
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
  const aim = MATCH_AIMS.find((item) => item.id === input.aimId) ?? MATCH_AIMS[0];
  const plans = new Map(input.plans.map((plan) => [plan.workerKey, plan]));
  const popularityValues = input.profiles.map((profile) => clamp(profile.popularity * .7 + profile.fanReaction * 20 * .3));
  const momentumValues = input.profiles.map((profile) => clamp(profile.momentum));
  const skillValues = input.profiles.map((profile) => {
    const plan = plans.get(profile.workerKey);
    const approachRatings = plan?.selectedApproachIds.flatMap((id) => {
      const approach = getApproach(id);
      return approach ? [calculateApproachRating(approach, profileApproachRatingInputs(profile))] : [];
    }) ?? [];
    const approachScore = approachRatings.length ? approachRatings.reduce((total, value) => total + value, 0) / approachRatings.length : profile.overall;
    return clamp(profile.overall * .45 + profile.skills.Psychology * .2 + profile.skills.Charisma * .15 + approachScore * .2);
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
    return clamp(styleFit * .6 + approachFit * .4);
  });
  const popularity = fieldValue(popularityValues);
  const momentum = fieldValue(momentumValues);
  const skills = fieldValue(skillValues);
  const styleAppeal = fieldValue(styleValues);
  const score = round(clamp(popularity * .4 + momentum * .25 + skills * .2 + styleAppeal * .15));
  return { score, label: anticipationLabel(score), popularity, momentum, skills, styleAppeal };
}

export function calculateLiveMatchAudience(performanceRating: number, anticipation: number, crowdBefore: number): LiveAudienceResult {
  const performance = clamp(performanceRating);
  const expected = clamp(anticipation);
  const incoming = clamp(crowdBefore);
  const expectationAdjustment = round(clamp((performance - expected) * .2, -6, 6));
  const crowdResponse = round(clamp(performance * .5 + expected * .3 + incoming * .2 + expectationAdjustment));
  const finalRating = round(clamp(performance * .7 + crowdResponse * .3));
  const movement = clamp((crowdResponse - incoming) / 3, -12, 12);
  const crowdAfter = round(clamp(incoming + movement));
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
  };
}
