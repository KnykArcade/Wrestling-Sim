import { emptyBridgeUniverse } from "../bridge/model";
import { loadBridgeUniverse, parseBridgeUniverse, saveBridgeUniverse } from "../bridge/storage";
import type { BridgeUniverse } from "../bridge/types";
import { emptyChampionshipUniverse, loadChampionshipUniverse, parseChampionshipUniverse, saveChampionshipUniverse } from "../championships/storage";
import type { ChampionshipUniverse } from "../championships/types";
import { emptyCompetitionUniverse } from "../competitions/model";
import { loadCompetitionUniverse, parseCompetitionUniverse, saveCompetitionUniverse } from "../competitions/storage";
import type { CompetitionUniverse } from "../competitions/types";
import { emptyCreativeControlData, loadCreativeControlData, parseCreativeControlData, saveCreativeControlData } from "../control/storage";
import type { CreativeControlData } from "../control/types";
import { emptyHandoffUniverse, loadHandoffUniverse, parseHandoffUniverse, saveHandoffUniverse } from "../handoff/storage";
import type { HandoffUniverse } from "../handoff/types";
import {
  emptyMatchEngineUniverse,
  loadMatchEngineUniverse,
  normalizeMatchApproachSetup,
  parseMatchEngineUniverse,
  saveMatchEngineUniverse,
} from "../matchEngine/storage";
import type { MatchEngineUniverse } from "../matchEngine/types";
import { emptyShowOperationsUniverse } from "../operations/model";
import { loadShowOperationsUniverse, parseShowOperationsUniverse, saveShowOperationsUniverse } from "../operations/storage";
import type { ShowOperationsUniverse } from "../operations/types";
import { emptyOutputLibraryUniverse } from "../outputLibrary/model";
import { loadOutputLibraryUniverse, parseOutputLibraryUniverse, saveOutputLibraryUniverse } from "../outputLibrary/storage";
import type { OutputLibraryUniverse } from "../outputLibrary/types";
import { emptyProfileLibraryUniverse } from "../profileLibrary/model";
import { loadProfileLibraryUniverse, parseProfileLibraryUniverse, saveProfileLibraryUniverse } from "../profileLibrary/storage";
import type { ProfileLibraryUniverse } from "../profileLibrary/types";
import { emptyShowSessionUniverse } from "../showSession/model";
import { loadShowSessionUniverse, parseShowSessionUniverse, saveShowSessionUniverse } from "../showSession/storage";
import type { ShowSessionUniverse } from "../showSession/types";
import { loadTrackerStorylines, parseTrackerStorylines, saveTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import { emptyTransferUniverse } from "../transfer/model";
import { loadTransferUniverse, parseTransferUniverse, saveTransferUniverse } from "../transfer/storage";
import type { TransferUniverse } from "../transfer/types";
import { emptyWorkbenchUniverse } from "../workbench/model";
import { loadWorkbenchUniverse, parseWorkbenchUniverse, saveWorkbenchUniverse } from "../workbench/storage";
import type { WorkbenchUniverse } from "../workbench/types";
import { emptyWorkerUniverse, loadWorkerUniverse, parseWorkerUniverse, saveWorkerUniverse } from "../workers/storage";
import type { WorkerUniverse } from "../workers/types";
import { createEmptySegmentReconciliation, createPlannedSegment } from "./model";
import type {
  ActualMatchSnapshot,
  ActualShowSnapshot,
  PlannerBackup,
  PlannerBackupBundle,
  PlannedSegment,
  PlannedShow,
  PlannedStorylineReference,
  PlannedWorkerReference,
  SegmentReconciliation,
  ShowReconciliation,
} from "./types";

export const PLANNER_STORAGE_KEY = "tew-story-tracker:planned-shows:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeWorker(value: unknown): PlannedWorkerReference | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  return {
    id: text(value.id, `manual-${value.name}`),
    name: value.name,
    role: text(value.role),
    side: text(value.side),
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeStoryline(value: unknown): PlannedStorylineReference | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  return {
    id: text(value.id, `manual-${value.name}`),
    name: value.name,
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeActualMatch(value: unknown): ActualMatchSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const placement = value.placement === "Pre-Show" || value.placement === "Post-Show" ? value.placement : "Main Show";
  return {
    id: value.id,
    description: text(value.description),
    rating: nullableNumber(value.rating),
    winner: text(value.winner),
    matchTime: text(value.matchTime),
    notes: text(value.notes),
    placement,
    workers: Array.isArray(value.workers) ? value.workers.filter((worker): worker is string => typeof worker === "string") : [],
  };
}

function normalizeSegmentReconciliation(value: unknown): SegmentReconciliation {
  const defaults = createEmptySegmentReconciliation();
  if (!isRecord(value)) return defaults;
  return {
    linkedMatchId: text(value.linkedMatchId),
    actualMatch: normalizeActualMatch(value.actualMatch),
    happenedAsPlanned: nullableBoolean(value.happenedAsPlanned),
    actualRating: nullableNumber(value.actualRating),
    finalNarrative: text(value.finalNarrative),
    changes: text(value.changes),
    actualConsequences: text(value.actualConsequences),
    finalFollowUp: text(value.finalFollowUp),
    reconciledAt: text(value.reconciledAt),
  };
}

function normalizeActualShow(value: unknown): ActualShowSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: text(value.name),
    date: text(value.date),
    rating: nullableNumber(value.rating),
    attendance: nullableNumber(value.attendance),
    venue: text(value.venue),
    company: text(value.company),
    broadcast: text(value.broadcast),
    sourceFile: text(value.sourceFile),
  };
}

