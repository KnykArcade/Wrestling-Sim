import { CALCULATION_SYSTEM_VERSION, calculateStarRating } from "../calculations/foundation";
import { importedApproachIdForMatchEngineId } from "../startingUniverse/formulas";
import { resolveMatch } from "../matchResolution/engine";
import type { MatchResolutionImportance, MatchResolutionSetup, MatchResolutionWorkerSettings, ResolutionApproachId } from "../matchResolution/types";
import type { StartingUniverseWorkbookMetrics } from "../startingUniverse/types";
import { evaluateApproachPlan, normalizeApproachName } from "./model";
import type {
  MatchEngineProfile,
  MatchPerformancePreview,
  MatchPerformanceSettings,
  MatchWorkerApproachPlan,
  MatchAimId,
} from "./types";
import {
  performancePreviewInputFingerprint,
  performancePreviewProfileFingerprint,
  performancePreviewSetupFingerprint,
} from "./previewIntegrity";
export {
  currentPerformancePreview,
  performancePreviewInputFingerprint,
  performancePreviewIsCurrent,
  performancePreviewProfileFingerprint,
  performancePreviewSetupFingerprint,
  resolveMatchFormat,
  resolveMatchImportance,
} from "./previewIntegrity";

export interface MatchPerformanceWorkerInput {
  profile: MatchEngineProfile;
  plan: MatchWorkerApproachPlan;
  workbookMetrics?: StartingUniverseWorkbookMetrics | null;
  teamId?: string;
  teamName?: string;
}

export interface GenerateMatchPerformanceInput {
  workers: MatchPerformanceWorkerInput[];
  aimId: MatchAimId;
  durationMinutes: number;
  approachLimit?: number | null;
  plannedWinner: string;
  settings: MatchPerformanceSettings;
  importance?: MatchResolutionImportance;
  matchType?: string;
  format?: NonNullable<MatchResolutionSetup["format"]>;
  eliminationRules?: boolean;
  seed?: string;
}


function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function advisoryStarRating(matchScore: number): number {
  return calculateStarRating(matchScore);
}

