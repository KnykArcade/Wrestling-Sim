import { emptyShowEvaluationUniverse } from "./model";
import type { ShowEvaluationUniverse } from "./types";

export const SHOW_EVALUATION_STORAGE_KEY = "wrestling-sim:show-evaluation:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseShowEvaluationUniverse(value: unknown): ShowEvaluationUniverse {
  if (!isRecord(value)) return emptyShowEvaluationUniverse();
  const angleEvaluations = Array.isArray(value.angleEvaluations)
    ? value.angleEvaluations.map((item) => isRecord(item) ? {
      ...item,
      idempotencyKey: typeof item.idempotencyKey === "string" ? item.idempotencyKey : `${String(item.showId ?? "legacy")}:${String(item.segmentId ?? item.id ?? "angle")}:angle-consequences`,
      calculationVersion: typeof item.calculationVersion === "string" ? item.calculationVersion : "legacy-unversioned",
      setupFingerprint: typeof item.setupFingerprint === "string" ? item.setupFingerprint : "",
      rawPerformance: number(item.rawPerformance, number(item.calculatedScore, number(item.finalScore, 50))),
      anticipation: number(item.anticipation, 50),
      crowdBefore: number(item.crowdBefore, 50),
      crowdResponse: number(item.crowdResponse, number(item.finalScore, 50)),
      participants: Array.isArray(item.participants) ? item.participants.map((participant) => isRecord(participant) ? {
        ...participant,
        rolePerformance: number(participant.rolePerformance, number(participant.performanceScore, 50)),
        momentumBefore: number(participant.momentumBefore, 50),
        momentumAfter: number(participant.momentumAfter, 50 + number(participant.momentumDelta)),
        popularityBefore: number(participant.popularityBefore, 50),
        popularityAfter: number(participant.popularityAfter, 50 + number(participant.popularityDelta)),
      } : participant) : [],
    } : item) as ShowEvaluationUniverse["angleEvaluations"]
    : [];
  const showReports = Array.isArray(value.showReports)
    ? value.showReports.map((item) => isRecord(item) ? {
      ...item,
      calculationVersion: typeof item.calculationVersion === "string" ? item.calculationVersion : "legacy-unversioned",
      expectedShowScore: typeof item.expectedShowScore === "number" ? item.expectedShowScore : 65,
      promotionStrength: isRecord(item.promotionStrength) ? item.promotionStrength : { source: "Estimated Baseline", companyName: "", companySize: "Medium", sizeScore: 50, prestige: 50, momentum: 50 },
      attendanceCalculation: isRecord(item.attendanceCalculation) ? item.attendanceCalculation : { expectedCardStrength: 50, marketDemand: 50, recentPerformance: 50, showImportance: 0, venueCapacity: 0, unconstrainedDemand: typeof item.estimatedAttendance === "number" ? item.estimatedAttendance : 0, capacityLimited: false },
      segments: Array.isArray(item.segments) ? item.segments.map((segment) => isRecord(segment) ? {
        ...segment,
        receptionScore: number(segment.receptionScore, number(segment.score)),
        crowdModifier: number(segment.crowdModifier),
        durationMinutes: number(segment.durationMinutes),
        mainEvent: Boolean(segment.mainEvent),
        sectionWeight: number(segment.sectionWeight, number(segment.importanceWeight, 1)),
        durationWeight: number(segment.durationWeight, 1),
        mainEventWeight: number(segment.mainEventWeight, 1),
        importanceWeight: number(segment.importanceWeight, 1),
        weightedContribution: number(segment.weightedContribution, number(segment.receptionScore, number(segment.score)) * number(segment.importanceWeight, 1)),
      } : segment) : [],
    } : item) as ShowEvaluationUniverse["showReports"]
    : [];
  return {
    angleEvaluations,
    workerImpacts: Array.isArray(value.workerImpacts) ? value.workerImpacts as ShowEvaluationUniverse["workerImpacts"] : [],
    showReports,
    promotionPopularity: typeof value.promotionPopularity === "number" && Number.isFinite(value.promotionPopularity) ? Math.max(0, Math.min(100, value.promotionPopularity)) : 50,
    promotionPopularitySeeded: typeof value.promotionPopularitySeeded === "boolean" ? value.promotionPopularitySeeded : showReports.length > 0,
  };
}

export function loadShowEvaluationUniverse(storage: Pick<Storage, "getItem">): ShowEvaluationUniverse {
  const raw = storage.getItem(SHOW_EVALUATION_STORAGE_KEY);
  if (!raw) return emptyShowEvaluationUniverse();
  try { return parseShowEvaluationUniverse(JSON.parse(raw) as unknown); } catch { return emptyShowEvaluationUniverse(); }
}

export function saveShowEvaluationUniverse(storage: Pick<Storage, "setItem">, universe: ShowEvaluationUniverse): void {
  storage.setItem(SHOW_EVALUATION_STORAGE_KEY, JSON.stringify(universe));
}