function normalizeShowReconciliation(value: unknown): ShowReconciliation | null {
  if (!isRecord(value)) return null;
  const actualShow = normalizeActualShow(value.actualShow);
  if (!actualShow) return null;
  return {
    linkedShowId: text(value.linkedShowId, actualShow.id),
    actualShow,
    linkedAt: text(value.linkedAt),
    completedAt: text(value.completedAt),
    notes: text(value.notes),
  };
}

function normalizeSegment(value: unknown): PlannedSegment | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.type !== "match" && value.type !== "angle") ||
    (value.section !== "Pre-Show" && value.section !== "Main Show" && value.section !== "Post-Show") ||
    typeof value.title !== "string"
  ) return null;

  const defaults = createPlannedSegment(value.type);
  const workers = Array.isArray(value.workers)
    ? value.workers.map(normalizeWorker).filter((item): item is PlannedWorkerReference => item !== null)
    : [];
  const storylines = Array.isArray(value.storylines)
    ? value.storylines.map(normalizeStoryline).filter((item): item is PlannedStorylineReference => item !== null)
    : [];
  const workflowStatus = value.workflowStatus === "Entered in TEW" || value.workflowStatus === "Completed" || value.workflowStatus === "Reconciled" ? value.workflowStatus : "Planned";
  const titlePurposes = ["", "Defense", "Vacant Title", "Tournament Final", "Unification", "Other"];
  const titleDecisions = ["", "Retained", "Changed Hands", "Vacated", "Unresolved"];

  return {
    ...defaults,
    id: value.id,
    type: value.type,
    section: value.section,
    title: value.title,
    durationMinutes: Math.max(1, finiteNumber(value.durationMinutes, defaults.durationMinutes)),
    notes: text(value.notes),
    workers,
    storylines,
    purpose: text(value.purpose),
    consequences: text(value.consequences),
    followUp: text(value.followUp),
    privateNotes: text(value.privateNotes),
    matchType: text(value.matchType, defaults.matchType),
    championship: text(value.championship),
    championshipId: text(value.championshipId),
    championshipMatchPurpose: titlePurposes.includes(text(value.championshipMatchPurpose)) ? value.championshipMatchPurpose as PlannedSegment["championshipMatchPurpose"] : "",
    championEntering: text(value.championEntering),
    challenger: text(value.challenger),
    expectedTitleChange: nullableBoolean(value.expectedTitleChange),
    championshipStakes: text(value.championshipStakes),
    titleResultDecision: titleDecisions.includes(text(value.titleResultDecision)) ? value.titleResultDecision as PlannedSegment["titleResultDecision"] : "",
    titleResultConfirmedAt: text(value.titleResultConfirmedAt),
    plannedWinner: text(value.plannedWinner),
    plannedFinish: text(value.plannedFinish),
    matchStory: text(value.matchStory),
    keyMoments: text(value.keyMoments),
    interference: text(value.interference),
    postMatch: text(value.postMatch),
    matchApproachSetup: normalizeMatchApproachSetup(value.matchApproachSetup),
    competitionId: text(value.competitionId),
    competitionFixtureId: text(value.competitionFixtureId),
    competitionRoundLabel: text(value.competitionRoundLabel),
    angleLocation: text(value.angleLocation, defaults.angleLocation),
    angleContentType: text(value.angleContentType, defaults.angleContentType),
    segmentOutput: text(value.segmentOutput),
    audienceTakeaway: text(value.audienceTakeaway),
    bookingIdeaId: text(value.bookingIdeaId),
    workflowStatus,
    reconciliation: normalizeSegmentReconciliation(value.reconciliation),
  };
}

