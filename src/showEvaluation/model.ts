import {
  ANGLE_CALCULATION_SYSTEM_VERSION,
  CALCULATION_FORMULAS,
  SHOW_CALCULATION_SYSTEM_VERSION,
  createCalculationStage,
  createCalculationTerm,
} from "../calculations/foundation";
import type { CalculationLedgerStage } from "../calculations/foundation";
import { calculateLiveAngleAudience } from "../crowd/model";
import { createMatchEngineProfile } from "../matchEngine/model";
import type { MatchEngineProfile } from "../matchEngine/types";
import { createPlannerId } from "../planner/model";
import type { AnglePerformanceRole, PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import type { LiveCardSession } from "../liveCard/types";
import type { StartingUniverseCompany } from "../startingUniverse/types";
import type {
  AngleEvaluation,
  AngleParticipantEvaluation,
  AngleWorkerImpact,
  AttendanceCalculation,
  CrowdProgressionEntry,
  PromotionStrengthSnapshot,
  ShowEvaluationReport,
  ShowEvaluationUniverse,
  ShowExpectationSnapshot,
} from "./types";

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function now(): string {
  return new Date().toISOString();
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function workerKey(worker: PlannedWorkerReference): string {
  return worker.source === "tew" ? `tew:${worker.id || normalized(worker.name)}` : `manual:${normalized(worker.name)}`;
}

function profileFor(worker: PlannedWorkerReference, profiles: MatchEngineProfile[]): MatchEngineProfile | null {
  const key = workerKey(worker);
  return profiles.find((profile) => profile.workerKey === key)
    ?? profiles.find((profile) => normalized(profile.workerName) === normalized(worker.name))
    ?? null;
}

export function normalizeAnglePerformanceRole(value: string): AnglePerformanceRole {
  const role = normalized(value);
  if (["speaking", "speaker", "promo", "talker"].includes(role)) return "Speaking";
  if (["physical", "aggressor", "fighter", "attacker", "enforcer"].includes(role)) return "Physical";
  if (["reaction", "reactor", "selling", "seller", "victim", "target"].includes(role)) return "Reaction";
  return "Presence";
}

function roleScore(worker: PlannedWorkerReference, profile: MatchEngineProfile | null): { role: AnglePerformanceRole; score: number; ledger: CalculationLedgerStage; detail: string } {
  const role = normalizeAnglePerformanceRole(worker.role);
  const formula = CALCULATION_FORMULAS.angleRolePerformance;
  if (!profile) {
    const ledger = createCalculationStage(formula, [createCalculationTerm("fallback", "Missing-profile neutral fallback", 50)], { notes: ["No saved performance profile was available."] });
    return { role, score: ledger.result, ledger, detail: "No saved performance profile; neutral 50 was used." };
  }
  let terms: ReturnType<typeof createCalculationTerm>[];
  let detail: string;
  if (role === "Physical") {
    const weights = formula.weights.Physical;
    terms = [createCalculationTerm("menace", "Menace", profile.skills.Menace, weights.Menace), createCalculationTerm("brawling", "Brawling", profile.skills.Brawling, weights.Brawling), createCalculationTerm("charisma", "Charisma", profile.skills.Charisma, weights.Charisma), createCalculationTerm("popularity", "Popularity", profile.popularity, weights.popularity)];
    detail = "Physical role used menace, brawling, charisma, and popularity.";
  } else if (role === "Reaction") {
    const weights = formula.weights.Reaction;
    terms = [createCalculationTerm("selling", "Selling", profile.skills.Selling, weights.Selling), createCalculationTerm("charisma", "Charisma", profile.skills.Charisma, weights.Charisma), createCalculationTerm("psychology", "Psychology", profile.skills.Psychology, weights.Psychology), createCalculationTerm("popularity", "Popularity", profile.popularity, weights.popularity)];
    detail = "Reaction role used selling, charisma, psychology, and popularity.";
  } else if (role === "Speaking") {
    const weights = formula.weights.Speaking;
    terms = [createCalculationTerm("charisma", "Charisma", profile.skills.Charisma, weights.Charisma), createCalculationTerm("psychology", "Psychology", profile.skills.Psychology, weights.Psychology), createCalculationTerm("popularity", "Popularity", profile.popularity, weights.popularity), createCalculationTerm("gimmick", "Normalized gimmick", profile.gimmick * formula.gimmickScale, weights.gimmick)];
    detail = "Speaking role used charisma, psychology, popularity, and normalized gimmick.";
  } else {
    const weights = formula.weights.Presence;
    terms = [createCalculationTerm("charisma", "Charisma", profile.skills.Charisma, weights.Charisma), createCalculationTerm("menace", "Menace", profile.skills.Menace, weights.Menace), createCalculationTerm("popularity", "Popularity", profile.popularity, weights.popularity), createCalculationTerm("gimmick", "Normalized gimmick", profile.gimmick * formula.gimmickScale, weights.gimmick)];
    detail = "Presence role used charisma, menace, popularity, and normalized gimmick.";
  }
  const ledger = createCalculationStage({ ...formula, id: `${formula.id}.${role.toLowerCase()}`, label: `${role} role performance` }, terms);
  return { role, score: ledger.result, ledger, detail };
}

function showImportance(showType: string): number {
  if (/pay.per.view|ppv|premium|major|classic|final/i.test(showType)) return 3;
  if (/special|competition|event/i.test(showType)) return 2;
  if (/television|tv/i.test(showType)) return 1;
  if (/house|tour/i.test(showType)) return -1;
  return 0;
}

function importanceStakeBonus(showType: string): number {
  const formula = CALCULATION_FORMULAS.angleStoryStakes;
  const importance = showImportance(showType);
  if (importance === 3) return formula.importanceWeights.major;
  if (importance === 2) return formula.importanceWeights.special;
  if (importance === 1) return formula.importanceWeights.television;
  if (importance === -1) return formula.importanceWeights.house;
  return formula.importanceWeights.standard;
}

function actualMainEventId(show: PlannedShow): string {
  return show.segments.filter((segment) => segment.section === "Main Show").at(-1)?.id ?? "";
}

function angleFingerprintPayload(show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[]) {
  return {
    version: ANGLE_CALCULATION_SYSTEM_VERSION,
    show: { showType: show.showType, mainEventId: actualMainEventId(show) },
    segment: {
      id: segment.id,
      title: segment.title,
      durationMinutes: segment.durationMinutes,
      section: segment.section,
      angleContentType: segment.angleContentType,
      purpose: segment.purpose,
      audienceTakeaway: segment.audienceTakeaway,
      storylines: segment.storylines.map((storyline) => ({ id: storyline.id, name: storyline.name, source: storyline.source })),
      workers: segment.workers.map((worker) => ({ id: worker.id, name: worker.name, role: worker.role, source: worker.source })),
    },
    profiles: segment.workers.map((worker) => {
      const profile = profileFor(worker, profiles);
      return profile ? {
        workerKey: profile.workerKey,
        overall: profile.overall,
        popularity: profile.popularity,
        momentum: profile.momentum,
        fanReaction: profile.fanReaction,
        gimmick: profile.gimmick,
        skills: profile.skills,
      } : { workerKey: workerKey(worker), neutralFallback: 50 };
    }),
  };
}

export function angleEvaluationFingerprint(show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[]): string {
  return hash(stableStringify(angleFingerprintPayload(show, segment, profiles)));
}

export function isAngleEvaluationCurrent(evaluation: AngleEvaluation, show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[]): boolean {
  return Boolean(evaluation.appliedAt) || (
    evaluation.calculationVersion === ANGLE_CALCULATION_SYSTEM_VERSION
    && evaluation.setupFingerprint === angleEvaluationFingerprint(show, segment, profiles)
  );
}

function anticipationField(values: number[], label: string): { value: number; ledger: CalculationLedgerStage } {
  const formula = CALCULATION_FORMULAS.anticipationField;
  if (!values.length) {
    const ledger = createCalculationStage(formula, [createCalculationTerm("fallback", `${label} fallback`, 50)], { notes: ["No participant values were available, so neutral 50 was used."] });
    return { value: 50, ledger };
  }
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const maximum = Math.max(...values);
  const ledger = createCalculationStage(formula, [
    createCalculationTerm("average", `${label} participant average`, average, formula.averageWeight),
    createCalculationTerm("maximum", `${label} strongest participant`, maximum, formula.maximumWeight),
  ], { notes: [`Participant values: ${values.map((value) => round(value)).join(", ")}.`] });
  return { value: ledger.result, ledger };
}

function durationStructureAdjustment(minutes: number): number {
  const formula = CALCULATION_FORMULAS.angleStructure;
  if (minutes >= 4 && minutes <= 10) return formula.idealDurationBonus;
  if ((minutes >= 2 && minutes <= 3) || (minutes >= 11 && minutes <= 15)) return formula.acceptableDurationAdjustment;
  if (minutes >= 16 && minutes <= 18) return formula.longDurationPenalty;
  return formula.extremeDurationPenalty;
}

function storyStakes(show: PlannedShow, segment: PlannedSegment): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.angleStoryStakes;
  const content = `${segment.title} ${segment.angleContentType} ${segment.purpose} ${segment.audienceTakeaway}`.toLowerCase();
  const highStakes = /championship|title|challenge|contract|reveal|turn|betray/.test(content) ? formula.highStakesBonus : 0;
  const physical = /attack|brawl|fight|violent|physical|confront/.test(content) ? formula.physicalConflictBonus : 0;
  const placement = segment.section === "Main Show" && segment.id === actualMainEventId(show) ? formula.mainEventBonus : segment.section === "Main Show" ? 0 : formula.prePostPenalty;
  return createCalculationStage(formula, [
    createCalculationTerm("baseline", "Story-stakes baseline", formula.baseline),
    createCalculationTerm("high-stakes", "Championship, contract, reveal, turn, or betrayal", highStakes),
    createCalculationTerm("physical-conflict", "Attack, brawl, or physical confrontation", physical),
    createCalculationTerm("storyline", "One genuine storyline connection", segment.storylines.length ? formula.storylineBonus : 0),
    createCalculationTerm("show-importance", "Show importance", importanceStakeBonus(show.showType)),
    createCalculationTerm("placement", "Actual running-order placement", placement),
  ], { notes: [segment.storylines.length > 1 ? `${segment.storylines.length} storylines are linked, but the connection bonus is applied only once.` : "Storyline stakes never stack for extra linked records."] });
}

function participantConsequences(
  participantBase: Array<{ worker: PlannedWorkerReference; profile: MatchEngineProfile | null; role: AnglePerformanceRole; roleScore: number; roleLedger: CalculationLedgerStage; detail: string }>,
  rawPerformance: number,
  anticipation: number,
): AngleParticipantEvaluation[] {
  const creditedFormula = CALCULATION_FORMULAS.angleCreditedPerformance;
  const momentumFormula = CALCULATION_FORMULAS.angleMomentumConsequence;
  const popularityFormula = CALCULATION_FORMULAS.anglePopularityConsequence;
  return participantBase.map(({ worker, profile, role, roleScore: individual, roleLedger, detail }) => {
    const momentumBefore = profile?.momentum ?? 50;
    const popularityBefore = profile?.popularity ?? 50;
    const credited = createCalculationStage(creditedFormula, [
      createCalculationTerm("individual", "Individual role performance", individual, creditedFormula.individualWeight),
      createCalculationTerm("angle", "Final raw angle performance", rawPerformance, creditedFormula.angleWeight),
    ]);
    const momentum = createCalculationStage(momentumFormula, [createCalculationTerm("expectation-gap", "Credited performance minus anticipation", credited.result - anticipation, 1 / momentumFormula.divisor)]);
    const popularity = createCalculationStage(popularityFormula, [createCalculationTerm("popularity-gap", "Credited performance minus current popularity", credited.result - popularityBefore, 1 / popularityFormula.divisor)]);
    return {
      workerKey: workerKey(worker),
      workerName: worker.name,
      role,
      rolePerformance: individual,
      performanceScore: credited.result,
      momentumBefore,
      momentumDelta: momentum.result,
      momentumAfter: round(clamp(momentumBefore + momentum.result)),
      popularityBefore,
      popularityDelta: popularity.result,
      popularityAfter: round(clamp(popularityBefore + popularity.result)),
      calculationLedger: { rolePerformance: roleLedger, creditedPerformance: credited, momentum, popularity },
      explanation: [detail, `Credited performance combines 70% individual role execution with 30% of the ${rawPerformance.toFixed(1)} raw angle performance.`, "Crowd heat and the crowd-adjusted official rating do not substitute for individual ability."],
    };
  });
}

function recalculateAngleFromRaw(evaluation: AngleEvaluation, rawPerformance: number): AngleEvaluation {
  const finalRaw = round(rawPerformance);
  const audience = calculateLiveAngleAudience(finalRaw, evaluation.anticipation, evaluation.crowdBefore);
  const rawLedger = createCalculationStage(CALCULATION_FORMULAS.angleRawPerformanceOverride, [createCalculationTerm("override-derived", "Override-derived raw performance", finalRaw)], { notes: ["The explained official-rating override was inverted through the crowd formula to derive a new raw performance value."] });
  const participantBase = evaluation.participants.map((participant) => ({
    worker: { id: participant.workerKey.split(":").slice(1).join(":"), name: participant.workerName, role: participant.role, side: "", source: participant.workerKey.startsWith("tew:") ? "tew" as const : "manual" as const },
    profile: { momentum: participant.momentumBefore, popularity: participant.popularityBefore } as MatchEngineProfile,
    role: participant.role,
    roleScore: participant.rolePerformance,
    roleLedger: participant.calculationLedger?.rolePerformance ?? createCalculationStage(CALCULATION_FORMULAS.angleRolePerformance, [createCalculationTerm("preserved", "Preserved role performance", participant.rolePerformance)]),
    detail: participant.explanation[0] ?? "Role performance preserved from the validated angle calculation.",
  }));
  return {
    ...evaluation,
    rawPerformance: finalRaw,
    crowdResponse: audience.crowdResponse,
    finalScore: audience.finalRating,
    factors: evaluation.factors.map((factor) => factor.label === "Raw performance" ? { ...factor, value: finalRaw } : factor.label === "Crowd response" ? { ...factor, value: audience.crowdResponse } : factor.label === "Official rating" ? { ...factor, value: audience.finalRating } : factor),
    participants: participantConsequences(participantBase, finalRaw, evaluation.anticipation),
    calculationLedger: evaluation.calculationLedger ? {
      ...evaluation.calculationLedger,
      rawPerformance: rawLedger,
      expectationAdjustment: audience.calculationLedger!.expectationAdjustment,
      crowdResponse: audience.calculationLedger!.crowdResponse,
      finalRating: audience.calculationLedger!.finalRating,
      crowdAfter: audience.calculationLedger!.crowdAfter,
    } : undefined,
  };
}

export function calculateAngleEvaluation(show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[], crowdBefore = 50): AngleEvaluation {
  if (segment.type !== "angle") throw new Error("Only an angle can be evaluated as an angle.");
  if (!segment.segmentOutput.trim()) throw new Error("Record the final Angle Output before calculating its result.");
  if (segment.workers.length === 0) throw new Error("Add at least one participant before calculating the angle result.");
  const participantBase = segment.workers.map((worker) => {
    const profile = profileFor(worker, profiles);
    const result = roleScore(worker, profile);
    return { worker, profile, role: result.role, roleScore: result.score, roleLedger: result.ledger, detail: result.detail };
  });
  const executionFormula = CALCULATION_FORMULAS.angleParticipantExecution;
  const weightedTotal = participantBase.reduce((total, participant) => total + participant.roleScore * executionFormula.roleWeights[participant.role], 0);
  const participationWeight = participantBase.reduce((total, participant) => total + executionFormula.roleWeights[participant.role], 0);
  const roleWeightedAverage = participationWeight ? weightedTotal / participationWeight : 50;
  const strongest = Math.max(...participantBase.map((participant) => participant.roleScore));
  const participantExecution = createCalculationStage(executionFormula, [
    createCalculationTerm("average", "Role-weighted participant average", roleWeightedAverage, executionFormula.averageWeight),
    createCalculationTerm("strongest", "Strongest performer", strongest, executionFormula.maximumWeight),
  ], { notes: ["Speaking, physical, and reaction roles carry 1.0 participation weight; presence carries 0.6."] });
  const structureFormula = CALCULATION_FORMULAS.angleStructure;
  const durationAdjustment = durationStructureAdjustment(segment.durationMinutes);
  const structure = createCalculationStage(structureFormula, [
    createCalculationTerm("baseline", "Structure baseline", structureFormula.baseline),
    createCalculationTerm("duration", "Duration band", durationAdjustment),
    createCalculationTerm("purpose", "Clear purpose", segment.purpose.trim() ? structureFormula.purposeBonus : structureFormula.missingPurposePenalty),
    createCalculationTerm("takeaway", "Clear audience takeaway", segment.audienceTakeaway.trim() ? structureFormula.takeawayBonus : structureFormula.missingTakeawayPenalty),
    createCalculationTerm("storyline", "One storyline connection", segment.storylines.length ? structureFormula.storylineBonus : 0),
  ], { notes: ["Finished-output word count is deliberately excluded.", segment.storylines.length > 1 ? "Additional storyline links do not stack another structure bonus." : "At most one storyline bonus can apply."] });
  const rawFormula = CALCULATION_FORMULAS.angleRawPerformance;
  const rawLedger = createCalculationStage(rawFormula, [
    createCalculationTerm("execution", "Participant execution", participantExecution.result, rawFormula.executionWeight),
    createCalculationTerm("structure", "Angle structure", structure.result, rawFormula.structureWeight),
  ]);
  const profileValues = participantBase.map((participant) => participant.profile);
  const popularity = anticipationField(profileValues.map((profile) => profile?.popularity ?? 50), "Popularity");
  const momentum = anticipationField(profileValues.map((profile) => profile?.momentum ?? 50), "Momentum");
  const anticipationFormula = CALCULATION_FORMULAS.angleAnticipation;
  const fanPresentation = anticipationField(profileValues.map((profile) => profile ? clamp(profile.fanReaction * anticipationFormula.fivePointScale * anticipationFormula.fanReactionWeight + profile.gimmick * anticipationFormula.fivePointScale * anticipationFormula.gimmickWeight) : 50), "Fan reaction and gimmick");
  const stakes = storyStakes(show, segment);
  const anticipationLedger = createCalculationStage(anticipationFormula, [
    createCalculationTerm("popularity", "Participant popularity", popularity.value, anticipationFormula.popularityWeight),
    createCalculationTerm("momentum", "Participant momentum", momentum.value, anticipationFormula.momentumWeight),
    createCalculationTerm("fan-presentation", "Fan reaction and gimmick", fanPresentation.value, anticipationFormula.fanPresentationWeight),
    createCalculationTerm("story-stakes", "Story stakes", stakes.result, anticipationFormula.storyStakesWeight),
  ]);
  const audience = calculateLiveAngleAudience(rawLedger.result, anticipationLedger.result, crowdBefore);
  const participants = participantConsequences(participantBase, rawLedger.result, anticipationLedger.result);
  return {
    id: createPlannerId(),
    idempotencyKey: `${show.id}:${segment.id}:angle-consequences:${ANGLE_CALCULATION_SYSTEM_VERSION}`,
    showId: show.id,
    showName: show.name,
    segmentId: segment.id,
    segmentTitle: segment.title,
    status: "Calculated",
    calculationVersion: ANGLE_CALCULATION_SYSTEM_VERSION,
    setupFingerprint: angleEvaluationFingerprint(show, segment, profiles),
    rawPerformance: rawLedger.result,
    anticipation: anticipationLedger.result,
    crowdBefore: audience.crowdBefore,
    crowdResponse: audience.crowdResponse,
    calculatedScore: audience.finalRating,
    finalScore: audience.finalRating,
    overrideReason: "",
    factors: [
      { label: "Participant execution", value: participantExecution.result, detail: "70% role-weighted average and 30% strongest performer." },
      { label: "Angle structure", value: structure.result, detail: "Duration, purpose, audience takeaway, and one storyline connection." },
      { label: "Raw performance", value: rawLedger.result, detail: "Participant execution 80% and structure 20%." },
      { label: "Anticipation", value: anticipationLedger.result, detail: "Popularity, momentum, fan presentation, and story stakes." },
      { label: "Crowd response", value: audience.crowdResponse, detail: `Incoming crowd heat ${audience.crowdBefore.toFixed(1)} plus expectation delivery.` },
      { label: "Official rating", value: audience.finalRating, detail: "Raw performance 60% and live crowd response 40%." },
    ],
    participants,
    calculationLedger: {
      participantExecution,
      structure,
      rawPerformance: rawLedger,
      popularity: popularity.ledger,
      momentum: momentum.ledger,
      fanPresentation: fanPresentation.ledger,
      storyStakes: stakes,
      anticipation: anticipationLedger,
      expectationAdjustment: audience.calculationLedger!.expectationAdjustment,
      crowdResponse: audience.calculationLedger!.crowdResponse,
      finalRating: audience.calculationLedger!.finalRating,
      crowdAfter: audience.calculationLedger!.crowdAfter,
    },
    calculatedAt: now(),
    finalizedAt: "",
    appliedAt: "",
  };
}

export function finalizeAngleEvaluation(
  evaluation: AngleEvaluation,
  overrideScore: number | undefined,
  overrideReason = "",
  validation: { show: PlannedShow; segment: PlannedSegment; profiles: MatchEngineProfile[] },
): AngleEvaluation {
  if (evaluation.status !== "Calculated" || evaluation.appliedAt) throw new Error("This angle result has already been finalized.");
  if (!isAngleEvaluationCurrent(evaluation, validation.show, validation.segment, validation.profiles)) throw new Error("The angle calculation is stale. Recalculate it after the participant, role, segment, show, or profile change.");
  if (evaluation.calculationVersion !== ANGLE_CALCULATION_SYSTEM_VERSION) throw new Error("This angle calculation uses an older formula version. Recalculate it before finalizing.");
  if (overrideScore !== undefined && (!overrideReason.trim() || !Number.isFinite(overrideScore))) throw new Error("Record a valid override score and explain why it replaces the calculated result.");
  if (overrideScore === undefined) return { ...evaluation, status: "Accepted", finalizedAt: now() };
  const target = round(clamp(overrideScore));
  let low = 0;
  let high = 100;
  for (let index = 0; index < 40; index += 1) {
    const midpoint = (low + high) / 2;
    if (calculateLiveAngleAudience(midpoint, evaluation.anticipation, evaluation.crowdBefore).finalRating < target) low = midpoint; else high = midpoint;
  }
  const recalculated = recalculateAngleFromRaw(evaluation, (low + high) / 2);
  const baselineFinalRating = recalculated.calculationLedger?.finalRating.result ?? recalculated.finalScore;
  const overrideFinalLedger = createCalculationStage(CALCULATION_FORMULAS.angleFinalRatingOverride, [
    createCalculationTerm("recalculated", "Recalculated official angle rating", baselineFinalRating),
    createCalculationTerm("override", "Explained override adjustment", target - baselineFinalRating),
  ], { notes: [`Explained override set the official rating to ${target.toFixed(1)} after raw performance and participant consequences were recalculated.`] });
  return {
    ...recalculated,
    status: "Overridden",
    finalScore: target,
    factors: recalculated.factors.map((factor) => factor.label === "Official rating" ? { ...factor, value: target, detail: "Explained official override after raw performance and participant consequences were recalculated." } : factor),
    overrideReason: overrideReason.trim(),
    calculationLedger: recalculated.calculationLedger ? {
      ...recalculated.calculationLedger,
      finalRating: overrideFinalLedger,
    } : recalculated.calculationLedger,
    finalizedAt: now(),
  };
}

export function applyAngleEvaluation(universe: ShowEvaluationUniverse, evaluation: AngleEvaluation, profiles: MatchEngineProfile[]): { universe: ShowEvaluationUniverse; profiles: MatchEngineProfile[] } {
  const existing = universe.angleEvaluations.find((item) => item.id === evaluation.id || (item.idempotencyKey === evaluation.idempotencyKey && item.appliedAt));
  if (existing?.appliedAt) return { universe, profiles };
  if (evaluation.status === "Calculated") throw new Error("Accept or override the angle result before applying its consequences.");
  if (evaluation.calculationVersion !== ANGLE_CALCULATION_SYSTEM_VERSION || !evaluation.calculationLedger) throw new Error("Recalculate this legacy angle before applying permanent consequences.");
  const timestamp = now();
  const workerImpacts = [...universe.workerImpacts];
  const nextProfiles = [...profiles];
  evaluation.participants.forEach((participant) => {
    let profileIndex = nextProfiles.findIndex((item) => item.workerKey === participant.workerKey);
    if (profileIndex < 0) {
      const [source, ...idParts] = participant.workerKey.split(":");
      nextProfiles.push(createMatchEngineProfile({ id: idParts.join(":") || normalized(participant.workerName), name: participant.workerName, source: source === "tew" ? "tew" : "manual" }));
      profileIndex = nextProfiles.length - 1;
    }
    const priorProfile = nextProfiles[profileIndex];
    if (Math.abs(priorProfile.momentum - participant.momentumBefore) > .01 || Math.abs(priorProfile.popularity - participant.popularityBefore) > .01) throw new Error(`${participant.workerName}'s profile changed after the angle was calculated. Recalculate the angle before applying consequences.`);
    const updatedProfile: MatchEngineProfile = { ...priorProfile, momentum: participant.momentumAfter, momentumScale: "0-100-v1", popularity: participant.popularityAfter, updatedAt: timestamp };
    nextProfiles[profileIndex] = updatedProfile;
    const index = workerImpacts.findIndex((item) => item.workerKey === participant.workerKey);
    const prior: AngleWorkerImpact = index >= 0 ? workerImpacts[index] : { workerKey: participant.workerKey, workerName: participant.workerName, momentum: priorProfile.momentum, popularity: priorProfile.popularity, angleHistory: [], updatedAt: "" };
    const next: AngleWorkerImpact = {
      ...prior,
      workerName: participant.workerName,
      momentum: updatedProfile.momentum,
      popularity: updatedProfile.popularity,
      angleHistory: [{ angleEvaluationId: evaluation.id, showId: evaluation.showId, showName: evaluation.showName, segmentId: evaluation.segmentId, segmentTitle: evaluation.segmentTitle, score: evaluation.finalScore, momentumDelta: participant.momentumDelta, popularityDelta: participant.popularityDelta, occurredAt: timestamp }, ...prior.angleHistory].slice(0, 200),
      updatedAt: timestamp,
    };
    if (index >= 0) workerImpacts[index] = next; else workerImpacts.push(next);
  });
  const applied = { ...evaluation, appliedAt: timestamp };
  return { profiles: nextProfiles, universe: { ...universe, workerImpacts, angleEvaluations: universe.angleEvaluations.some((item) => item.id === evaluation.id) ? universe.angleEvaluations.map((item) => item.id === evaluation.id ? applied : item) : [applied, ...universe.angleEvaluations] } };
}

function reaction(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 75) return "Strong";
  if (score >= 65) return "Positive";
  if (score >= 55) return "Mixed";
  if (score >= 45) return "Flat";
  return "Poor";
}

