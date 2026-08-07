import { CALCULATION_SYSTEM_VERSION } from "../calculations/foundation";
import type { MatchResolutionImportance, MatchResolutionSetup } from "../matchResolution/types";
import type { PlannedSegment } from "../planner/types";
import type { StartingUniverseWorkbookMetrics } from "../startingUniverse/types";
import { normalizeApproachName, workerProfileKey } from "./model";
import type { MatchEngineProfile, MatchPerformancePreview, MatchPerformanceSettings, MatchWorkerApproachPlan } from "./types";

export interface PreviewWorkerSource {
  profile: MatchEngineProfile;
  plan: MatchWorkerApproachPlan;
  workbookMetrics?: StartingUniverseWorkbookMetrics | null;
  teamId?: string;
  teamName?: string;
}

export interface PerformancePreviewFingerprintInput {
  workerPlans: Array<Pick<MatchWorkerApproachPlan, "workerKey" | "selectedApproachIds"> & { teamId?: string; teamName?: string }>;
  aimId: PlannedSegment["matchApproachSetup"]["matchAimId"];
  durationMinutes: number;
  approachLimit?: number | null;
  plannedWinner: string;
  settings: MatchPerformanceSettings;
  importance?: MatchResolutionImportance;
  matchType?: string;
  format?: NonNullable<MatchResolutionSetup["format"]>;
  eliminationRules?: boolean;
}

function fingerprintHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function performancePreviewSetupFingerprint(input: PerformancePreviewFingerprintInput): string {
  const workers = input.workerPlans.map((plan) => ({
    workerKey: plan.workerKey,
    selectedApproachIds: plan.selectedApproachIds.slice(0, 4),
    teamId: plan.teamId ?? plan.workerKey,
    teamName: plan.teamName ?? "",
  })).sort((left, right) => left.workerKey.localeCompare(right.workerKey));
  return fingerprintHash(JSON.stringify({
    version: CALCULATION_SYSTEM_VERSION,
    aimId: input.aimId,
    durationMinutes: input.durationMinutes,
    approachLimit: input.approachLimit ?? null,
    plannedWinner: normalizeApproachName(input.plannedWinner),
    settings: input.settings,
    importance: input.importance ?? "Television",
    matchType: input.matchType ?? "",
    format: input.format ?? "Singles",
    eliminationRules: input.eliminationRules ?? false,
    workers,
  }));
}

export function performancePreviewProfileFingerprint(workers: PreviewWorkerSource[]): string {
  return fingerprintHash(JSON.stringify(workers.map((worker) => ({
    workerKey: worker.profile.workerKey,
    styleId: worker.profile.styleId,
    overall: worker.profile.overall,
    health: worker.profile.health,
    popularity: worker.profile.popularity,
    momentum: worker.profile.momentum,
    experience: worker.profile.experience,
    fanReaction: worker.profile.fanReaction,
    gimmick: worker.profile.gimmick,
    skills: worker.profile.skills,
  })).sort((left, right) => left.workerKey.localeCompare(right.workerKey))));
}

export function performancePreviewInputFingerprint(input: Omit<PerformancePreviewFingerprintInput, "workerPlans"> & { workers: PreviewWorkerSource[] }): string {
  const setupFingerprint = performancePreviewSetupFingerprint({ ...input, workerPlans: input.workers.map((worker) => ({ ...worker.plan, teamId: worker.teamId, teamName: worker.teamName })) });
  const profileFingerprint = performancePreviewProfileFingerprint(input.workers);
  const workbookMetrics = input.workers.map((worker) => ({ workerKey: worker.profile.workerKey, workbookMetrics: worker.workbookMetrics ?? null })).sort((left, right) => left.workerKey.localeCompare(right.workerKey));
  return fingerprintHash(JSON.stringify({ setupFingerprint, profileFingerprint, workbookMetrics }));
}