function normalizeShow(value: unknown): PlannedShow | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.segments)) return null;
  const segments = value.segments.map(normalizeSegment);
  if (segments.some((segment) => segment === null)) return null;
  const status = value.status === "Ready" || value.status === "Completed" || value.status === "Reconciled" ? value.status : "Draft";
  return {
    id: value.id,
    name: value.name,
    date: text(value.date),
    company: text(value.company),
    showType: text(value.showType, "Television"),
    venue: text(value.venue),
    expectedMinutes: Math.max(15, finiteNumber(value.expectedMinutes, 120)),
    status,
    notes: text(value.notes),
    createdAt: text(value.createdAt, new Date().toISOString()),
    updatedAt: text(value.updatedAt, new Date().toISOString()),
    segments: segments as PlannedSegment[],
    reconciliation: normalizeShowReconciliation(value.reconciliation),
  };
}

export function parsePlannerShows(value: unknown): PlannedShow[] {
  if (!Array.isArray(value)) throw new Error("The planned-show data is not in a supported format.");
  const shows = value.map(normalizeShow);
  if (shows.some((show) => show === null)) throw new Error("The planned-show data is not in a supported format.");
  return shows as PlannedShow[];
}

export function loadPlannedShows(storage: Pick<Storage, "getItem">): PlannedShow[] {
  const stored = storage.getItem(PLANNER_STORAGE_KEY);
  if (!stored) return [];
  try { return parsePlannerShows(JSON.parse(stored) as unknown); } catch { return []; }
}

export function savePlannedShows(storage: Pick<Storage, "setItem">, shows: PlannedShow[]): void {
  storage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(shows));
}

function browserStorylines(): TrackerStoryline[] {
  return typeof window === "undefined" ? [] : loadTrackerStorylines(window.localStorage);
}

function browserWorkers(): WorkerUniverse {
  return typeof window === "undefined" ? emptyWorkerUniverse() : loadWorkerUniverse(window.localStorage);
}

function browserControl(): CreativeControlData {
  return typeof window === "undefined" ? emptyCreativeControlData() : loadCreativeControlData(window.localStorage);
}

function browserChampionships(): ChampionshipUniverse {
  return typeof window === "undefined" ? emptyChampionshipUniverse() : loadChampionshipUniverse(window.localStorage);
}

function browserHandoff(): HandoffUniverse {
  return typeof window === "undefined" ? emptyHandoffUniverse() : loadHandoffUniverse(window.localStorage);
}

function browserMatchEngine(): MatchEngineUniverse {
  return typeof window === "undefined" ? emptyMatchEngineUniverse() : loadMatchEngineUniverse(window.localStorage);
}

function browserCompetitions(): CompetitionUniverse {
  return typeof window === "undefined" ? emptyCompetitionUniverse() : loadCompetitionUniverse(window.localStorage);
}

function browserBridge(): BridgeUniverse {
  return typeof window === "undefined" ? emptyBridgeUniverse() : loadBridgeUniverse(window.localStorage);
}

function browserTransfer(): TransferUniverse {
  return typeof window === "undefined" ? emptyTransferUniverse() : loadTransferUniverse(window.localStorage);
}

function browserOperations(): ShowOperationsUniverse {
  return typeof window === "undefined" ? emptyShowOperationsUniverse() : loadShowOperationsUniverse(window.localStorage);
}

function browserWorkbench(): WorkbenchUniverse {
  return typeof window === "undefined" ? emptyWorkbenchUniverse() : loadWorkbenchUniverse(window.localStorage);
}

function browserProfileLibrary(): ProfileLibraryUniverse {
  return typeof window === "undefined" ? emptyProfileLibraryUniverse() : loadProfileLibraryUniverse(window.localStorage);
}

function browserOutputLibrary(): OutputLibraryUniverse {
  return typeof window === "undefined" ? emptyOutputLibraryUniverse() : loadOutputLibraryUniverse(window.localStorage);
}

function browserShowSession(): ShowSessionUniverse {
  return typeof window === "undefined" ? emptyShowSessionUniverse() : loadShowSessionUniverse(window.localStorage);
}