export interface ShowEvaluationContext {
  company?: StartingUniverseCompany | null;
  profiles?: MatchEngineProfile[];
}

function sizeScore(size: string): number {
  const scores = CALCULATION_FORMULAS.showPromotionStrength.sizeScores as Record<string, number>;
  return scores[normalized(size)] ?? 50;
}

function sizeAttendanceBaseline(size: string): number {
  const score = sizeScore(size);
  return CALCULATION_FORMULAS.showAttendanceDemand.baselineThresholds.find((threshold) => score >= threshold.minimum)?.value ?? 150;
}

export function promotionStrength(company: StartingUniverseCompany | null | undefined, savedPopularity: number): { popularity: number; snapshot: PromotionStrengthSnapshot; ledger: CalculationLedgerStage } {
  const formula = CALCULATION_FORMULAS.showPromotionStrength;
  if (!company) {
    const popularity = clamp(savedPopularity);
    const ledger = createCalculationStage(formula, [createCalculationTerm("saved", "Saved promotion popularity", popularity)], { rawSubtotal: popularity, notes: ["No imported company record was available, so saved promotion popularity was preserved as the strength baseline."] });
    return { popularity, snapshot: { source: "Saved Promotion", companyName: "", companySize: "Medium", sizeScore: 50, prestige: popularity, momentum: 50 }, ledger };
  }
  const companySizeScore = sizeScore(company.size);
  const prestige = clamp(company.prestige);
  const momentum = clamp(company.momentum);
  const ledger = createCalculationStage(formula, [
    createCalculationTerm("prestige", "Promotion prestige", prestige, formula.prestigeWeight),
    createCalculationTerm("size", "Company-size score", companySizeScore, formula.sizeWeight),
    createCalculationTerm("momentum", "Promotion momentum", momentum, formula.momentumWeight),
  ]);
  return { popularity: ledger.result, snapshot: { source: "Imported Company", companyName: company.name, companySize: company.size, sizeScore: companySizeScore, prestige, momentum }, ledger };
}

