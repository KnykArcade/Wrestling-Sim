import type { MatchEngineProfile } from "../matchEngine/types";
import { createPlannerId } from "../planner/model";
import type { PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import type { LiveCardSession } from "../liveCard/types";
import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import type {
  AngleEvaluation,
  AngleParticipantEvaluation,
  AngleWorkerImpact,
  CrowdProgressionEntry,
  ShowEvaluationReport,
  ShowEvaluationUniverse,
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

function roleScore(worker: PlannedWorkerReference, profile: MatchEngineProfile | null): { score: number; detail: string } {
  if (!profile) return { score: 50, detail: "No saved performance profile; neutral 50 was used." };
  const role = worker.role.toLowerCase();
  if (/fight|attack|physical|enforcer/.test(role)) return { score: round(profile.skills.Menace * .35 + profile.skills.Brawling * .25 + profile.skills.Charisma * .2 + profile.popularity * .2), detail: "Physical role used menace, brawling, charisma, and popularity." };
  if (/sell|victim|react/.test(role)) return { score: round(profile.skills.Selling * .35 + profile.skills.Charisma * .25 + profile.skills.Psychology * .2 + profile.popularity * .2), detail: "Reaction role used selling, charisma, psychology, and popularity." };
  return { score: round(profile.skills.Charisma * .35 + profile.skills.Psychology * .25 + profile.popularity * .25 + profile.gimmick * .15), detail: "Speaking role used charisma, psychology, popularity, and gimmick." };
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
      role: worker.role || "Participant",
      performanceScore: individual,
      momentumDelta: round(clamp((individual - 60) / 14, -3, 3)),
      popularityDelta: round(clamp((calculatedScore - 68) / 28, -1.5, 1.5)),
      explanation: [result.detail, `The ${calculatedScore.toFixed(1)} angle score shares credit or blame with every participant.`],
    };
  });
  return {
    id: createPlannerId(), showId: show.id, showName: show.name, segmentId: segment.id, segmentTitle: segment.title,
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

export function applyAngleEvaluation(universe: ShowEvaluationUniverse, evaluation: AngleEvaluation): ShowEvaluationUniverse {
  const existing = universe.angleEvaluations.find((item) => item.id === evaluation.id);
  if (existing?.appliedAt) return universe;
  if (evaluation.status === "Calculated") throw new Error("Accept or override the angle result before applying its consequences.");
  const timestamp = now();
  const workerImpacts = [...universe.workerImpacts];
  evaluation.participants.forEach((participant) => {
    const index = workerImpacts.findIndex((item) => item.workerKey === participant.workerKey);
    const prior: AngleWorkerImpact = index >= 0 ? workerImpacts[index] : { workerKey: participant.workerKey, workerName: participant.workerName, momentum: 0, popularity: 50, angleHistory: [], updatedAt: "" };
    const next: AngleWorkerImpact = {
      ...prior,
      workerName: participant.workerName,
      momentum: round(clamp(prior.momentum + participant.momentumDelta, -20, 20)),
      popularity: round(clamp(prior.popularity + participant.popularityDelta)),
      angleHistory: [{ angleEvaluationId: evaluation.id, showId: evaluation.showId, showName: evaluation.showName, segmentId: evaluation.segmentId, segmentTitle: evaluation.segmentTitle, score: evaluation.finalScore, momentumDelta: participant.momentumDelta, popularityDelta: participant.popularityDelta, occurredAt: timestamp }, ...prior.angleHistory].slice(0, 200),
      updatedAt: timestamp,
    };
    if (index >= 0) workerImpacts[index] = next; else workerImpacts.push(next);
  });
  const applied = { ...evaluation, appliedAt: timestamp };
  return { ...universe, workerImpacts, angleEvaluations: universe.angleEvaluations.some((item) => item.id === evaluation.id) ? universe.angleEvaluations.map((item) => item.id === evaluation.id ? applied : item) : [applied, ...universe.angleEvaluations] };
}

function reaction(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 75) return "Strong";
  if (score >= 65) return "Positive";
  if (score >= 55) return "Mixed";
  if (score >= 45) return "Flat";
  return "Poor";
}

export function evaluateCompletedShow(universe: ShowEvaluationUniverse, show: PlannedShow, session: LiveCardSession): ShowEvaluationUniverse {
  const existing = universe.showReports.find((report) => report.showId === show.id);
  if (existing) return universe;
  if (session.status !== "Completed") throw new Error("Complete the live show before calculating its final evaluation.");
  const completed = session.progress.filter((item) => item.status === "Completed");
  if (!completed.length) throw new Error("A show needs at least one completed segment to receive a final evaluation.");
  let crowd = 50;
  let weightedTotal = 0;
  let totalWeight = 0;
  const segments: CrowdProgressionEntry[] = completed.map((progress, index) => {
    const segment = show.segments.find((item) => item.id === progress.segmentId);
    const angle = universe.angleEvaluations.find((item) => item.segmentId === progress.segmentId && item.appliedAt);
    const score = progress.type === "match" ? progress.result?.finalResult.matchScore ?? 0 : angle?.finalScore ?? 0;
    const isLast = index === completed.length - 1;
    const weight = segment?.section === "Main Show" ? (isLast ? 1.4 : 1) : .65;
    const before = crowd;
    crowd = round(clamp(crowd + (score - 60) / 7, 0, 100));
    weightedTotal += score * weight;
    totalWeight += weight;
    return { segmentId: progress.segmentId, segmentTitle: progress.title, segmentType: progress.type, score: round(score), importanceWeight: weight, crowdBefore: before, crowdAfter: crowd, reaction: reaction(score) };
  });
  const overallScore = round(weightedTotal / totalWeight);
  const promotionPopularityBefore = universe.promotionPopularity;
  const promotionPopularityDelta = round(clamp((overallScore - 65) / 12, -2.5, 2.5));
  const promotionPopularityAfter = round(clamp(promotionPopularityBefore + promotionPopularityDelta));
  const showTypeMultiplier = /pay.per.view|ppv|premium/i.test(show.showType) ? 1.35 : /television|tv/i.test(show.showType) ? 1.1 : 1;
  const estimatedAttendance = Math.max(100, Math.round((350 + promotionPopularityBefore * 85 + overallScore * 25) * showTypeMultiplier));
  const timestamp = now();
  const report: ShowEvaluationReport = {
    id: createPlannerId(), showId: show.id, showName: show.name, showDate: show.date, calculationVersion: CALCULATION_SYSTEM_VERSION, overallScore, audienceReaction: reaction(overallScore), estimatedAttendance,
    promotionPopularityBefore, promotionPopularityAfter, promotionPopularityDelta, crowdStart: 50, crowdFinish: crowd, segments,
    explanations: [
      "Every completed segment contributes its accepted score.",
      "The final main-show segment carries 1.4× weight; other main-show segments carry 1×; pre-show and post-show segments carry 0.65×.",
      "Crowd level moves after each segment according to how far its score is above or below 60.",
      "Attendance is an in-game estimate based on promotion popularity, final show score, and show type.",
      "Promotion popularity moves once from the final score and cannot be applied again by reopening the report.",
    ],
    createdAt: timestamp, appliedAt: timestamp,
  };
  return { ...universe, promotionPopularity: promotionPopularityAfter, showReports: [report, ...universe.showReports] };
}

export function emptyShowEvaluationUniverse(): ShowEvaluationUniverse {
  return { angleEvaluations: [], workerImpacts: [], showReports: [], promotionPopularity: 50 };
}