export function resolveMatchImportance(
  configured: MatchPerformanceSettings["importance"],
  segment: Pick<PlannedSegment, "id" | "section" | "durationMinutes" | "championship" | "championshipId" | "competitionId" | "competitionRoundLabel">,
  cardSegments: Array<Pick<PlannedSegment, "id" | "section">>,
): MatchResolutionImportance {
  if (configured && configured !== "Auto") return configured;
  if (segment.championshipId || segment.championship.trim()) return "Championship";
  if (segment.competitionId || segment.competitionRoundLabel.trim()) return "Tournament";
  const mainShowSegments = cardSegments.filter((item) => item.section === "Main Show");
  if (segment.section === "Main Show" && mainShowSegments.at(-1)?.id === segment.id) return "Main Event";
  if (segment.durationMinutes >= 15) return "Feature";
  return "Television";
}

export function resolveMatchFormat(
  segment: Pick<PlannedSegment, "matchType" | "workers">,
): NonNullable<MatchResolutionSetup["format"]> {
  const matchType = normalizeApproachName(segment.matchType);
  if (matchType.includes("battle royal") || matchType.includes("royal rumble")) return "Battle Royal";
  if (matchType.includes("elimination") || matchType.includes("survivor series")) return "Elimination";
  const sides = segment.workers.map((worker) => normalizeApproachName(worker.side)).filter(Boolean);
  if (new Set(sides).size >= 2 && new Set(sides).size < segment.workers.length) return "Team";
  return segment.workers.length === 2 ? "Singles" : "Multi Person";
}

export function performancePreviewIsCurrent(input: {
  segment: PlannedSegment;
  cardSegments: PlannedSegment[];
  profiles: MatchEngineProfile[];
  workbookMetricsByWorkerKey?: Map<string, StartingUniverseWorkbookMetrics | null>;
}): boolean {
  const preview = input.segment.matchApproachSetup.performancePreview;
  if (!preview || preview.calculationVersion !== CALCULATION_SYSTEM_VERSION) return false;
  const plans = input.segment.matchApproachSetup.workerPlans.filter((plan) => plan.selectedApproachIds.length > 0);
  const workers = plans.flatMap((plan) => {
    const worker = input.segment.workers.find((candidate) => workerProfileKey(candidate) === plan.workerKey || normalizeApproachName(candidate.name) === normalizeApproachName(plan.workerName));
    const profile = input.profiles.find((candidate) => candidate.workerKey === plan.workerKey || normalizeApproachName(candidate.workerName) === normalizeApproachName(plan.workerName));
    if (!worker || !profile) return [];
    const side = normalizeApproachName(worker.side);
    const teammates = side ? input.segment.workers.filter((candidate) => normalizeApproachName(candidate.side) === side) : [worker];
    return [{
      profile,
      plan,
      workbookMetrics: input.workbookMetricsByWorkerKey?.get(profile.workerKey) ?? null,
      teamId: side || profile.workerKey,
      teamName: teammates.map((candidate) => candidate.name).join(" & ") || profile.workerName,
    }];
  });
  if (workers.length < 2 || workers.length !== plans.length) return false;
  const importance = resolveMatchImportance(input.segment.matchApproachSetup.performanceSettings.importance, input.segment, input.cardSegments);
  const format = resolveMatchFormat(input.segment);
  const fingerprintInput = {
    workerPlans: workers.map((worker) => ({ ...worker.plan, teamId: worker.teamId, teamName: worker.teamName })),
    workers,
    aimId: input.segment.matchApproachSetup.matchAimId,
    durationMinutes: input.segment.durationMinutes,
    approachLimit: input.segment.matchApproachSetup.approachLimit,
    plannedWinner: input.segment.plannedWinner,
    settings: input.segment.matchApproachSetup.performanceSettings,
    importance,
    matchType: input.segment.matchType,
    format,
    eliminationRules: format === "Elimination" || format === "Battle Royal",
  };
  if (preview.setupFingerprint !== performancePreviewSetupFingerprint(fingerprintInput)) return false;
  if (preview.profileFingerprint !== performancePreviewProfileFingerprint(workers)) return false;
  return input.workbookMetricsByWorkerKey ? preview.inputFingerprint === performancePreviewInputFingerprint(fingerprintInput) : true;
}

export function currentPerformancePreview(input: Parameters<typeof performancePreviewIsCurrent>[0]): MatchPerformancePreview | null {
  return performancePreviewIsCurrent(input) ? input.segment.matchApproachSetup.performancePreview : null;
}