function startingCrowdCalculation(show: PlannedShow, popularity: number): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.showStartingCrowd;
  return createCalculationStage(formula, [
    createCalculationTerm("baseline", "Starting-crowd baseline", formula.baseline),
    createCalculationTerm("popularity", "Promotion popularity", popularity, formula.popularityWeight),
    createCalculationTerm("importance", "Show importance", showImportance(show.showType), formula.importanceWeight),
  ]);
}

export function startingCrowdForShow(show: PlannedShow, company: StartingUniverseCompany | null | undefined, savedPopularity: number, popularitySeeded = false): number {
  const seeded = promotionStrength(company, savedPopularity);
  const popularity = popularitySeeded ? clamp(savedPopularity) : seeded.popularity;
  return startingCrowdCalculation(show, popularity).result;
}

function expectedCardStrength(show: PlannedShow, profiles: MatchEngineProfile[]): { value: number; ledger: CalculationLedgerStage } {
  const formula = CALCULATION_FORMULAS.showExpectedCardStrength;
  const keys = new Set<string>();
  const values: number[] = [];
  show.segments.forEach((segment) => segment.workers.forEach((worker) => {
    const key = workerKey(worker);
    if (keys.has(key)) return;
    keys.add(key);
    const profile = profileFor(worker, profiles);
    if (profile) values.push(profile.overall * formula.overallWeight + profile.popularity * formula.popularityWeight + clamp(profile.momentum) * formula.momentumWeight + profile.health * formula.healthWeight);
  }));
  const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : 50;
  const ledger = createCalculationStage(formula, [createCalculationTerm("participant-average", "Unique participant average", average)], { notes: [values.length ? `Unique participant card-strength values: ${values.map((value) => round(value)).join(", ")}.` : "No participant profiles were available, so neutral 50 was used."] });
  return { value: ledger.result, ledger };
}

