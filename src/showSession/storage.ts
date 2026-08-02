import { createShowSessionRecord, emptyShowSessionUniverse } from "./model";
import type {
  ShowSessionCheckpointLog,
  ShowSessionRecord,
  ShowSessionStep,
  ShowSessionUniverse,
} from "./types";
import type { OutputLineageStage } from "../outputLibrary/types";

export const SHOW_SESSION_STORAGE_KEY = "tew-story-tracker:show-session:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function step(value: unknown): ShowSessionStep {
  return value === "setup" || value === "creative" || value === "package" || value === "entry" || value === "result" || value === "wrap-up" ? value : "overview";
}

function lineageStage(value: unknown): OutputLineageStage {
  const stages: OutputLineageStage[] = ["Plan", "Generated Draft", "Applied Output", "Ready for TEW", "Entered in TEW Version", "Reconciled Actual Version"];
  return stages.includes(value as OutputLineageStage) ? value as OutputLineageStage : "Applied Output";
}

function normalizeCheckpoint(value: unknown): ShowSessionCheckpointLog | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.segmentId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    stage: lineageStage(value.stage),
    outputItemId: text(value.outputItemId),
    outputVersionId: text(value.outputVersionId),
    fingerprint: text(value.fingerprint),
    createdAt: text(value.createdAt),
  };
}

function normalizeRecord(value: unknown): ShowSessionRecord | null {
  if (!isRecord(value) || !text(value.showId)) return null;
  const defaults = createShowSessionRecord(text(value.showId));
  return {
    showId: text(value.showId),
    selectedSegmentId: text(value.selectedSegmentId),
    activeStep: step(value.activeStep),
    appliedOutputSegmentIds: strings(value.appliedOutputSegmentIds),
    readyForTewSegmentIds: strings(value.readyForTewSegmentIds),
    dismissedCheckpointFingerprints: strings(value.dismissedCheckpointFingerprints).slice(-80),
    checkpointLog: Array.isArray(value.checkpointLog) ? value.checkpointLog.map(normalizeCheckpoint).filter((item): item is ShowSessionCheckpointLog => item !== null).slice(0, 200) : [],
    awaitingResultsAt: text(value.awaitingResultsAt),
    lastSnapshotFile: text(value.lastSnapshotFile),
    lastOpenedAt: text(value.lastOpenedAt, defaults.lastOpenedAt),
    updatedAt: text(value.updatedAt, defaults.updatedAt),
  };
}

export function parseShowSessionUniverse(value: unknown): ShowSessionUniverse {
  if (!isRecord(value)) return emptyShowSessionUniverse();
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord).filter((item): item is ShowSessionRecord => item !== null) : [],
    lastShowId: text(value.lastShowId),
  };
}

export function loadShowSessionUniverse(storage: Pick<Storage, "getItem">): ShowSessionUniverse {
  const stored = storage.getItem(SHOW_SESSION_STORAGE_KEY);
  if (!stored) return emptyShowSessionUniverse();
  try { return parseShowSessionUniverse(JSON.parse(stored) as unknown); } catch { return emptyShowSessionUniverse(); }
}

export function saveShowSessionUniverse(storage: Pick<Storage, "setItem">, universe: ShowSessionUniverse): void {
  storage.setItem(SHOW_SESSION_STORAGE_KEY, JSON.stringify(universe));
}