export function createPlannerBackup(
  shows: PlannedShow[],
  storylines: TrackerStoryline[] = browserStorylines(),
  workers: WorkerUniverse = browserWorkers(),
  control: CreativeControlData = browserControl(),
  championships: ChampionshipUniverse = browserChampionships(),
  handoff: HandoffUniverse = browserHandoff(),
  matchEngine: MatchEngineUniverse = browserMatchEngine(),
  competitions: CompetitionUniverse = browserCompetitions(),
  bridge: BridgeUniverse = browserBridge(),
  transfer: TransferUniverse = browserTransfer(),
  operations: ShowOperationsUniverse = browserOperations(),
  workbench: WorkbenchUniverse = browserWorkbench(),
  profileLibrary: ProfileLibraryUniverse = browserProfileLibrary(),
  outputLibrary: OutputLibraryUniverse = browserOutputLibrary(),
  showSession: ShowSessionUniverse = browserShowSession(),
): PlannerBackup {
  return {
    product: "TEW IX Story Tracker",
    version: 18,
    exportedAt: new Date().toISOString(),
    shows,
    storylines,
    workers,
    control,
    championships,
    handoff,
    matchEngine,
    competitions,
    bridge,
    transfer,
    operations,
    workbench,
    profileLibrary,
    outputLibrary,
    showSession,
  };
}

export function parsePlannerBackupBundle(textValue: string): PlannerBackupBundle {
  let value: unknown;
  try { value = JSON.parse(textValue) as unknown; } catch { throw new Error("The selected backup is not valid JSON."); }
  if (
    !isRecord(value) ||
    value.product !== "TEW IX Story Tracker" ||
    ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(typeof value.version === "number" ? value.version : -1)
  ) throw new Error("The selected file is not a supported TEW Story Tracker backup.");
  const version = value.version as number;
  return {
    shows: parsePlannerShows(value.shows),
    storylines: version >= 4 ? parseTrackerStorylines(value.storylines ?? []) : [],
    workers: version >= 5 ? parseWorkerUniverse(value.workers ?? emptyWorkerUniverse()) : emptyWorkerUniverse(),
    control: version >= 6 ? parseCreativeControlData(value.control ?? emptyCreativeControlData()) : emptyCreativeControlData(),
    championships: version >= 7 ? parseChampionshipUniverse(value.championships ?? emptyChampionshipUniverse()) : emptyChampionshipUniverse(),
    handoff: version >= 8 ? parseHandoffUniverse(value.handoff ?? emptyHandoffUniverse()) : emptyHandoffUniverse(),
    matchEngine: version >= 9 ? parseMatchEngineUniverse(value.matchEngine ?? emptyMatchEngineUniverse()) : emptyMatchEngineUniverse(),
    competitions: version >= 11 ? parseCompetitionUniverse(value.competitions ?? emptyCompetitionUniverse()) : emptyCompetitionUniverse(),
    bridge: version >= 12 ? parseBridgeUniverse(value.bridge ?? emptyBridgeUniverse()) : emptyBridgeUniverse(),
    transfer: version >= 13 ? parseTransferUniverse(value.transfer ?? emptyTransferUniverse()) : emptyTransferUniverse(),
    operations: version >= 14 ? parseShowOperationsUniverse(value.operations ?? emptyShowOperationsUniverse()) : emptyShowOperationsUniverse(),
    workbench: version >= 15 ? parseWorkbenchUniverse(value.workbench ?? emptyWorkbenchUniverse()) : emptyWorkbenchUniverse(),
    profileLibrary: version >= 16 ? parseProfileLibraryUniverse(value.profileLibrary ?? emptyProfileLibraryUniverse()) : emptyProfileLibraryUniverse(),
    outputLibrary: version >= 17 ? parseOutputLibraryUniverse(value.outputLibrary ?? emptyOutputLibraryUniverse()) : emptyOutputLibraryUniverse(),
    showSession: version >= 18 ? parseShowSessionUniverse(value.showSession ?? emptyShowSessionUniverse()) : emptyShowSessionUniverse(),
  };
}

export function parsePlannerBackup(textValue: string): PlannedShow[] {
  const bundle = parsePlannerBackupBundle(textValue);
  if (typeof window !== "undefined") {
    saveTrackerStorylines(window.localStorage, bundle.storylines);
    saveWorkerUniverse(window.localStorage, bundle.workers);
    saveCreativeControlData(window.localStorage, bundle.control);
    saveChampionshipUniverse(window.localStorage, bundle.championships);
    saveHandoffUniverse(window.localStorage, bundle.handoff);
    saveMatchEngineUniverse(window.localStorage, bundle.matchEngine);
    saveCompetitionUniverse(window.localStorage, bundle.competitions);
    saveBridgeUniverse(window.localStorage, bundle.bridge);
    saveTransferUniverse(window.localStorage, bundle.transfer);
    saveShowOperationsUniverse(window.localStorage, bundle.operations);
    saveWorkbenchUniverse(window.localStorage, bundle.workbench);
    saveProfileLibraryUniverse(window.localStorage, bundle.profileLibrary);
    saveOutputLibraryUniverse(window.localStorage, bundle.outputLibrary);
    saveShowSessionUniverse(window.localStorage, bundle.showSession);
  }
  return bundle.shows;
}