function expectedShowCalculation(popularity: number, prestige: number, importance: number): CalculationLedgerStage {
  const formula = CALCULATION_FORMULAS.showExpectedScore;
  return createCalculationStage(formula, [
    createCalculationTerm("baseline", "Expected-show baseline", formula.baseline),
    createCalculationTerm("popularity", "Promotion popularity", popularity, formula.popularityWeight),
    createCalculationTerm("prestige", "Promotion prestige", prestige, formula.prestigeWeight),
    createCalculationTerm("importance", "Show importance", importance),
  ]);
}

function attendanceForShow(show: PlannedShow, popularity: number, strength: PromotionStrengthSnapshot, cardStrength: number, recentPerformance: number): { attendance: number; calculation: AttendanceCalculation; ledger: CalculationLedgerStage } {
  const formula = CALCULATION_FORMULAS.showAttendanceDemand;
  const importance = showImportance(show.showType);
  const market = clamp(show.marketDemand ?? 50);
  const base = sizeAttendanceBaseline(strength.companySize);
  const importanceFactor = importance === 3 ? formula.importanceFactors.major : importance === 2 ? formula.importanceFactors.special : importance === 1 ? formula.importanceFactors.television : importance === -1 ? formula.importanceFactors.house : formula.importanceFactors.standard;
  const factors = [
    { id: "popularity", label: "Popularity factor", value: formula.popularityBase + clamp(popularity) / 100 * formula.popularityRange },
    { id: "market", label: "Market-demand factor", value: formula.marketBase + market / 100 * formula.marketRange },
    { id: "card", label: "Expected-card factor", value: formula.cardBase + clamp(cardStrength) / 100 * formula.cardRange },
    { id: "recent", label: "Recent-performance factor", value: formula.recentBase + clamp(recentPerformance) / 100 * formula.recentRange },
    { id: "importance", label: "Show-importance factor", value: importanceFactor },
    { id: "momentum", label: "Promotion-momentum factor", value: formula.momentumBase + clamp(strength.momentum) / 100 * formula.momentumRange },
  ];
  let running = base;
  const terms = [createCalculationTerm("baseline", "Promotion-size attendance baseline", base)];
  factors.forEach((factor) => {
    const next = running * factor.value;
    terms.push(createCalculationTerm(factor.id, factor.label, next - running, 1, `${round(running, 2)} x ${round(factor.value, 3)} = ${round(next, 2)}`));
    running = next;
  });
  const ledger = createCalculationStage(formula, terms, { rawSubtotal: Math.max(50, Math.round(running)), notes: ["Each factor is shown as its incremental effect so the contributions reconstruct final unconstrained demand."] });
  const unconstrainedDemand = Math.max(50, Math.round(ledger.result));
  const venueCapacity = Math.max(0, Math.round(show.venueCapacity ?? 0));
  const attendance = venueCapacity > 0 ? Math.min(venueCapacity, unconstrainedDemand) : unconstrainedDemand;
  return { attendance, ledger, calculation: { expectedCardStrength: cardStrength, marketDemand: market, recentPerformance: round(recentPerformance), showImportance: importance, venueCapacity, unconstrainedDemand, capacityLimited: venueCapacity > 0 && attendance < unconstrainedDemand } };
}

