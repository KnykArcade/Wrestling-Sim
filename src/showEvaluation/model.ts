import { createMatchEngineProfile } from "../matchEngine/model";
import type { MatchEngineProfile } from "../matchEngine/types";
import { createPlannerId } from "../planner/model";
import type { AnglePerformanceRole, PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import type { LiveCardSession } from "../liveCard/types";
import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import type { StartingUniverseCompany } from "../startingUniverse/types";
import type {
  AngleEvaluation,
  AngleParticipantEvaluation,
  AngleWorkerImpact,
  CrowdProgressionEntry,
  ShowEvaluationReport,
  ShowEvaluationUniverse,
  PromotionStrengthSnapshot,
  AttendanceCalculation,
} from "./types";

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
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

export function workerKey(worker: PlannedWorkerReference): string {
  return `${worker.source}:${worker.id || normalized(worker.name)}`;
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

function roleScore(worker: PlannedWorkerReference, profile: MatchEngineProfile | null): { role: AnglePerformanceRole; score: number; detail: string } {
  const role = normalizeAnglePerformanceRole(worker.role);
  if (!profile) return { role, score: 50, detail: "No saved performance profile; neutral 50 was used." };
  if (role === "Physical") return { role, score: round(profile.skills.Menace * .35 + profile.skills.Brawling * .25 + profile.skills.Charisma * .2 + profile.popularity * .2), detail: "Physical role used menace, brawling, charisma, and popularity." };
  if (role === "Reaction") return { role, score: round(profile.skills.Selling * .35 + profile.skills.Charisma * .25 + profile.skills.Psychology * .2 + profile.popularity * .2), detail: "Reaction role used selling, charisma, psychology, and popularity." };
  if (role === "Speaking") return { role, score: round(profile.skills.Charisma * .35 + profile.skills.Psychology * .25 + profile.popularity * .25 + profile.gimmick * 20 * .15), detail: "Speaking role used charisma, psychology, popularity, and normalized gimmick." };
  return { role, score: round(profile.skills.Charisma * .25 + profile.skills.Menace * .25 + profile.popularity * .3 + profile.gimmick * 20 * .2), detail: "Presence role used charisma, menace, popularity, and normalized gimmick." };
}

function contentModifier(segment: PlannedSegment): { value: number; detail: string } {
  const content = `${segment.angleContentType} ${segment.purpose}`.toLowerCase();
  if (/comedy/.test(content)) return { value: 1, detail: "Comedy receives a small presentation adjustment and still depends on participant skill." };
  if (/attack|brawl|violent|physical/.test(content)) return { value: 2, detail: "Physical content receives a modest crowd-energy adjustment." };
  if (/championship|challenge|contract|reveal|turn|betray/.test(content)) return { value: 3, detail: "High-stakes story content gives the segment more immediate importance." };
  return { value: 0, detail: "Standard storyline content has no automatic bonus or penalty." };
}

export function calculateAngleEvaluation(show: PlannedShow, segment: PlannedSegment, profiles: MatchEngineProfile[]): AngleEvaluation {
  if (segment.type !== "angle") throw new Error("Only an angle can be evaluated as an angle.");
  if (!segment.segmentOutput.trim()) throw new Error("Record the final Angle Output before calculating its result.");
  if (segment.workers.length === 0) throw new Error("Add at least one participant before calculating the angle result.");
  const participantBase = segment.workers.map((worker) => ({ worker, result: roleScore(worker, profileFor(worker, profiles)) }));
  const performance = participantBase.reduce((total, item) => total + item.result.score, 0) / participantBase.length;
  const content = contentModifier(segment);
  const durationModifier = segment.durationMinutes >= 4 && segment.durationMinutes <= 10 ? 3 : segment.durationMinutes < 2 || segment.durationMinutes > 18 ? -6 : -1;
  const purposeModifier = segment.purpose.trim() ? 3 : -4;
  const outputModifier = segment.segmentOutput.trim().length >= 80 ? 3 : 0;
  const storylineModifier = Math.min(5, segment.storylines.length * 2.5);
  const calculatedScore = round(clamp(performance * .78 + 12 + content.value + durationModifier + purposeModifier + outputModifier + storylineModifier));
  const participants: AngleParticipantEvaluation[] = participantBase.map(({ worker, result }) => {
    const individual = round(clamp(result.score * .65 + calculatedScore * .35));
    return {
      workerKey: workerKey(worker),
      workerName: worker.name,
      role: result.role,
      performanceScore: individual,
      momentumDelta: round(clamp((individual - 60) / 14, -3, 3)),
      popularityDelta: round(clamp((individual - 65) / 24, -1.5, 1.5)),
      explanation: [result.detail, `The ${calculatedScore.toFixed(1)} angle score shares credit or blame with every participant.`],
    };
  });
  return {
    id: createPlannerId(), idempotencyKey: `${show.id}:${segment.id}:angle-consequences`, showId: show.id, showName: show.name, segmentId: segment.id, segmentTitle: segment.title,
    status: "Calculated", calculationVersion: CALCULATION_SYSTEM_VERSION, calculatedScore, finalScore: calculatedScore, overrideReason: "",
    factors: [
      { label: "Participant performance", value: round(performance * .78 + 12), detail: "Role-specific skills and popularity form the foundation." },
      { label: "Content", value: content.value, detail: content.detail },
      { label: "Duration", value: durationModifier, detail: segment.durationMinutes >= 4 && segment.durationMinutes <= 10 ? "The angle is within the effective 4–10 minute range." : "The duration falls outside the strongest range." },
      { label: "Purpose", value: purposeModifier, detail: segment.purpose.trim() ? "A clear purpose helps the audience understand the segment." : "No purpose was recorded." },
      { label: "Finished output", value: outputModifier, detail: outputModifier ? "The final output contains enough detail to support the intended story beat." : "The brief output receives no detail bonus." },
      { label: "Storyline heat", value: storylineModifier, detail: segment.storylines.length ? `${segment.storylines.length} active storyline connection${segment.storylines.length === 1 ? "" : "s"}.` : "No storyline connection was assigned." },
    ],
    participants, calculatedAt: now(), finalizedAt: "", appliedAt: "",
  };
}

export function finalizeAngleEvaluation(evaluation: AngleEvaluation, overrideScore?: number, overrideReason = ""): AngleEvaluation {
  if (overrideScore !== undefined && (!overrideReason.trim() || !Number.isFinite(overrideScore))) throw new Error("Record a valid override score and explain why it replaces the calculated result.");
  const finalScore = overrideScore === undefined ? evaluation.calculatedScore : round(clamp(overrideScore));
  const scoreDifference = finalScore - evaluation.calculatedScore;
  return {
    ...evaluation,
    status: overrideScore === undefined ? "Accepted" : "Overridden",
    finalScore,
    overrideReason: overrideScore === undefined ? "" : overrideReason.trim(),
    participants: evaluation.participants.map((participant) => ({
      ...participant,
      momentumDelta: round(clamp(participant.momentumDelta + scoreDifference / 20, -3, 3)),
      popularityDelta: round(clamp(participant.popularityDelta + scoreDifference / 40, -1.5, 1.5)),
    })),
    finalizedAt: now(),
  };
}

export function applyAngleEvaluation(universe: ShowEvaluationUniverse, evaluation: AngleEvaluation, profiles: MatchEngineProfile[]): { universe: ShowEvaluationUniverse; profiles: MatchEngineProfile[] } {
  const existing = universe.angleEvaluations.find((item) => item.id === evaluation.id || (item.idempotencyKey === evaluation.idempotencyKey && item.appliedAt));
  if (existing?.appliedAt) return { universe, profiles };
  if (evaluation.status === "Calculated") throw new Error("Accept or override the angle result before applying its consequences.");
  const timestamp = now();
  const workerImpacts = [...universe.workerImpacts];
  const nextProfiles = [...profiles];
  evaluation.participants.forEach((participant) => {
    let profileIndex = nextProfiles.findIndex((item) => item.workerKey === participant.workerKey);
    if (profileIndex < 0) {
      const [source, ...idParts] = participant.workerKey.split(":");
      const created = createMatchEngineProfile({ id: idParts.join(":") || normalized(participant.workerName), name: participant.workerName, source: source === "tew" ? "tew" : "manual" });
      nextProfiles.push(created);
      profileIndex = nextProfiles.length - 1;
    }
    const priorProfile = nextProfiles[profileIndex];
    const updatedProfile: MatchEngineProfile = {
      ...priorProfile,
      momentum: round(clamp(priorProfile.momentum + participant.momentumDelta, -20, 20)),
      popularity: round(clamp(priorProfile.popularity + participant.popularityDelta)),
      updatedAt: timestamp,
    };
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
  const value = normalized(size);
  const exact: Record<string, number> = {
    insignificant: 15, tiny: 25, local: 25, small: 40, regional: 45, medium: 55,
    big: 70, national: 75, large: 82, huge: 90, international: 92, global: 100, titanic: 100,
  };
  return exact[value] ?? 50;
}

function sizeAttendanceBaseline(size: string): number {
  const score = sizeScore(size);
  if (score >= 95) return 50000;
  if (score >= 85) return 25000;
  if (score >= 78) return 12000;
  if (score >= 65) return 6000;
  if (score >= 50) return 2500;
  if (score >= 35) return 1000;
  if (score >= 20) return 400;
  return 150;
}

function showImportance(showType: string): number {
  if (/pay.per.view|ppv|premium|major|classic|final/i.test(showType)) return 3;
  if (/special|competition|event/i.test(showType)) return 2;
  if (/television|tv/i.test(showType)) return 1;
  if (/house|tour/i.test(showType)) return -1;
  return 0;
}

export function promotionStrength(company: StartingUniverseCompany | null | undefined, savedPopularity: number): { popularity: number; snapshot: PromotionStrengthSnapshot } {
  if (!company) return {
    popularity: clamp(savedPopularity),
    snapshot: { source: "Saved Promotion", companyName: "", companySize: "Medium", sizeScore: 50, prestige: clamp(savedPopularity), momentum: 50 },
  };
  const companySizeScore = sizeScore(company.size);
  const prestige = clamp(company.prestige);
  const momentum = clamp(company.momentum);
  return {
    popularity: round(clamp(prestige * .55 + companySizeScore * .35 + momentum * .1)),
    snapshot: { source: "Imported Company", companyName: company.name, companySize: company.size, sizeScore: companySizeScore, prestige, momentum },
  };
}

function expectedCardStrength(show: PlannedShow, profiles: MatchEngineProfile[]): number {
  const keys = new Set<string>();
  const values: number[] = [];
  show.segments.forEach((segment) => segment.workers.forEach((worker) => {
    const key = workerKey(worker);
    if (keys.has(key)) return;
    keys.add(key);
    const profile = profileFor(worker, profiles);
    if (!profile) return;
    values.push(profile.overall * .45 + profile.popularity * .35 + clamp(profile.momentum + 50) * .1 + profile.health * .1);
  }));
  return round(values.length ? values.reduce((total, value) => total + value, 0) / values.length : 50);
}

function attendanceForShow(
  show: PlannedShow,
  popularity: number,
  strength: PromotionStrengthSnapshot,
  cardStrength: number,
  recentPerformance: number,
): { attendance: number; calculation: AttendanceCalculation } {
  const importance = showImportance(show.showType);
  const market = clamp(show.marketDemand ?? 50);
  const base = sizeAttendanceBaseline(strength.companySize);
  const popularityFactor = .45 + clamp(popularity) / 100 * .75;
  const marketFactor = .55 + market / 100 * .9;
  const cardFactor = .75 + clamp(cardStrength) / 100 * .5;
  const recentFactor = .85 + clamp(recentPerformance) / 100 * .3;
  const importanceFactor = importance === 3 ? 1.35 : importance === 2 ? 1.18 : importance === 1 ? 1 : importance === -1 ? .75 : .9;
  const momentumFactor = .8 + clamp(strength.momentum) / 100 * .4;
  const unconstrainedDemand = Math.max(50, Math.round(base * popularityFactor * marketFactor * cardFactor * recentFactor * importanceFactor * momentumFactor));
  const venueCapacity = Math.max(0, Math.round(show.venueCapacity ?? 0));
  const attendance = venueCapacity > 0 ? Math.min(venueCapacity, unconstrainedDemand) : unconstrainedDemand;
  return {
    attendance,
    calculation: { expectedCardStrength: cardStrength, marketDemand: market, recentPerformance: round(recentPerformance), showImportance: importance, venueCapacity, unconstrainedDemand, capacityLimited: venueCapacity > 0 && attendance < unconstrainedDemand },
  };
}

export function evaluateCompletedShow(universe: ShowEvaluationUniverse, show: PlannedShow, session: LiveCardSession, context: ShowEvaluationContext = {}): ShowEvaluationUniverse {
  const existing = universe.showReports.find((report) => report.showId === show.id);
  if (existing) return universe;
  if (session.status !== "Completed") throw new Error("Complete the live show before calculating its final evaluation.");
  const completed = session.progress.filter((item) => item.status === "Completed");
  if (!completed.length) throw new Error("A show needs at least one completed segment to receive a final evaluation.");
  const seeded = promotionStrength(context.company, universe.promotionPopularity);
  const promotionPopularityBefore = universe.promotionPopularitySeeded ? universe.promotionPopularity : seeded.popularity;
  const strength = context.company ? seeded.snapshot : { ...seeded.snapshot, source: universe.promotionPopularitySeeded ? "Saved Promotion" as const : "Estimated Baseline" as const };
  const importance = showImportance(show.showType);
  const crowdStart = round(clamp(42 + promotionPopularityBefore * .15 + importance * 2.5, 35, 70));
  const segmentExpectation = round(clamp(50 + promotionPopularityBefore * .15, 50, 68));
  let crowd = crowdStart;
  let weightedTotal = 0;
  let totalWeight = 0;
  const mainShowIds = completed.filter((progress) => show.segments.find((segment) => segment.id === progress.segmentId)?.section === "Main Show").map((progress) => progress.segmentId);
  const mainEventId = mainShowIds[mainShowIds.length - 1] ?? "";
  const segments: CrowdProgressionEntry[] = completed.map((progress, index) => {
    const segment = show.segments.find((item) => item.id === progress.segmentId);
    const angle = universe.angleEvaluations.find((item) => item.segmentId === progress.segmentId && item.appliedAt);
    const score = progress.type === "match" ? progress.result?.finalResult.matchScore ?? 0 : angle?.finalScore ?? 0;
    const isMainEvent = progress.segmentId === mainEventId;
    const weight = segment?.section === "Main Show" ? (isMainEvent ? 1.4 : 1) : .65;
    const before = crowd;
    const crowdModifier = round(clamp((before - 50) * .08, -4, 4));
    const receptionScore = round(clamp(score + crowdModifier));
    crowd = round(clamp(crowd + (receptionScore - segmentExpectation) / 7, 0, 100));
    weightedTotal += receptionScore * weight;
    totalWeight += weight;
    return { segmentId: progress.segmentId, segmentTitle: progress.title, segmentType: progress.type, score: round(score), receptionScore, crowdModifier, importanceWeight: weight, mainEvent: isMainEvent, crowdBefore: before, crowdAfter: crowd, reaction: reaction(receptionScore) };
  });
  const overallScore = round(weightedTotal / totalWeight);
  const expectedShowScore = round(clamp(48 + promotionPopularityBefore * .18 + strength.prestige * .12 + importance, 45, 82));
  const promotionPopularityDelta = round(clamp((overallScore - expectedShowScore) / 10, -2.5, 2.5));
  const promotionPopularityAfter = round(clamp(promotionPopularityBefore + promotionPopularityDelta));
  const cardStrength = expectedCardStrength(show, context.profiles ?? []);
  const recentReports = universe.showReports.slice(0, 5);
  const recentPerformance = recentReports.length ? recentReports.reduce((total, report) => total + report.overallScore, 0) / recentReports.length : expectedShowScore;
  const attendanceResult = attendanceForShow(show, promotionPopularityBefore, strength, cardStrength, recentPerformance);
  const timestamp = now();
  const report: ShowEvaluationReport = {
    id: createPlannerId(), showId: show.id, showName: show.name, showDate: show.date, calculationVersion: CALCULATION_SYSTEM_VERSION, overallScore, audienceReaction: reaction(overallScore), estimatedAttendance: attendanceResult.attendance, expectedShowScore, promotionStrength: strength, attendanceCalculation: attendanceResult.calculation,
    promotionPopularityBefore, promotionPopularityAfter, promotionPopularityDelta, crowdStart, crowdFinish: crowd, segments,
    explanations: [
      "Every completed segment contributes its accepted score.",
      "The actual final main-show segment carries 1.4× weight; other main-show segments carry 1×; pre-show and post-show segments carry 0.65×.",
      `The crowd began at ${crowdStart.toFixed(1)} from promotion strength and show importance, then affected how later segments were received.`,
      `The promotion was expected to deliver a ${expectedShowScore.toFixed(1)} show; popularity changed according to performance above or below that expectation.`,
      "Attendance uses promotion size and popularity, show importance, expected card strength, local market demand, recent show performance, momentum, and the venue ceiling.",
      "Promotion popularity and attendance consequences apply once and cannot be duplicated by reopening the report.",
    ],
    createdAt: timestamp, appliedAt: timestamp,
  };
  return { ...universe, promotionPopularity: promotionPopularityAfter, promotionPopularitySeeded: true, showReports: [report, ...universe.showReports] };
}

export function emptyShowEvaluationUniverse(): ShowEvaluationUniverse {
  return { angleEvaluations: [], workerImpacts: [], showReports: [], promotionPopularity: 50, promotionPopularitySeeded: false };
}
