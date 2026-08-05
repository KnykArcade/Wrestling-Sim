import { MATCH_APPROACHES } from "../matchEngine/catalog";
import { approachLimitForSetup } from "../matchEngine/model";
import type { ShowOperationsRecord } from "../operations/types";
import { snapshotOutputSegment } from "../outputLibrary/model";
import type {
  OutputLibraryItem,
  OutputLibraryUniverse,
  OutputLineageStage,
  OutputSegmentSnapshot,
} from "../outputLibrary/types";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { TransferRecord, TransferUniverse } from "../transfer/types";
import type {
  SegmentSessionStatus,
  SegmentSessionSummary,
  SessionCheckpointChange,
  SessionCheckpointOffer,
  ShowSessionCheckpointLog,
  ShowSessionIntegrityIssue,
  ShowSessionRecord,
  ShowSessionStep,
  ShowSessionUniverse,
  UnifiedShowSessionSummary,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function sessionId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function emptyShowSessionUniverse(): ShowSessionUniverse {
  return { records: [], lastShowId: "" };
}

export function createShowSessionRecord(showId: string, segmentId = ""): ShowSessionRecord {
  const timestamp = now();
  return {
    showId,
    selectedSegmentId: segmentId,
    activeStep: segmentId ? "setup" : "overview",
    appliedOutputSegmentIds: [],
    readyForTewSegmentIds: [],
    dismissedCheckpointFingerprints: [],
    checkpointLog: [],
    awaitingResultsAt: "",
    lastSnapshotFile: "",
    lastOpenedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function showSessionRecord(showId: string, universe: ShowSessionUniverse, segmentId = ""): ShowSessionRecord {
  return universe.records.find((record) => record.showId === showId) ?? createShowSessionRecord(showId, segmentId);
}

export function upsertShowSessionRecord(universe: ShowSessionUniverse, record: ShowSessionRecord): ShowSessionUniverse {
  const updated = { ...record, updatedAt: now() };
  return {
    records: universe.records.some((item) => item.showId === record.showId)
      ? universe.records.map((item) => item.showId === record.showId ? updated : item)
      : [updated, ...universe.records],
    lastShowId: record.showId,
  };
}

export function selectShowSessionSegment(record: ShowSessionRecord, segmentId: string, step: ShowSessionStep = "setup"): ShowSessionRecord {
  return { ...record, selectedSegmentId: segmentId, activeStep: step, lastOpenedAt: now(), updatedAt: now() };
}

export function setShowSessionStep(record: ShowSessionRecord, step: ShowSessionStep): ShowSessionRecord {
  return { ...record, activeStep: step, lastOpenedAt: now(), updatedAt: now() };
}

export function markSessionOutputApplied(record: ShowSessionRecord, segmentId: string): ShowSessionRecord {
  return { ...record, appliedOutputSegmentIds: unique([...record.appliedOutputSegmentIds, segmentId]), updatedAt: now() };
}

export function markSessionReadyForTew(record: ShowSessionRecord, segmentId: string): ShowSessionRecord {
  return {
    ...record,
    appliedOutputSegmentIds: unique([...record.appliedOutputSegmentIds, segmentId]),
    readyForTewSegmentIds: unique([...record.readyForTewSegmentIds, segmentId]),
    updatedAt: now(),
  };
}

export function markSessionAwaitingResults(record: ShowSessionRecord, snapshotFile = ""): ShowSessionRecord {
  return {
    ...record,
    awaitingResultsAt: now(),
    lastSnapshotFile: snapshotFile || record.lastSnapshotFile,
    activeStep: "result",
    updatedAt: now(),
  };
}

export function rememberSessionSnapshot(record: ShowSessionRecord, snapshotFile: string): ShowSessionRecord {
  return { ...record, lastSnapshotFile: snapshotFile, updatedAt: now() };
}

function outputItemForSegment(show: PlannedShow, segment: PlannedSegment, library: OutputLibraryUniverse): OutputLibraryItem | null {
  return library.items.find((item) => item.sourceShowId === show.id && item.sourceSegmentId === segment.id) ?? null;
}

function transferRecordForShow(showId: string, transfer: TransferUniverse): TransferRecord | null {
  return transfer.records.find((record) => record.showId === showId) ?? null;
}

function activeTransferPackage(record: TransferRecord | null) {
  return record?.packageHistory.find((pkg) => pkg.id === record.activePackageId) ?? record?.packageHistory.at(-1) ?? null;
}

function setupComplete(segment: PlannedSegment): boolean {
  if (!segment.title.trim() || /^untitled/i.test(segment.title)) return false;
  if (segment.durationMinutes <= 0 || segment.workers.length === 0) return false;
  if (segment.workers.some((worker) => !worker.role.trim())) return false;
  if (segment.type === "match") return Boolean(segment.matchType.trim());
  return Boolean(segment.angleLocation.trim() && segment.angleContentType.trim());
}

export function segmentApproachesComplete(segment: PlannedSegment): boolean {
  if (segment.type === "angle") return true;
  if (segment.workers.length === 0) return false;
  const required = approachLimitForSetup(segment.durationMinutes, segment.matchApproachSetup.approachLimit);
  return segment.workers.every((worker) => {
    const workerKey = `${worker.source}:${worker.id}`;
    const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === workerKey || normalize(item.workerName) === normalize(worker.name));
    return plan?.selectedApproachIds.length === required;
  });
}

function outputComplete(segment: PlannedSegment): boolean {
  return segment.type === "match" ? Boolean(segment.matchStory.trim()) : Boolean(segment.segmentOutput.trim());
}

function creativeStarted(segment: PlannedSegment): boolean {
  return [
    segment.notes,
    segment.purpose,
    segment.consequences,
    segment.followUp,
    segment.matchStory,
    segment.keyMoments,
    segment.segmentOutput,
    segment.audienceTakeaway,
  ].some((value) => value.trim()) || segment.matchApproachSetup.workerPlans.some((plan) => plan.selectedApproachIds.length > 0);
}

function currentOutputVersion(item: OutputLibraryItem | null) {
  if (!item) return null;
  return item.versions.find((version) => version.id === item.currentVersionId) ?? item.versions.at(-1) ?? null;
}

function snapshotMatchesCurrent(segment: PlannedSegment, item: OutputLibraryItem | null): boolean {
  const current = currentOutputVersion(item);
  return Boolean(current && JSON.stringify(current.snapshot) === JSON.stringify(snapshotOutputSegment(segment)));
}

function resultSuggestionAvailable(segmentId: string, record: ShowOperationsRecord | null): boolean {
  return Boolean(record?.resultSessions.some((session) => !session.appliedAt && session.suggestions.some((suggestion) => suggestion.plannedSegmentId === segmentId && suggestion.status !== "Rejected")));
}

function segmentTransferState(showId: string, segmentId: string, transfer: TransferUniverse): { started: boolean; complete: boolean } {
  const record = transferRecordForShow(showId, transfer);
  const progress = record?.segmentProgress.find((item) => item.segmentId === segmentId);
  if (!progress) return { started: false, complete: false };
  const started = progress.completed || progress.fields.some((field) => field.status !== "Pending" && field.status !== "Not Applicable");
  return { started, complete: progress.completed };
}

function segmentStatus(input: {
  segment: PlannedSegment;
  show: PlannedShow;
  session: ShowSessionRecord;
  outputItem: OutputLibraryItem | null;
  transfer: TransferUniverse;
  operationsRecord: ShowOperationsRecord | null;
}): SegmentSessionStatus {
  const { segment, show, session, outputItem, transfer, operationsRecord } = input;
  const transferState = segmentTransferState(show.id, segment.id, transfer);
  if (segment.reconciliation.actualMatch || segment.workflowStatus === "Reconciled") return "Reconciled";
  if (resultSuggestionAvailable(segment.id, operationsRecord)) return "Reconciliation Needed";
  if (transferState.complete && session.awaitingResultsAt) return "Awaiting Result";
  if (transferState.complete || segment.workflowStatus === "Entered in TEW" || segment.workflowStatus === "Completed") return "Entered";
  if (transferState.started) return "Entering in TEW";
  const ready = setupComplete(segment) && segmentApproachesComplete(segment) && outputComplete(segment) && snapshotMatchesCurrent(segment, outputItem);
  if (ready) return "Ready for TEW";
  if (creativeStarted(segment)) return "Creative In Progress";
  if (!setupComplete(segment)) return "Setup Incomplete";
  return "Not Started";
}

export function buildSegmentSessionSummary(input: {
  segment: PlannedSegment;
  show: PlannedShow;
  session: ShowSessionRecord;
  outputLibrary: OutputLibraryUniverse;
  transfer: TransferUniverse;
  operationsRecord: ShowOperationsRecord | null;
}): SegmentSessionSummary {
  const outputItem = outputItemForSegment(input.show, input.segment, input.outputLibrary);
  const transferState = segmentTransferState(input.show.id, input.segment.id, input.transfer);
  const reconciled = Boolean(input.segment.reconciliation.actualMatch || input.segment.workflowStatus === "Reconciled");
  return {
    segmentId: input.segment.id,
    title: input.segment.title,
    type: input.segment.type,
    status: segmentStatus({ ...input, outputItem }),
    setupComplete: setupComplete(input.segment),
    approachesComplete: segmentApproachesComplete(input.segment),
    outputComplete: outputComplete(input.segment),
    packageCurrent: snapshotMatchesCurrent(input.segment, outputItem),
    entryStarted: transferState.started,
    entryComplete: transferState.complete,
    resultAvailable: resultSuggestionAvailable(input.segment.id, input.operationsRecord),
    reconciled,
  };
}

export function buildUnifiedShowSessionSummary(input: {
  show: PlannedShow;
  session: ShowSessionRecord;
  outputLibrary: OutputLibraryUniverse;
  transfer: TransferUniverse;
  operationsRecord: ShowOperationsRecord | null;
}): UnifiedShowSessionSummary {
  const segments = input.show.segments.map((segment) => buildSegmentSessionSummary({ ...input, segment }));
  const unfinished = segments.find((segment) => segment.status !== "Reconciled") ?? segments[0];
  return {
    showId: input.show.id,
    segmentCount: input.show.segments.length,
    matchCount: input.show.segments.filter((segment) => segment.type === "match").length,
    angleCount: input.show.segments.filter((segment) => segment.type === "angle").length,
    plannedMinutes: input.show.segments.reduce((total, segment) => total + segment.durationMinutes, 0),
    setupComplete: segments.filter((segment) => segment.setupComplete).length,
    approachesComplete: segments.filter((segment) => segment.approachesComplete).length,
    outputsComplete: segments.filter((segment) => segment.outputComplete).length,
    packagesCurrent: segments.filter((segment) => segment.packageCurrent).length,
    entryComplete: segments.filter((segment) => segment.entryComplete).length,
    reconciled: segments.filter((segment) => segment.reconciled).length,
    nextSegmentId: unfinished?.segmentId ?? "",
    segments,
  };
}

export function checkpointStageForSegment(segment: PlannedSegment, session: ShowSessionRecord, entryComplete: boolean): OutputLineageStage {
  if (segment.reconciliation.actualMatch || segment.workflowStatus === "Reconciled") return "Reconciled Actual Version";
  if (entryComplete || segment.workflowStatus === "Entered in TEW" || segment.workflowStatus === "Completed") return "Entered in TEW Version";
  if (session.readyForTewSegmentIds.includes(segment.id)) return "Ready for TEW";
  const hasOutput = outputComplete(segment) || Boolean(segment.keyMoments.trim());
  if (hasOutput && session.appliedOutputSegmentIds.includes(segment.id)) return "Applied Output";
  if (hasOutput) return "Generated Draft";
  return "Plan";
}

function listValue(values: string[]): string {
  return values.filter(Boolean).join(", ");
}

function approachValue(snapshot: OutputSegmentSnapshot): string {
  return snapshot.approaches.map((plan) => {
    const names = plan.approachIds.map((id) => MATCH_APPROACHES.find((approach) => approach.id === id)?.name ?? id);
    return `${plan.workerName}: ${names.join(", ")}`;
  }).join("\n");
}

function snapshotFields(snapshot: OutputSegmentSnapshot): Array<[string, string]> {
  return [
    ["Title", snapshot.title],
    ["Participants", listValue(snapshot.workers.map((worker) => `${worker.name}${worker.role ? ` (${worker.role})` : ""}`))],
    ["Duration", `${snapshot.durationMinutes} minutes`],
    ["Winner", snapshot.plannedWinner],
    ["Finish", snapshot.plannedFinish],
    ["Approaches", approachValue(snapshot)],
    ["Match Story", snapshot.matchStory],
    ["Key moments", snapshot.keyMoments],
    ["Angle Output", snapshot.segmentOutput],
    ["Consequences", snapshot.consequences],
    ["Follow-up", snapshot.followUp],
    ["Workflow status", snapshot.workflowStatus],
    ["Actual result", snapshot.actual ? `${snapshot.actual.winner} · ${snapshot.actual.matchTime} · ${snapshot.actual.rating ?? "No rating"}` : ""],
  ];
}

function comparisonStatus(before: string, after: string): SessionCheckpointChange["status"] {
  if (before === after) return "Same";
  if (!before && after) return "Added";
  if (before && !after) return "Removed";
  return "Changed";
}

function changesFromVersion(item: OutputLibraryItem | null, currentSnapshot: OutputSegmentSnapshot, stage: OutputLineageStage): SessionCheckpointChange[] {
  const previous = currentOutputVersion(item);
  if (!previous) return [{ field: "Output Library record", beforeValue: "Not saved", afterValue: stage, status: "Added" }];
  const before = new Map(snapshotFields(previous.snapshot));
  const changes = snapshotFields(currentSnapshot).map(([field, afterValue]) => ({
    field,
    beforeValue: before.get(field) ?? "",
    afterValue,
    status: comparisonStatus(before.get(field) ?? "", afterValue),
  })).filter((change) => change.status !== "Same");
  if (previous.stage !== stage) changes.unshift({ field: "Lineage stage", beforeValue: previous.stage, afterValue: stage, status: "Changed" });
  return changes;
}

export function sessionCheckpointFingerprint(segment: PlannedSegment, stage: OutputLineageStage): string {
  return `${stage}:${JSON.stringify(snapshotOutputSegment(segment))}`;
}

export function buildSessionCheckpointOffer(input: {
  segment: PlannedSegment;
  show: PlannedShow;
  session: ShowSessionRecord;
  outputLibrary: OutputLibraryUniverse;
  transfer: TransferUniverse;
}): SessionCheckpointOffer | null {
  const entryComplete = segmentTransferState(input.show.id, input.segment.id, input.transfer).complete;
  const stage = checkpointStageForSegment(input.segment, input.session, entryComplete);
  if (stage === "Plan") return null;
  const snapshot = snapshotOutputSegment(input.segment);
  const item = outputItemForSegment(input.show, input.segment, input.outputLibrary);
  const fingerprint = sessionCheckpointFingerprint(input.segment, stage);
  const duplicate = Boolean(item?.versions.some((version) => version.stage === stage && JSON.stringify(version.snapshot) === JSON.stringify(snapshot)));
  return {
    stage,
    fingerprint,
    duplicate,
    dismissed: input.session.dismissedCheckpointFingerprints.includes(fingerprint),
    currentVersionId: item?.currentVersionId ?? "",
    changes: changesFromVersion(item, snapshot, stage),
  };
}

export function dismissSessionCheckpoint(record: ShowSessionRecord, fingerprint: string): ShowSessionRecord {
  return { ...record, dismissedCheckpointFingerprints: unique([...record.dismissedCheckpointFingerprints, fingerprint]).slice(-80), updatedAt: now() };
}

export function recordSessionCheckpoint(input: {
  record: ShowSessionRecord;
  segmentId: string;
  stage: OutputLineageStage;
  outputItemId: string;
  outputVersionId: string;
  fingerprint: string;
}): ShowSessionRecord {
  const log: ShowSessionCheckpointLog = {
    id: sessionId("session-checkpoint"),
    showId: input.record.showId,
    segmentId: input.segmentId,
    stage: input.stage,
    outputItemId: input.outputItemId,
    outputVersionId: input.outputVersionId,
    fingerprint: input.fingerprint,
    createdAt: now(),
  };
  return {
    ...input.record,
    checkpointLog: [log, ...input.record.checkpointLog].slice(0, 200),
    dismissedCheckpointFingerprints: input.record.dismissedCheckpointFingerprints.filter((value) => value !== input.fingerprint),
    updatedAt: now(),
  };
}

export function validateShowSessionIntegrity(input: {
  show: PlannedShow;
  session: ShowSessionRecord;
  outputLibrary: OutputLibraryUniverse;
  transfer: TransferUniverse;
}): ShowSessionIntegrityIssue[] {
  const issues: ShowSessionIntegrityIssue[] = [];
  const segmentIds = input.show.segments.map((segment) => segment.id);
  const duplicateIds = segmentIds.filter((id, index) => segmentIds.indexOf(id) !== index);
  if (duplicateIds.length) issues.push({ id: "duplicate-segments", severity: "Blocking", message: "Duplicate segment identifiers detected", detail: "The session cannot safely connect output lineage and TEW entry until every segment has a unique identifier." });
  if (input.session.selectedSegmentId && !segmentIds.includes(input.session.selectedSegmentId)) issues.push({ id: "missing-selected-segment", severity: "Warning", message: "The saved resume segment no longer exists", detail: "The session will resume from the first available segment instead." });

  const transferRecord = transferRecordForShow(input.show.id, input.transfer);
  for (const progress of transferRecord?.segmentProgress ?? []) {
    if (!segmentIds.includes(progress.segmentId)) issues.push({ id: `orphan-transfer:${progress.segmentId}`, severity: "Warning", message: "Orphaned TEW-entry progress found", detail: `Transfer progress references removed segment ${progress.segmentId}. Regenerate the inline TEW-entry package.` });
  }
  for (const item of input.outputLibrary.items.filter((candidate) => candidate.sourceShowId === input.show.id)) {
    if (!segmentIds.includes(item.sourceSegmentId)) issues.push({ id: `orphan-output:${item.id}`, severity: "Warning", message: "Output Library item references a removed segment", detail: `${item.title} remains preserved in permanent history but is no longer on this card.` });
  }
  for (const segment of input.show.segments) {
    const transferState = segmentTransferState(input.show.id, segment.id, input.transfer);
    const item = outputItemForSegment(input.show, segment, input.outputLibrary);
    if ((input.session.readyForTewSegmentIds.includes(segment.id) || transferState.started || segment.workflowStatus !== "Planned") && !item) {
      issues.push({ id: `missing-lineage:${segment.id}`, severity: "Warning", message: `${segment.title} has no permanent output lineage`, detail: "Create the offered Output Library checkpoint before continuing or reconcile the omission deliberately." });
    }
    if (item && !snapshotMatchesCurrent(segment, item)) {
      issues.push({ id: `stale-package:${segment.id}`, severity: "Information", message: `${segment.title} changed after its last production package`, detail: "Create the offered checkpoint to refresh the package and preserve the change." });
    }
  }
  return issues;
}

export function localStorageBytes(storage: Pick<Storage, "length" | "key" | "getItem">): number {
  let total = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) ?? "";
    const value = storage.getItem(key) ?? "";
    total += (key.length + value.length) * 2;
  }
  return total;
}

export function activeTransferPackageForShow(showId: string, transfer: TransferUniverse) {
  return activeTransferPackage(transferRecordForShow(showId, transfer));
}

export function transferRecordForSession(showId: string, transfer: TransferUniverse): TransferRecord | null {
  return transferRecordForShow(showId, transfer);
}