export function createShowExpectationSnapshot(universe: ShowEvaluationUniverse, show: PlannedShow, context: ShowEvaluationContext = {}): ShowExpectationSnapshot {
  const seeded = promotionStrength(context.company, universe.promotionPopularity);
  const promotionPopularity = universe.promotionPopularitySeeded ? universe.promotionPopularity : seeded.popularity;
  const strength = context.company ? seeded.snapshot : { ...seeded.snapshot, source: universe.promotionPopularitySeeded ? "Saved Promotion" as const : "Estimated Baseline" as const };
  const expectedLedger = expectedShowCalculation(promotionPopularity, strength.prestige, showImportance(show.showType));
  const cardStrength = expectedCardStrength(show, context.profiles ?? []);
  const recentReports = universe.showReports.slice(0, 5);
  const recentPerformance = recentReports.length ? recentReports.reduce((total, report) => total + report.overallScore, 0) / recentReports.length : expectedLedger.result;
  const attendance = attendanceForShow(show, promotionPopularity, strength, cardStrength.value, recentPerformance);
  const startingCrowd = startingCrowdCalculation(show, promotionPopularity);
  return {
    calculationVersion: SHOW_CALCULATION_SYSTEM_VERSION,
    promotionPopularity,
    promotionStrength: strength,
    expectedShowScore: expectedLedger.result,
    expectedCardStrength: cardStrength.value,
    recentPerformance: round(recentPerformance),
    estimatedAttendance: attendance.attendance,
    attendanceCalculation: attendance.calculation,
    crowdStart: startingCrowd.result,
    calculationLedger: { promotionStrength: seeded.ledger, expectedCardStrength: cardStrength.ledger, startingCrowd, expectedShowScore: expectedLedger, attendanceDemand: attendance.ledger },
    createdAt: now(),
  };
}