export function formatStarRating(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}★`;
}

function resolutionApproaches(plan: MatchWorkerApproachPlan): ResolutionApproachId[] {
  return plan.selectedApproachIds
    .map((id) => importedApproachIdForMatchEngineId(id))
    .filter((id): id is ResolutionApproachId => id !== null);
}

function workerSettings(input: GenerateMatchPerformanceInput, worker: MatchPerformanceWorkerInput): MatchResolutionWorkerSettings {
  const isPlannedWinner = normalizeApproachName(worker.profile.workerName) === normalizeApproachName(input.plannedWinner);
  return {
    workerKey: worker.profile.workerKey,
    workerId: worker.profile.workerId,
    workerName: worker.profile.workerName,
    approachMode: "Manual",
    lockedApproachIds: [],
    manualApproachIds: resolutionApproaches(worker.plan),
    storyNeed: 0,
    momentum: worker.profile.momentum,
    bookingBias: input.settings.authority === "competitive-preview" && isPlannedWinner ? input.settings.bookingInfluence * 2 : 0,
    teamId: worker.teamId || worker.profile.workerKey,
    teamName: worker.teamName || worker.profile.workerName,
  };
}

export function generateMatchPerformancePreview(input: GenerateMatchPerformanceInput): MatchPerformancePreview | null {
  if (input.workers.length < 2) return null;
  const setup: MatchResolutionSetup = {
    showId: "preview",
    showName: "Booking Preview",
    showDate: "",
    segmentId: "preview",
    segmentTitle: "Booking Preview",
    matchType: input.matchType ?? (input.workers.length === 2 ? "1 vs. 1" : "Multi Person"),
    durationMinutes: input.durationMinutes,
    approachLimit: input.approachLimit,
    aimId: input.aimId,
    importance: input.importance ?? "Television",
    championship: "",
    competitionRound: "",
    chemistry: input.settings.chemistry ?? 0,
    volatility: input.settings.volatility,
    format: input.format ?? (input.workers.length === 2 ? "Singles" : "Multi Person"),
    eliminationRules: input.eliminationRules ?? false,
    workers: input.workers.map((worker) => workerSettings(input, worker)),
  };
  const attempt = resolveMatch({
    setup,
    workers: input.workers.map((worker) => ({ profile: worker.profile, workbookMetrics: worker.workbookMetrics ?? null })),
    seed: input.seed,
  });
  const planPaceByWorker = new Map(input.workers.map((worker) => {
    const plan = evaluateApproachPlan(
      worker.profile,
      input.aimId,
      input.durationMinutes,
      worker.plan.selectedApproachIds,
      input.approachLimit,
    );
    return [worker.profile.workerKey, plan] as const;
  }));
  const workerResults = attempt.workerResults.map((result) => {
    const plan = planPaceByWorker.get(result.workerKey);
    return {
      workerKey: result.workerKey,
      workerName: result.workerName,
      mentalStateId: result.mentalStateId,
      mentalStateName: result.mentalStateName,
      mentalBase: result.mentalBase,
      mentalStateScore: result.mentalStateScore,
      mentalModifier: result.mentalModifier,
      luck: result.luck,
      swing: result.swing,
      consistencyVariance: result.consistencyVariance,
      averageApproachRating: result.averageApproachRating,
      approachExecution: result.approachExecution,
      presentationScore: result.presentationScore,
      staminaStatus: result.staminaStatus,
      staminaModifier: result.staminaModifier,
      actualPace: plan?.actualPace ?? result.actualPace,
      paceStatus: plan?.pace.status ?? result.paceStatus,
      paceModifier: plan?.pace.modifier ?? result.paceModifier,
      performanceScore: result.performanceScore,
      competitiveScore: result.competitiveScore,
      winProbability: result.winProbability,
    };
  });
  const performanceLeader = [...workerResults].sort((left, right) => right.performanceScore - left.performanceScore)[0];
  const probabilityLeader = [...workerResults].sort((left, right) => right.winProbability - left.winProbability)[0];
  let projectedWinnerKey = "";
  let projectedWinnerName = "";
  let confidence = 0;
  let summary = `TEW remains authoritative. ${performanceLeader.workerName} has the strongest advisory performance profile, but this preview does not select a winner.`;

  if (input.settings.authority === "booker-selected") {
    const fixed = workerResults.find((result) => normalizeApproachName(result.workerName) === normalizeApproachName(input.plannedWinner));
    projectedWinnerKey = fixed?.workerKey ?? "";
    projectedWinnerName = fixed?.workerName ?? input.plannedWinner;
    confidence = projectedWinnerName ? 100 : 0;
    summary = projectedWinnerName
      ? `${projectedWinnerName} remains fixed by the booking. The preview evaluates execution and match quality only.`
      : "Booker-selected mode is active, but no planned winner has been entered. No winner was assigned.";
  } else if (input.settings.authority === "competitive-preview") {
    projectedWinnerKey = probabilityLeader.workerKey;
    projectedWinnerName = probabilityLeader.workerName;
    confidence = round(probabilityLeader.winProbability * 100, 1);
    summary = `The optional competitive preview favors ${projectedWinnerName} at ${confidence}% confidence. This does not change the planned winner or TEW result.`;
  }

  return {
    id: attempt.id,
    generatedAt: attempt.generatedAt,
    seed: attempt.seed,
    authority: input.settings.authority,
    calculationVersion: attempt.calculationVersion,
    setupFingerprint: performancePreviewSetupFingerprint({
      workerPlans: input.workers.map((worker) => ({ ...worker.plan, teamId: worker.teamId, teamName: worker.teamName })),
      aimId: input.aimId,
      durationMinutes: input.durationMinutes,
      approachLimit: input.approachLimit,
      plannedWinner: input.plannedWinner,
      settings: input.settings,
      importance: input.importance ?? "Television",
      matchType: input.matchType,
      format: input.format,
      eliminationRules: input.eliminationRules,
    }),
    profileFingerprint: performancePreviewProfileFingerprint(input.workers),
    inputFingerprint: performancePreviewInputFingerprint(input),
    matchScore: attempt.engineResult.matchScore,
    starRating: attempt.engineResult.starRating,
    performanceLeaderKey: performanceLeader.workerKey,
    performanceLeaderName: performanceLeader.workerName,
    projectedWinnerKey,
    projectedWinnerName,
    confidence,
    summary,
    workerResults,
  };
}