function durationWeight(minutes: number): number {
  const formula = CALCULATION_FORMULAS.showDurationWeight;
  return round(clamp(formula.baseline + Math.max(0, minutes) / formula.divisor, formula.capMinimum, formula.capMaximum), formula.roundingPlaces);
}

export function evaluateCompletedShow(universe: ShowEvaluationUniverse, show: PlannedShow, session: LiveCardSession, context: ShowEvaluationContext = {}): ShowEvaluationUniverse {
  if (universe.showReports.some((report) => report.showId === show.id)) return universe;
  if (session.status !== "Completed") throw new Error("Complete the live show before calculating its final evaluation.");
  const completed = session.segmentOrder.map((id) => session.progress.find((item) => item.segmentId === id)).filter((item): item is NonNullable<typeof item> => Boolean(item && item.status === "Completed"));
  if (!completed.length) throw new Error("A show needs at least one completed segment to receive a final evaluation.");
  const snapshot = session.expectationSnapshot ?? createShowExpectationSnapshot(universe, show, context);
  const mainEventId = completed.filter((progress) => show.segments.find((segment) => segment.id === progress.segmentId)?.section === "Main Show").at(-1)?.segmentId ?? "";
  let crowd = snapshot.crowdStart;
  const segments: CrowdProgressionEntry[] = completed.map((progress) => {
    const segment = show.segments.find((item) => item.id === progress.segmentId);
    const rawScore = progress.audience?.performanceRating ?? (progress.type === "match" ? progress.result?.finalResult.performanceRating ?? progress.result?.finalResult.matchScore ?? 0 : universe.angleEvaluations.find((item) => item.segmentId === progress.segmentId && item.appliedAt)?.rawPerformance ?? 0);
    const officialScore = progress.audience?.finalRating ?? (progress.type === "angle" ? universe.angleEvaluations.find((item) => item.segmentId === progress.segmentId && item.appliedAt)?.finalScore ?? 0 : progress.result?.finalResult.matchScore ?? 0);
    const before = progress.audience?.crowdBefore ?? crowd;
    crowd = progress.audience?.crowdAfter ?? round(clamp(before + (officialScore - before) / 3));
    const showWeightFormula = CALCULATION_FORMULAS.showOverallRating;
    const sectionWeight = segment?.section === "Main Show" ? showWeightFormula.mainShowWeight : showWeightFormula.prePostShowWeight;
    const mainEventWeight = progress.segmentId === mainEventId ? showWeightFormula.mainEventWeight : showWeightFormula.standardSegmentWeight;
    const actualDurationMinutes = progress.type === "match" ? progress.result?.finalResult.actualDurationMinutes ?? segment?.durationMinutes ?? 0 : segment?.durationMinutes ?? 0;
    const segmentDurationWeight = durationWeight(actualDurationMinutes);
    const weight = round(sectionWeight * mainEventWeight * segmentDurationWeight, 4);
    return {
      segmentId: progress.segmentId,
      segmentTitle: progress.title,
      segmentType: progress.type,
      score: round(rawScore),
      receptionScore: round(officialScore),
      crowdModifier: round(officialScore - rawScore),
      durationMinutes: round(actualDurationMinutes, 2),
      sectionWeight,
      durationWeight: segmentDurationWeight,
      mainEventWeight,
      importanceWeight: weight,
      weightedContribution: round(officialScore * weight, 2),
      mainEvent: progress.segmentId === mainEventId,
      crowdBefore: before,
      crowdAfter: crowd,
      reaction: reaction(officialScore),
    };
  });
  const totalWeight = segments.reduce((total, segment) => total + segment.importanceWeight, 0);
  const overallLedger = createCalculationStage(CALCULATION_FORMULAS.showOverallRating, segments.map((segment) => createCalculationTerm(segment.segmentId, segment.segmentTitle, segment.receptionScore, segment.importanceWeight / totalWeight, `Section ${segment.sectionWeight} x duration ${segment.durationWeight} x main-event ${segment.mainEventWeight} = ${segment.importanceWeight}.`)));
  const overallScore = overallLedger.result;
  const popularityLedger = createCalculationStage(CALCULATION_FORMULAS.showPopularityConsequence, [createCalculationTerm("expectation-gap", "Overall rating minus expected show score", overallScore - snapshot.expectedShowScore, 1 / CALCULATION_FORMULAS.showPopularityConsequence.divisor)]);
  const promotionPopularityAfter = round(clamp(snapshot.promotionPopularity + popularityLedger.result));
  const timestamp = now();
  const report: ShowEvaluationReport = {
    id: createPlannerId(),
    showId: show.id,
    showName: show.name,
    showDate: show.date,
    calculationVersion: SHOW_CALCULATION_SYSTEM_VERSION,
    overallScore,
    audienceReaction: reaction(overallScore),
    estimatedAttendance: snapshot.estimatedAttendance,
    expectedShowScore: snapshot.expectedShowScore,
    promotionStrength: snapshot.promotionStrength,
    attendanceCalculation: snapshot.attendanceCalculation,
    promotionPopularityBefore: snapshot.promotionPopularity,
    promotionPopularityAfter,
    promotionPopularityDelta: popularityLedger.result,
    crowdStart: snapshot.crowdStart,
    crowdFinish: crowd,
    segments,
    calculationLedger: snapshot.calculationLedger ? { overallScore: overallLedger, promotionStrength: snapshot.calculationLedger.promotionStrength, expectedCardStrength: snapshot.calculationLedger.expectedCardStrength, startingCrowd: snapshot.calculationLedger.startingCrowd, expectedShowScore: snapshot.calculationLedger.expectedShowScore, promotionPopularity: popularityLedger, attendanceDemand: snapshot.calculationLedger.attendanceDemand } : undefined,
    explanations: [
      "Every completed segment contributes its stored official crowd-adjusted rating.",
      "Segment weight equals section weight x duration weight x main-event weight. Main show is 1.0, pre/post show is 0.5, and the actual final main-show segment is 1.4.",
      "Duration weight is 0.5 + minutes/20, capped from 0.6 to 1.5. Inserted live segments count in their actual running-order position.",
      `Expectations, attendance, and starting crowd were frozen when the show began at ${snapshot.createdAt || "the recorded start"}; later wrestler consequences cannot alter them retroactively.`,
      "Promotion popularity changes once from the difference between the official overall rating and the frozen expected-show score.",
    ],
    createdAt: timestamp,
    appliedAt: timestamp,
  };
  return { ...universe, promotionPopularity: promotionPopularityAfter, promotionPopularitySeeded: true, showReports: [report, ...universe.showReports] };
}

export function emptyShowEvaluationUniverse(): ShowEvaluationUniverse {
  return { angleEvaluations: [], workerImpacts: [], showReports: [], promotionPopularity: 50, promotionPopularitySeeded: false };
}
