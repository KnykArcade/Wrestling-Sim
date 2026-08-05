import { useEffect, useMemo, useRef, useState } from "react";
import { loadBridgeUniverse } from "../bridge/storage";
import MatchApproachSetupEditor from "../matchEngine/MatchApproachSetup";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineUniverse } from "../matchEngine/types";
import NarrativeGenerator from "../narratives/NarrativeGenerator";
import {
  applyConfirmedResultLinks,
  buildResultIntakeSession,
  createOperationsChangeNote,
  operationsRecord as getOperationsRecord,
} from "../operations/model";
import { loadShowOperationsUniverse, saveShowOperationsUniverse } from "../operations/storage";
import type { ResultIntakeSession, ShowOperationsRecord, ShowOperationsUniverse } from "../operations/types";
import {
  buildProductionPackage,
  saveSegmentToOutputLibrary,
} from "../outputLibrary/model";
import { loadOutputLibraryUniverse, saveOutputLibraryUniverse } from "../outputLibrary/storage";
import type { OutputLibraryUniverse, OutputPackageField, OutputProductionPackage } from "../outputLibrary/types";
import { createPlannerId, touchShow } from "../planner/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import type { TewSnapshot, WorkerReference } from "../tew/types";
import {
  buildTransferPackage,
  createTransferAudit,
  synchronizeTransferRecord,
} from "../transfer/model";
import { loadTransferUniverse, saveTransferUniverse } from "../transfer/storage";
import type {
  TransferField,
  TransferFieldProgress,
  TransferPackage,
  TransferRecord,
  TransferSegmentTranslation,
  TransferUniverse,
} from "../transfer/types";
import { attachQuickSegmentToShow } from "../workbench/model";
import { loadWorkbenchUniverse, saveWorkbenchUniverse } from "../workbench/storage";
import type { WorkbenchUniverse } from "../workbench/types";
import {
  activeTransferPackageForShow,
  buildSessionCheckpointOffer,
  buildUnifiedShowSessionSummary,
  dismissSessionCheckpoint,
  localStorageBytes,
  markSessionAwaitingResults,
  markSessionOutputApplied,
  markSessionReadyForTew,
  recordSessionCheckpoint,
  rememberSessionSnapshot,
  selectShowSessionSegment,
  setShowSessionStep,
  showSessionRecord,
  transferRecordForSession,
  upsertShowSessionRecord,
  validateShowSessionIntegrity,
} from "./model";
import { loadShowSessionUniverse, saveShowSessionUniverse } from "./storage";
import type { SegmentSessionStatus, ShowSessionRecord, ShowSessionStep, ShowSessionUniverse } from "./types";

interface ShowSessionWorkspaceProps {
  snapshot: TewSnapshot | null;
  snapshotLoading: boolean;
  snapshotError: string;
  onSnapshotFile: (file: File) => void | Promise<void>;
  onOpenWorkbench: () => void;
  onOpenOutputLibrary: () => void;
  onOpenPlanner: () => void;
  onOpenTransfer: () => void;
}

interface EntryChoice {
  field: TransferField;
  fieldKey: string;
  event: boolean;
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function workerKey(worker: PlannedWorkerReference): string {
  return `${worker.source}:${worker.id}`;
}

function nextSide(segment: PlannedSegment): string {
  if (segment.type !== "match") return "";
  const one = segment.workers.filter((worker) => worker.side === "Side 1").length;
  const two = segment.workers.filter((worker) => worker.side === "Side 2").length;
  return one <= two ? "Side 1" : "Side 2";
}

function recommendedStep(status: SegmentSessionStatus): ShowSessionStep {
  if (status === "Setup Incomplete") return "setup";
  if (status === "Not Started" || status === "Creative In Progress") return "creative";
  if (status === "Ready for TEW") return "package";
  if (status === "Entering in TEW" || status === "Entered") return "entry";
  if (status === "Awaiting Result" || status === "Reconciliation Needed" || status === "Reconciled") return "result";
  return "setup";
}

function activePackage(record: TransferRecord | null): TransferPackage | null {
  if (!record) return null;
  return record.packageHistory.find((pkg) => pkg.id === record.activePackageId) ?? record.packageHistory.at(-1) ?? null;
}

function fieldProgress(fields: TransferFieldProgress[], fieldKey: string): TransferFieldProgress | null {
  return fields.find((field) => field.fieldKey === fieldKey) ?? null;
}

async function copyText(value: string): Promise<boolean> {
  if (!value.trim()) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function PackageGroup({ title, fields }: { title: string; fields: OutputPackageField[] }) {
  const visible = fields.filter((field) => field.value.trim());
  return <section className="session-package-group"><header><h4>{title}</h4><span>{visible.length}</span></header>{visible.length === 0 ? <p>No populated fields in this group.</p> : visible.map((field) => <article key={field.label}><strong>{field.label}</strong><pre>{field.value}</pre></article>)}</section>;
}

function EntryFieldRow({
  field,
  progress,
  fieldKey,
  onCopy,
  onStatus,
}: {
  field: TransferField;
  progress: TransferFieldProgress | null;
  fieldKey: string;
  onCopy: () => void;
  onStatus: (status: TransferFieldProgress["status"]) => void;
}) {
  const companionOnly = field.destination === "Companion Only";
  return <article className={`session-entry-field session-entry-field--${statusClass(progress?.status ?? "Pending")}`}>
    <header><div><span>{field.destination}</span><strong>{field.label}</strong><small>{field.mappingTarget} · {field.mappingStage}</small></div><select aria-label={`${field.label} session entry status`} value={progress?.status ?? (companionOnly ? "Not Applicable" : "Pending")} disabled={companionOnly} onChange={(event) => onStatus(event.target.value as TransferFieldProgress["status"])}><option>Pending</option><option>Copied</option><option>Entered</option><option>Changed in TEW</option><option>Not Applicable</option></select></header>
    <pre>{field.value || "Not set"}</pre>
    <footer><span>{field.guidance}</span><button className="secondary-button" type="button" disabled={!field.value} onClick={onCopy}>Copy Field</button></footer>
    <input type="hidden" value={fieldKey} readOnly />
  </article>;
}

function applySegmentEntryValue(segment: PlannedSegment, key: string, value: string): PlannedSegment {
  if (key === "title") return { ...segment, title: value };
  if (key === "durationMinutes") return { ...segment, durationMinutes: Math.max(1, Number(value) || segment.durationMinutes) };
  if (key === "matchType") return { ...segment, matchType: value };
  if (key === "plannedWinner") return { ...segment, plannedWinner: value };
  if (key === "plannedFinish") return { ...segment, plannedFinish: value };
  if (key === "championship") return { ...segment, championship: value };
  if (key === "angleLocation") return { ...segment, angleLocation: value };
  if (key === "angleContentType") return { ...segment, angleContentType: value };
  if (key === "matchStory") return { ...segment, matchStory: value };
  if (key === "segmentOutput") return { ...segment, segmentOutput: value };
  return segment;
}

export default function ShowSessionWorkspace({
  snapshot,
  snapshotLoading,
  snapshotError,
  onSnapshotFile,
  onOpenWorkbench,
  onOpenOutputLibrary,
  onOpenPlanner,
  onOpenTransfer,
}: ShowSessionWorkspaceProps) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [sessions, setSessions] = useState<ShowSessionUniverse>(() => loadShowSessionUniverse(window.localStorage));
  const [outputLibrary, setOutputLibrary] = useState<OutputLibraryUniverse>(() => loadOutputLibraryUniverse(window.localStorage));
  const [transfer, setTransfer] = useState<TransferUniverse>(() => loadTransferUniverse(window.localStorage));
  const [operations, setOperations] = useState<ShowOperationsUniverse>(() => loadShowOperationsUniverse(window.localStorage));
  const [workbench, setWorkbench] = useState<WorkbenchUniverse>(() => loadWorkbenchUniverse(window.localStorage));
  const [matchEngine, setMatchEngine] = useState<MatchEngineUniverse>(() => loadMatchEngineUniverse(window.localStorage));
  const [selectedShowId, setSelectedShowId] = useState(() => sessions.lastShowId && shows.some((show) => show.id === sessions.lastShowId) ? sessions.lastShowId : shows[0]?.id ?? "");
  const [manualWorker, setManualWorker] = useState("");
  const [snapshotWorkerId, setSnapshotWorkerId] = useState("");
  const [quickSegmentId, setQuickSegmentId] = useState(() => workbench.quickSegments[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [changeFieldKey, setChangeFieldKey] = useState("");
  const [changedValue, setChangedValue] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [updateCreativePlan, setUpdateCreativePlan] = useState(false);
  const [requiresNewVersion, setRequiresNewVersion] = useState(true);
  const snapshotInputRef = useRef<HTMLInputElement | null>(null);
  const bridge = useMemo(() => loadBridgeUniverse(window.localStorage), []);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const sessionRecord = selectedShow ? showSessionRecord(selectedShow.id, sessions, selectedShow.segments[0]?.id ?? "") : null;
  const selectedSegment = selectedShow?.segments.find((segment) => segment.id === sessionRecord?.selectedSegmentId) ?? selectedShow?.segments[0] ?? null;
  const operationRecord = selectedShow ? getOperationsRecord(selectedShow.id, operations) : null;
  const summary = selectedShow && sessionRecord ? buildUnifiedShowSessionSummary({ show: selectedShow, session: sessionRecord, outputLibrary, transfer, operationsRecord: operationRecord }) : null;
  const selectedSummary = summary?.segments.find((segment) => segment.segmentId === selectedSegment?.id) ?? null;
  const checkpointOffer = selectedShow && selectedSegment && sessionRecord ? buildSessionCheckpointOffer({ segment: selectedSegment, show: selectedShow, session: sessionRecord, outputLibrary, transfer }) : null;
  const productionPackage = selectedShow && selectedSegment ? buildProductionPackage(selectedSegment, selectedShow.name) : null;
  const transferRecord = selectedShow ? transferRecordForSession(selectedShow.id, transfer) : null;
  const transferPackage = selectedShow ? activeTransferPackageForShow(selectedShow.id, transfer) : null;
  const transferSegment = selectedSegment ? transferPackage?.segments.find((segment) => segment.segmentId === selectedSegment.id) ?? null : null;
  const transferSegmentProgress = selectedSegment ? transferRecord?.segmentProgress.find((progress) => progress.segmentId === selectedSegment.id) ?? null : null;
  const latestResultSession = operationRecord?.resultSessions.find((session) => !session.appliedAt) ?? operationRecord?.resultSessions[0] ?? null;
  const selectedSuggestion = selectedSegment ? latestResultSession?.suggestions.find((suggestion) => suggestion.plannedSegmentId === selectedSegment.id) ?? null : null;
  const integrityIssues = selectedShow && sessionRecord ? validateShowSessionIntegrity({ show: selectedShow, session: sessionRecord, outputLibrary, transfer }) : [];
  const storageBytes = localStorageBytes(window.localStorage);
  const transferStale = Boolean(transferPackage && selectedShow && new Date(transferPackage.generatedAt).getTime() < new Date(selectedShow.updatedAt).getTime());
  const selectedOutputItem = selectedShow && selectedSegment ? outputLibrary.items.find((item) => item.sourceShowId === selectedShow.id && item.sourceSegmentId === selectedSegment.id) ?? null : null;

  const entryChoices: EntryChoice[] = useMemo(() => {
    if (!transferPackage) return [];
    const choices: EntryChoice[] = transferPackage.eventFields.map((field) => ({ field, fieldKey: `event:${field.key}`, event: true }));
    if (transferSegment) {
      choices.push(...[...transferSegment.directFields, ...transferSegment.tewNotes].map((field) => ({ field, fieldKey: `${transferSegment.segmentId}:${field.destination}:${field.key}`, event: false })));
    }
    return choices;
  }, [transferPackage, transferSegment]);

  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveShowSessionUniverse(window.localStorage, sessions), [sessions]);
  useEffect(() => saveOutputLibraryUniverse(window.localStorage, outputLibrary), [outputLibrary]);
  useEffect(() => saveTransferUniverse(window.localStorage, transfer), [transfer]);
  useEffect(() => saveShowOperationsUniverse(window.localStorage, operations), [operations]);
  useEffect(() => saveWorkbenchUniverse(window.localStorage, workbench), [workbench]);
  useEffect(() => saveMatchEngineUniverse(window.localStorage, matchEngine), [matchEngine]);

  const selectedSegmentIds = selectedShow?.segments.map((segment) => segment.id).join("|") ?? "";
  useEffect(() => {
    if (!selectedShow) return;
    setSessions((current) => {
      const existing = current.records.find((record) => record.showId === selectedShow.id);
      const selectedId = existing?.selectedSegmentId && selectedShow.segments.some((segment) => segment.id === existing.selectedSegmentId)
        ? existing.selectedSegmentId
        : selectedShow.segments[0]?.id ?? "";
      if (existing && existing.selectedSegmentId === selectedId && current.lastShowId === selectedShow.id) return current;
      return upsertShowSessionRecord(current, existing ? { ...existing, selectedSegmentId: selectedId } : showSessionRecord(selectedShow.id, current, selectedId));
    });
  }, [selectedShowId, selectedSegmentIds]);

  useEffect(() => {
    if (!changeFieldKey && entryChoices.length) {
      setChangeFieldKey(entryChoices[0].fieldKey);
      setChangedValue(entryChoices[0].field.value);
    }
  }, [entryChoices, changeFieldKey]);

  function updateSession(updater: (record: ShowSessionRecord) => ShowSessionRecord): void {
    if (!selectedShow) return;
    setSessions((current) => upsertShowSessionRecord(current, updater(showSessionRecord(selectedShow.id, current, selectedShow.segments[0]?.id ?? ""))));
  }

  function updateOperationsRecord(updater: (record: ShowOperationsRecord) => ShowOperationsRecord): void {
    if (!selectedShow) return;
    setOperations((current) => {
      const record = updater(getOperationsRecord(selectedShow.id, current));
      return {
        records: current.records.some((item) => item.showId === selectedShow.id)
          ? current.records.map((item) => item.showId === selectedShow.id ? record : item)
          : [record, ...current.records],
      };
    });
  }

  function selectShow(showId: string): void {
    const show = shows.find((item) => item.id === showId);
    if (!show) return;
    setSelectedShowId(showId);
    setSessions((current) => {
      const record = showSessionRecord(showId, current, show.segments[0]?.id ?? "");
      const selectedId = show.segments.some((segment) => segment.id === record.selectedSegmentId) ? record.selectedSegmentId : show.segments[0]?.id ?? "";
      return upsertShowSessionRecord(current, { ...record, selectedSegmentId: selectedId, activeStep: "overview", lastOpenedAt: new Date().toISOString() });
    });
    setNotice(`Resumed ${show.name}.`);
  }

  function selectSegment(segmentId: string, requestedStep?: ShowSessionStep): void {
    if (!selectedShow || !sessionRecord) return;
    const segmentSummary = summary?.segments.find((segment) => segment.segmentId === segmentId);
    const step = requestedStep ?? recommendedStep(segmentSummary?.status ?? "Setup Incomplete");
    updateSession((record) => selectShowSessionSegment(record, segmentId, step));
    setWorkbench((current) => ({ ...current, settings: { ...current.settings, lastPlannedShowId: selectedShow.id, lastPlannedSegmentId: segmentId, defaultMode: "planned-show" } }));
  }

  function setStep(step: ShowSessionStep): void {
    updateSession((record) => setShowSessionStep(record, step));
  }

  function updateShow(patch: Partial<PlannedShow>): void {
    if (!selectedShow) return;
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, ...patch }) : show));
  }

  function updateSegment(segment: PlannedSegment): void {
    if (!selectedShow || !selectedSegment) return;
    const outputChanged = selectedSegment.matchStory !== segment.matchStory || selectedSegment.segmentOutput !== segment.segmentOutput || selectedSegment.keyMoments !== segment.keyMoments;
    const strategyChanged = selectedSegment.title !== segment.title || selectedSegment.durationMinutes !== segment.durationMinutes || JSON.stringify(selectedSegment.workers) !== JSON.stringify(segment.workers) || JSON.stringify(selectedSegment.matchApproachSetup.workerPlans) !== JSON.stringify(segment.matchApproachSetup.workerPlans) || selectedSegment.matchApproachSetup.matchAimId !== segment.matchApproachSetup.matchAimId;
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, segments: show.segments.map((item) => item.id === segment.id ? segment : item) }) : show));
    if (outputChanged || strategyChanged) {
      updateSession((record) => ({
        ...record,
        appliedOutputSegmentIds: outputChanged ? record.appliedOutputSegmentIds.filter((id) => id !== segment.id) : record.appliedOutputSegmentIds,
        readyForTewSegmentIds: record.readyForTewSegmentIds.filter((id) => id !== segment.id),
      }));
    }
  }

  function addWorker(worker: WorkerReference | null, manualName = ""): void {
    if (!selectedSegment) return;
    const name = worker?.name ?? manualName.trim();
    if (!name) return;
    const source = worker ? "tew" as const : "manual" as const;
    const id = worker?.id ?? createPlannerId();
    if (selectedSegment.workers.some((existing) => existing.source === source && existing.id === id)) return;
    updateSegment({ ...selectedSegment, workers: [...selectedSegment.workers, { id, name, source, role: selectedSegment.type === "match" ? "Competitor" : "Participant", side: nextSide(selectedSegment) }] });
    setManualWorker("");
    setSnapshotWorkerId("");
  }

  function updateWorker(index: number, patch: Partial<PlannedWorkerReference>): void {
    if (!selectedSegment) return;
    updateSegment({ ...selectedSegment, workers: selectedSegment.workers.map((worker, workerIndex) => workerIndex === index ? { ...worker, ...patch } : worker) });
  }

  function removeWorker(index: number): void {
    if (!selectedSegment) return;
    const worker = selectedSegment.workers[index];
    updateSegment({
      ...selectedSegment,
      workers: selectedSegment.workers.filter((_, workerIndex) => workerIndex !== index),
      matchApproachSetup: {
        ...selectedSegment.matchApproachSetup,
        workerPlans: selectedSegment.matchApproachSetup.workerPlans.filter((plan) => plan.workerKey !== workerKey(worker)),
        performancePreview: null,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function attachQuickSegment(): void {
    if (!selectedShow || !quickSegmentId) return;
    const quick = workbench.quickSegments.find((record) => record.id === quickSegmentId);
    if (!quick) return;
    try {
      const result = attachQuickSegmentToShow(quick, selectedShow.id, shows);
      setShows(result.shows);
      setWorkbench((current) => ({ ...current, quickSegments: current.quickSegments.map((record) => record.id === quick.id ? result.record : record), settings: { ...current.settings, lastPlannedShowId: selectedShow.id, lastPlannedSegmentId: result.segmentId } }));
      updateSession((record) => selectShowSessionSegment(record, result.segmentId, "setup"));
      setNotice(`${quick.segment.title} was added as a linked show copy. The standalone draft remains unchanged.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The Quick Segment could not be attached.");
    }
  }

  function markOutputApplied(): void {
    if (!selectedSegment || !selectedSummary?.outputComplete) {
      setNotice("Generate or write the complete Match Story or Angle Output before marking it applied.");
      return;
    }
    updateSession((record) => markSessionOutputApplied(record, selectedSegment.id));
    setStep("package");
    setNotice("The current output is marked applied. The permanent checkpoint offer now reflects that stage.");
  }

  function markReadyForTew(): void {
    if (!selectedSegment || !selectedSummary?.setupComplete || !selectedSummary.approachesComplete || !selectedSummary.outputComplete) {
      setNotice("Complete setup, required match approaches, and the segment output before marking the segment ready for TEW.");
      return;
    }
    if (!selectedSummary.packageCurrent) {
      setNotice("Create the current Output Library checkpoint first so the production package and creative plan match.");
      return;
    }
    updateSession((record) => markSessionReadyForTew(record, selectedSegment.id));
    setNotice("Segment marked Ready for TEW. A Ready for TEW lineage checkpoint is now available.");
  }

  function createCheckpoint(): void {
    if (!selectedShow || !selectedSegment || !checkpointOffer || checkpointOffer.duplicate) return;
    const result = saveSegmentToOutputLibrary(outputLibrary, {
      segment: selectedSegment,
      show: selectedShow,
      sourceKind: "Planned Show",
      stage: checkpointOffer.stage,
      label: `Show Session · ${checkpointOffer.stage}`,
    });
    setOutputLibrary(result.universe);
    updateSession((record) => recordSessionCheckpoint({
      record,
      segmentId: selectedSegment.id,
      stage: checkpointOffer.stage,
      outputItemId: result.item.id,
      outputVersionId: result.item.currentVersionId,
      fingerprint: checkpointOffer.fingerprint,
    }));
    setNotice(`${checkpointOffer.stage} checkpoint created without replacing earlier output versions.`);
  }

  function dismissCheckpoint(): void {
    if (!checkpointOffer) return;
    updateSession((record) => dismissSessionCheckpoint(record, checkpointOffer.fingerprint));
  }

  function generateInlineEntry(): void {
    if (!selectedShow) return;
    const pkg = buildTransferPackage(selectedShow, bridge.mappings);
    const selectedIndex = selectedSegment ? Math.max(0, pkg.segments.findIndex((segment) => segment.segmentId === selectedSegment.id)) : 0;
    setTransfer((current) => {
      const existing = current.records.find((record) => record.showId === selectedShow.id);
      const nextRecord = { ...synchronizeTransferRecord(existing, pkg), currentSegmentIndex: selectedIndex };
      return {
        records: current.records.some((record) => record.showId === selectedShow.id) ? current.records.map((record) => record.showId === selectedShow.id ? nextRecord : record) : [nextRecord, ...current.records],
        auditLogs: [createTransferAudit(selectedShow.id, "Package Generated", `Unified Show Session translated ${pkg.segments.length} segments for assisted TEW entry.`), ...current.auditLogs].slice(0, 250),
      };
    });
    setNotice("Inline TEW entry package generated. No TEW database was changed.");
  }

  function updateEntryStatus(fieldKey: string, status: TransferFieldProgress["status"], eventField: boolean): void {
    if (!selectedShow || !selectedSegment) return;
    setTransfer((current) => ({
      ...current,
      records: current.records.map((record) => record.showId === selectedShow.id ? {
        ...record,
        eventProgress: eventField ? record.eventProgress.map((field) => field.fieldKey === fieldKey ? { ...field, status, updatedAt: new Date().toISOString() } : field) : record.eventProgress,
        segmentProgress: eventField ? record.segmentProgress : record.segmentProgress.map((progress) => progress.segmentId === selectedSegment.id ? {
          ...progress,
          completed: status === "Pending" ? false : progress.completed,
          fields: progress.fields.map((field) => field.fieldKey === fieldKey ? { ...field, status, updatedAt: new Date().toISOString() } : field),
          updatedAt: new Date().toISOString(),
        } : progress),
        updatedAt: new Date().toISOString(),
      } : record),
      auditLogs: status === "Changed in TEW" ? [createTransferAudit(selectedShow.id, "Field Changed in TEW", fieldKey), ...current.auditLogs].slice(0, 250) : current.auditLogs,
    }));
  }

  async function copyEntryField(choice: EntryChoice): Promise<void> {
    const copied = await copyText(choice.field.value);
    if (!copied) { setNotice("There is no value to copy or browser clipboard access failed."); return; }
    updateEntryStatus(choice.fieldKey, "Copied", choice.event);
    if (selectedShow) setTransfer((current) => ({ ...current, auditLogs: [createTransferAudit(selectedShow.id, "Field Copied", choice.field.label), ...current.auditLogs].slice(0, 250) }));
    setNotice(`${choice.field.label} copied.`);
  }

  function markSegmentEntered(): void {
    if (!selectedShow || !selectedSegment || !transferRecord || !transferSegment) {
      setNotice("Generate the inline TEW entry package first.");
      return;
    }
    setTransfer((current) => ({
      ...current,
      records: current.records.map((record) => record.showId === selectedShow.id ? {
        ...record,
        segmentProgress: record.segmentProgress.map((progress) => progress.segmentId === selectedSegment.id ? {
          ...progress,
          completed: true,
          fields: progress.fields.map((field) => field.status === "Not Applicable" || field.status === "Changed in TEW" ? field : { ...field, status: "Entered", updatedAt: new Date().toISOString() }),
          updatedAt: new Date().toISOString(),
        } : progress),
        updatedAt: new Date().toISOString(),
      } : record),
      auditLogs: [createTransferAudit(selectedShow.id, "Segment Completed", selectedSegment.title), ...current.auditLogs].slice(0, 250),
    }));
    updateSegment({ ...selectedSegment, workflowStatus: "Entered in TEW" });
    setNotice(`${selectedSegment.title} marked entered in TEW. The original plan remains preserved.`);
  }

  function recordTewChange(): void {
    if (!selectedShow || !selectedSegment || !changeFieldKey || !changeReason.trim()) {
      setNotice("Choose a field and record the reason for the change made during TEW entry.");
      return;
    }
    const choice = entryChoices.find((item) => item.fieldKey === changeFieldKey);
    if (!choice) return;
    const note = createOperationsChangeNote({
      showId: selectedShow.id,
      segmentId: choice.event ? "" : selectedSegment.id,
      field: choice.field.label,
      originalValue: choice.field.value,
      enteredValue: changedValue,
      reason: changeReason,
      updateCreativePlan,
      requiresNewVersion,
    });
    updateOperationsRecord((record) => ({ ...record, changeNotes: [note, ...record.changeNotes].slice(0, 200), updatedAt: new Date().toISOString() }));
    updateEntryStatus(choice.fieldKey, "Changed in TEW", choice.event);
    if (updateCreativePlan) {
      if (choice.event) {
        const patch: Partial<PlannedShow> = {};
        if (choice.field.key === "name") patch.name = changedValue;
        if (choice.field.key === "date") patch.date = changedValue;
        if (choice.field.key === "showType") patch.showType = changedValue;
        if (choice.field.key === "venue") patch.venue = changedValue;
        if (choice.field.key === "company") patch.company = changedValue;
        updateShow(patch);
      } else {
        updateSegment(applySegmentEntryValue(selectedSegment, choice.field.key, changedValue));
      }
    }
    setChangeReason("");
    setNotice("The TEW entry change was preserved separately from the original tracker plan.");
  }

  function markShowRunInTew(): void {
    if (!selectedShow || !sessionRecord || !summary || summary.entryComplete !== summary.segmentCount || summary.segmentCount === 0) {
      setNotice("Mark every segment entered before recording that the show has been run in TEW.");
      return;
    }
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, status: "Completed", segments: show.segments.map((segment) => ({ ...segment, workflowStatus: segment.workflowStatus === "Reconciled" ? segment.workflowStatus : "Completed" })) }) : show));
    updateSession((record) => markSessionAwaitingResults(record, snapshot?.fileName ?? ""));
    setNotice("Show marked run in TEW. Load the updated read-only TEW snapshot to reconcile the actual results.");
  }

  function analyzeResults(): void {
    if (!selectedShow || !snapshot) {
      setNotice("Load the updated post-show TEW MDB snapshot first.");
      return;
    }
    const result = buildResultIntakeSession(selectedShow, snapshot);
    if (!result) {
      setNotice("No credible completed-show candidate was found in the loaded snapshot.");
      return;
    }
    updateOperationsRecord((record) => ({ ...record, resultSessions: [result, ...record.resultSessions].slice(0, 20), lastViewedTab: "results", updatedAt: new Date().toISOString() }));
    updateSession((record) => rememberSessionSnapshot(record, snapshot.fileName));
    setNotice(`Result intake created for ${result.actualShowName} with ${result.showConfidence}% show confidence.`);
  }

  function updateSuggestion(status: "Confirmed" | "Rejected"): void {
    if (!latestResultSession || !selectedSegment) return;
    updateOperationsRecord((record) => ({
      ...record,
      resultSessions: record.resultSessions.map((session) => session.id === latestResultSession.id ? { ...session, suggestions: session.suggestions.map((suggestion) => suggestion.plannedSegmentId === selectedSegment.id ? { ...suggestion, status } : suggestion) } : session),
      updatedAt: new Date().toISOString(),
    }));
  }

  function applyConfirmedResults(): void {
    if (!selectedShow || !snapshot || !latestResultSession) return;
    try {
      const updatedShow = applyConfirmedResultLinks(selectedShow, latestResultSession, snapshot);
      setShows((current) => current.map((show) => show.id === selectedShow.id ? updatedShow : show));
      updateOperationsRecord((record) => ({ ...record, resultSessions: record.resultSessions.map((session) => session.id === latestResultSession.id ? { ...session, appliedAt: new Date().toISOString() } : session), updatedAt: new Date().toISOString() }));
      setNotice("Confirmed TEW result links were applied to tracker reconciliation. TEW remains authoritative for the result and rating.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The confirmed TEW result links could not be applied.");
    }
  }

  function markShowReconciled(): void {
    if (!selectedShow?.reconciliation) {
      setNotice("Apply confirmed TEW result links before marking the show reconciled.");
      return;
    }
    const matchesComplete = selectedShow.segments.filter((segment) => segment.type === "match").every((segment) => Boolean(segment.reconciliation.actualMatch));
    if (!matchesComplete) {
      setNotice("Every planned match must have a confirmed TEW result before the show can be marked reconciled.");
      return;
    }
    const timestamp = new Date().toISOString();
    updateShow({
      status: "Reconciled",
      segments: selectedShow.segments.map((segment) => ({ ...segment, workflowStatus: "Reconciled" })),
      reconciliation: { ...selectedShow.reconciliation, completedAt: timestamp, notes: `${selectedShow.reconciliation.notes}\nUnified Show Session reconciliation confirmed ${timestamp}.`.trim() },
    });
    setNotice("Show marked reconciled. Championship, competition, worker, and storyline confirmations remain available in their existing tracker workflows.");
  }

  function moveSelected(direction: -1 | 1): void {
    if (!selectedShow || !selectedSegment) return;
    const index = selectedShow.segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = selectedShow.segments[index + direction];
    if (next) selectSegment(next.id);
  }

  function selectNextUnfinished(): void {
    if (summary?.nextSegmentId) selectSegment(summary.nextSegmentId);
  }

  const selectedSnapshotWorker = snapshot?.workers.find((worker) => worker.id === snapshotWorkerId) ?? null;
  const activeStep = sessionRecord?.activeStep ?? "overview";
  const storageMegabytes = storageBytes / (1024 * 1024);
  const allSegmentsEntered = Boolean(summary && summary.segmentCount > 0 && summary.entryComplete === summary.segmentCount);
  const allMatchesReconciled = Boolean(selectedShow && selectedShow.segments.filter((segment) => segment.type === "match").every((segment) => Boolean(segment.reconciliation.actualMatch)));

  return <section className="show-session-workspace">
    <header className="show-session-hero">
      <div><p className="eyebrow">UNIFIED TEW COMPANION SESSION</p><h2>Open one show, finish every segment, enter it in TEW, and reconcile the actual result</h2><p>The session connects setup, match approaches, Match Stories, Angle Outputs, production packages, assisted TEW entry, and result history without replacing TEW.</p></div>
      <div className="show-session-safety"><span>TEW authority</span><strong>Read-only companion</strong><small>No MDB or ACCDB writing. No result is changed automatically.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="show-session-toolbar">
      <label className="field"><span>Show session</span><select aria-label="Show session planned show" value={selectedShow?.id ?? ""} onChange={(event) => selectShow(event.target.value)}><option value="">{shows.length ? "Select a planned show" : "No planned shows"}</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.segments.length} segments</option>)}</select></label>
      <button className="secondary-button" type="button" onClick={() => setStep("overview")} disabled={!selectedShow}>Show Overview</button>
      <button className="secondary-button" type="button" onClick={onOpenPlanner}>Edit Card / Add Match</button>
      <button className="secondary-button" type="button" onClick={onOpenWorkbench}>Open Workbench</button>
      <button className="secondary-button" type="button" onClick={onOpenOutputLibrary}>Open Output Library</button>
    </section>

    {!selectedShow || !sessionRecord || !summary ? <div className="empty-state show-session-empty"><h3>No planned show is available</h3><p>Create your first show and add its matches in Book Shows, then return here to run it.</p><button className="primary-button" type="button" onClick={onOpenPlanner}>Create First Show</button></div> : <>
      <section className="show-session-progress" aria-label="Show session progress">
        <div><span>Segments</span><strong>{summary.segmentCount}</strong><small>{summary.matchCount} matches · {summary.angleCount} angles</small></div>
        <div><span>Runtime</span><strong>{summary.plannedMinutes}</strong><small>of {selectedShow.expectedMinutes} minutes</small></div>
        <div><span>Setup</span><strong>{summary.setupComplete}/{summary.segmentCount}</strong><small>complete</small></div>
        <div><span>Outputs</span><strong>{summary.outputsComplete}/{summary.segmentCount}</strong><small>complete</small></div>
        <div><span>Packages</span><strong>{summary.packagesCurrent}/{summary.segmentCount}</strong><small>current</small></div>
        <div><span>TEW Entry</span><strong>{summary.entryComplete}/{summary.segmentCount}</strong><small>entered</small></div>
        <div><span>Results</span><strong>{summary.reconciled}/{summary.segmentCount}</strong><small>reconciled</small></div>
      </section>

      <div className="show-session-layout">
        <aside className="show-session-running-order">
          <header><div><p className="eyebrow">RUNNING ORDER</p><h3>{selectedShow.name}</h3><small>Resume: {formatDate(sessionRecord.lastOpenedAt)}</small></div><span>{summary.segmentCount}</span></header>
          <div className="show-session-segment-list">{selectedShow.segments.map((segment, index) => { const state = summary.segments.find((item) => item.segmentId === segment.id)!; return <button key={segment.id} type="button" className={`${selectedSegment?.id === segment.id ? "active" : ""} session-status--${statusClass(state.status)}`} onClick={() => selectSegment(segment.id)}><b>{index + 1}</b><div><strong>{segment.title}</strong><span>{segment.type === "match" ? "Match" : "Angle"} · {segment.durationMinutes} min</span><small>{state.status}</small></div></button>; })}</div>
          <div className="show-session-nav-actions"><button type="button" className="secondary-button" disabled={!selectedSegment || selectedShow.segments[0]?.id === selectedSegment.id} onClick={() => moveSelected(-1)}>Previous</button><button type="button" className="secondary-button" disabled={!selectedSegment || selectedShow.segments.at(-1)?.id === selectedSegment.id} onClick={() => moveSelected(1)}>Next</button><button type="button" className="primary-button" disabled={!summary.nextSegmentId} onClick={selectNextUnfinished}>Next Unfinished</button></div>
          <section className="show-session-quick-link"><h4>Add Quick Segment as a linked copy</h4><select aria-label="Quick Segment for show session" value={quickSegmentId} onChange={(event) => setQuickSegmentId(event.target.value)}><option value="">No Quick Segment selected</option>{workbench.quickSegments.map((record) => <option key={record.id} value={record.id}>{record.segment.title} · {record.type === "match" ? "Match" : "Angle"}</option>)}</select><button className="secondary-button" type="button" disabled={!quickSegmentId} onClick={attachQuickSegment}>Add to Show Session</button></section>
        </aside>

        <main className="show-session-main">
          {activeStep === "overview" || !selectedSegment || !selectedSummary ? <>
            <section className="show-session-overview-card"><header><div><p className="eyebrow">SESSION OVERVIEW</p><h3>{selectedShow.name}</h3><p>{selectedShow.date || "Unscheduled"} · {selectedShow.company || "Company not set"} · {selectedShow.venue || "Venue not set"}</p></div><button className="primary-button" type="button" disabled={!summary.nextSegmentId} onClick={selectNextUnfinished}>{sessionRecord.lastOpenedAt ? "Resume Next Unfinished Segment" : "Start Show Session"}</button></header><p>Complete the card in order or jump directly to any unfinished segment. Your exact show, segment, and workflow step are saved in this browser.</p></section>
            <section className="show-session-overview-grid"><article><span>Approach plans</span><strong>{summary.approachesComplete}/{summary.matchCount || 0}</strong><p>Duration-controlled match approaches complete.</p></article><article><span>Creative outputs</span><strong>{summary.outputsComplete}/{summary.segmentCount}</strong><p>Match Stories and Angle Outputs complete.</p></article><article><span>Permanent lineage</span><strong>{outputLibrary.items.filter((item) => item.sourceShowId === selectedShow.id).length}</strong><p>Show segments preserved in the Output Library.</p></article><article><span>Storage use</span><strong>{storageMegabytes.toFixed(2)} MB</strong><p>{storageMegabytes >= 4 ? "Export a version 18 backup soon." : "Browser storage remains within the normal warning threshold."}</p></article></section>
            <section className="show-session-integrity"><header><h3>Session recovery and data integrity</h3><span>{integrityIssues.length}</span></header>{integrityIssues.length === 0 ? <p>No duplicate, orphaned, or stale-reference problems were detected.</p> : integrityIssues.map((issue) => <article key={issue.id} className={`session-integrity--${issue.severity.toLowerCase()}`}><strong>{issue.severity}: {issue.message}</strong><span>{issue.detail}</span></article>)}</section>
            <section className="show-session-checkpoint-history"><header><h3>Recent automatic-lineage decisions</h3><span>{sessionRecord.checkpointLog.length}</span></header>{sessionRecord.checkpointLog.length === 0 ? <p>No formal session checkpoints have been created yet.</p> : sessionRecord.checkpointLog.slice(0, 8).map((log) => <article key={log.id}><strong>{selectedShow.segments.find((segment) => segment.id === log.segmentId)?.title ?? "Removed segment"}</strong><span>{log.stage}</span><small>{formatDate(log.createdAt)}</small></article>)}</section>
          </> : <>
            <section className="show-session-segment-header"><div><p className="eyebrow">SEGMENT {selectedShow.segments.findIndex((segment) => segment.id === selectedSegment.id) + 1} OF {selectedShow.segments.length}</p><h3>{selectedSegment.title}</h3><p>{selectedSegment.section} · {selectedSegment.type === "match" ? "Match" : "Angle"} · {selectedSegment.durationMinutes} minutes</p></div><span className={`session-status-badge session-status--${statusClass(selectedSummary.status)}`}>{selectedSummary.status}</span></section>

            <nav className="show-session-step-tabs" aria-label="Unified segment workflow"><button type="button" className={activeStep === "setup" ? "active" : ""} onClick={() => setStep("setup")}>1. Setup</button><button type="button" className={activeStep === "creative" ? "active" : ""} onClick={() => setStep("creative")}>2. Approaches &amp; Output</button><button type="button" className={activeStep === "package" ? "active" : ""} onClick={() => setStep("package")}>3. Production Package</button><button type="button" className={activeStep === "entry" ? "active" : ""} onClick={() => setStep("entry")}>4. TEW Entry</button><button type="button" className={activeStep === "result" ? "active" : ""} onClick={() => setStep("result")}>5. Result</button></nav>

            {checkpointOffer && !checkpointOffer.duplicate && !checkpointOffer.dismissed && <section className="show-session-checkpoint-offer"><header><div><p className="eyebrow">AUTOMATIC OUTPUT LINEAGE OFFER</p><h3>Create {checkpointOffer.stage} checkpoint</h3><p>The current segment reached a formal workflow stage. Earlier versions will remain untouched.</p></div><span>{checkpointOffer.changes.length} change{checkpointOffer.changes.length === 1 ? "" : "s"}</span></header>{checkpointOffer.changes.length > 0 && <div className="session-checkpoint-changes">{checkpointOffer.changes.slice(0, 6).map((change) => <article key={change.field}><strong>{change.field}</strong><span>{change.beforeValue || "—"}</span><b>→</b><span>{change.afterValue || "—"}</span></article>)}</div>}<footer><button className="primary-button" type="button" onClick={createCheckpoint}>Create Checkpoint</button><button className="secondary-button" type="button" onClick={dismissCheckpoint}>Dismiss Until It Changes</button></footer></section>}
            {checkpointOffer?.duplicate && <p className="show-session-checkpoint-current">Output Library checkpoint is current for the {checkpointOffer.stage} stage.</p>}

            {activeStep === "setup" && <section className="session-step-panel">
              <header><div><p className="eyebrow">SEGMENT SETUP</p><h3>Booking identity and people</h3></div><span>{selectedSummary.setupComplete ? "Complete" : "Needs work"}</span></header>
              <div className="session-form-grid"><label className="field field--wide"><span>Segment name</span><input aria-label="Session segment name" value={selectedSegment.title} onChange={(event) => updateSegment({ ...selectedSegment, title: event.target.value })} /></label><label className="field"><span>Section</span><select aria-label="Session segment section" value={selectedSegment.section} onChange={(event) => updateSegment({ ...selectedSegment, section: event.target.value as PlannedSegment["section"] })}><option>Pre-Show</option><option>Main Show</option><option>Post-Show</option></select></label><label className="field"><span>Duration</span><input aria-label="Session segment duration" type="number" min={1} max={180} value={selectedSegment.durationMinutes} onChange={(event) => updateSegment({ ...selectedSegment, durationMinutes: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="field field--full"><span>Planning outline</span><textarea rows={3} value={selectedSegment.notes} onChange={(event) => updateSegment({ ...selectedSegment, notes: event.target.value })} /></label></div>
              <section className="session-people"><header><h4>Participants and roles</h4><span>{selectedSegment.workers.length}</span></header><div className="session-add-worker">{snapshot && <><select aria-label="Session TEW worker" value={snapshotWorkerId} onChange={(event) => setSnapshotWorkerId(event.target.value)}><option value="">Choose a read-only TEW worker…</option>{snapshot.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><button type="button" disabled={!selectedSnapshotWorker} onClick={() => addWorker(selectedSnapshotWorker)}>Add TEW Worker</button></>}<input aria-label="Session manual worker" placeholder="Manual wrestler or participant" value={manualWorker} onChange={(event) => setManualWorker(event.target.value)} /><button type="button" disabled={!manualWorker.trim()} onClick={() => addWorker(null, manualWorker)}>Add Manual Worker</button></div>{selectedSegment.workers.map((worker, index) => <article key={`${workerKey(worker)}:${index}`}><div><strong>{worker.name}</strong><small>{worker.source === "tew" ? "Read-only TEW identity" : "Manual tracker participant"}</small></div><input aria-label={`${worker.name} session role`} value={worker.role} onChange={(event) => updateWorker(index, { role: event.target.value })} />{selectedSegment.type === "match" && <select aria-label={`${worker.name} session side`} value={worker.side} onChange={(event) => updateWorker(index, { side: event.target.value })}><option>Side 1</option><option>Side 2</option><option>Other</option></select>}<button className="danger-button" type="button" onClick={() => removeWorker(index)}>Remove</button></article>)}</section>
              {selectedSegment.type === "match" ? <div className="session-form-grid"><label className="field"><span>Match type</span><input aria-label="Session match type" value={selectedSegment.matchType} onChange={(event) => updateSegment({ ...selectedSegment, matchType: event.target.value })} /></label><label className="field"><span>Planned winner</span><input aria-label="Session planned winner" value={selectedSegment.plannedWinner} onChange={(event) => updateSegment({ ...selectedSegment, plannedWinner: event.target.value })} /></label><label className="field"><span>Planned finish</span><input aria-label="Session planned finish" value={selectedSegment.plannedFinish} onChange={(event) => updateSegment({ ...selectedSegment, plannedFinish: event.target.value })} /></label><label className="field"><span>Championship</span><input value={selectedSegment.championship} onChange={(event) => updateSegment({ ...selectedSegment, championship: event.target.value })} /></label><label className="field field--full"><span>Championship or competition stakes</span><textarea rows={2} value={selectedSegment.championshipStakes} onChange={(event) => updateSegment({ ...selectedSegment, championshipStakes: event.target.value })} /></label></div> : <div className="session-form-grid"><label className="field"><span>Location</span><input aria-label="Session angle location" value={selectedSegment.angleLocation} onChange={(event) => updateSegment({ ...selectedSegment, angleLocation: event.target.value })} /></label><label className="field"><span>Content type</span><input aria-label="Session angle content type" value={selectedSegment.angleContentType} onChange={(event) => updateSegment({ ...selectedSegment, angleContentType: event.target.value })} /></label></div>}
              <div className="session-form-grid"><label className="field"><span>Story purpose</span><textarea rows={3} value={selectedSegment.purpose} onChange={(event) => updateSegment({ ...selectedSegment, purpose: event.target.value })} /></label><label className="field"><span>Consequences</span><textarea rows={3} value={selectedSegment.consequences} onChange={(event) => updateSegment({ ...selectedSegment, consequences: event.target.value })} /></label><label className="field"><span>Follow-up</span><textarea rows={3} value={selectedSegment.followUp} onChange={(event) => updateSegment({ ...selectedSegment, followUp: event.target.value })} /></label>{selectedSegment.type === "angle" && <label className="field"><span>Audience takeaway</span><textarea rows={3} value={selectedSegment.audienceTakeaway} onChange={(event) => updateSegment({ ...selectedSegment, audienceTakeaway: event.target.value })} /></label>}<label className="field field--full"><span>Private road-agent or production notes</span><textarea rows={3} value={selectedSegment.privateNotes} onChange={(event) => updateSegment({ ...selectedSegment, privateNotes: event.target.value })} /></label></div>
              <footer><button className="primary-button" type="button" onClick={() => setStep("creative")}>Continue to Approaches &amp; Output</button></footer>
            </section>}

            {activeStep === "creative" && <section className="session-creative-step">
              {selectedSegment.type === "match" && <MatchApproachSetupEditor segment={selectedSegment} universe={matchEngine} onUniverseChange={setMatchEngine} onChange={updateSegment} />}
              <NarrativeGenerator segment={selectedSegment} universe={matchEngine} onChange={updateSegment} />
              <section className="session-step-panel"><header><div><p className="eyebrow">APPLIED CREATIVE OUTPUT</p><h3>{selectedSegment.type === "match" ? "Match Story" : "Angle Segment Output"}</h3></div><span>{selectedSummary.outputComplete ? "Complete" : "Draft"}</span></header><label className="field field--full"><span>{selectedSegment.type === "match" ? "Match Story" : "Angle Segment Output"}</span><textarea aria-label="Session current output" rows={14} value={selectedSegment.type === "match" ? selectedSegment.matchStory : selectedSegment.segmentOutput} onChange={(event) => updateSegment(selectedSegment.type === "match" ? { ...selectedSegment, matchStory: event.target.value } : { ...selectedSegment, segmentOutput: event.target.value })} /></label><footer><button className="primary-button" type="button" onClick={markOutputApplied}>Mark Current Output Applied</button><button className="secondary-button" type="button" onClick={() => setStep("package")}>Review Production Package</button></footer></section>
            </section>}

            {activeStep === "package" && productionPackage && <section className="session-step-panel">
              <header><div><p className="eyebrow">PRODUCTION PACKAGE</p><h3>{productionPackage.kind}</h3><p>Direct TEW fields remain separate from notes and companion-only match strategy.</p></div><span>{productionPackage.warnings.length} warning{productionPackage.warnings.length === 1 ? "" : "s"}</span></header>
              {productionPackage.warnings.length > 0 && <div className="session-package-warnings">{productionPackage.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
              <PackageGroup title="Direct TEW Fields" fields={productionPackage.directTewFields} /><PackageGroup title="Suggested TEW Notes" fields={productionPackage.tewNotes} /><PackageGroup title="Companion-Only Strategy" fields={productionPackage.companionOnly} />
              <div className="session-package-actions"><button className="secondary-button" type="button" onClick={() => void copyText(productionPackage.conciseText).then((copied) => setNotice(copied ? "Concise TEW package copied." : "Nothing was copied."))}>Copy Concise TEW Package</button><button className="secondary-button" type="button" onClick={() => void copyText(productionPackage.fullText).then((copied) => setNotice(copied ? "Full production package copied." : "Nothing was copied."))}>Copy Full Production Package</button><button className="primary-button" type="button" onClick={markReadyForTew}>Mark Ready for TEW</button><button className="primary-button" type="button" onClick={() => { generateInlineEntry(); setStep("entry"); }}>{transferPackage ? "Refresh Inline TEW Entry" : "Generate Inline TEW Entry"}</button></div>
              {selectedOutputItem && <section className="session-lineage-summary"><h4>Permanent lineage</h4><p>{selectedOutputItem.versions.length} preserved version{selectedOutputItem.versions.length === 1 ? "" : "s"}: {selectedOutputItem.versions.map((version) => version.stage).join(" → ")}</p></section>}
            </section>}

            {activeStep === "entry" && <section className="session-step-panel">
              <header><div><p className="eyebrow">INLINE ASSISTED TEW ENTRY</p><h3>{selectedSegment.title}</h3><p>Copy and mark fields without leaving the show session. Companion-only strategy cannot be written into TEW automatically.</p></div><button className="secondary-button" type="button" onClick={onOpenTransfer}>Open Full TEW Transfer Workspace</button></header>
              {transferStale && <div className="session-stale-warning"><strong>Entry package is stale.</strong><span>The planned card changed after this package was generated.</span><button type="button" onClick={generateInlineEntry}>Regenerate Now</button></div>}
              {!transferPackage || !transferSegment ? <div className="empty-state"><h3>No inline TEW entry package</h3><p>Generate the package from the current planned card. The operation is read-only toward TEW.</p><button className="primary-button" type="button" onClick={generateInlineEntry}>Generate Inline TEW Entry</button></div> : <>
                <details className="session-event-entry"><summary>Event information</summary>{transferPackage.eventFields.map((field) => { const key = `event:${field.key}`; const choice = { field, fieldKey: key, event: true }; return <EntryFieldRow key={key} field={field} fieldKey={key} progress={fieldProgress(transferRecord?.eventProgress ?? [], key)} onCopy={() => void copyEntryField(choice)} onStatus={(status) => updateEntryStatus(key, status, true)} />; })}</details>
                <section className="session-entry-fields"><header><h4>Segment fields and notes</h4><span>{transferSegmentProgress?.fields.filter((field) => field.status === "Entered" || field.status === "Changed in TEW").length ?? 0}/{transferSegmentProgress?.fields.filter((field) => field.status !== "Not Applicable").length ?? 0}</span></header>{[...transferSegment.directFields, ...transferSegment.tewNotes, ...transferSegment.companionOnly].map((field) => { const key = `${transferSegment.segmentId}:${field.destination}:${field.key}`; const choice = { field, fieldKey: key, event: false }; return <EntryFieldRow key={key} field={field} fieldKey={key} progress={fieldProgress(transferSegmentProgress?.fields ?? [], key)} onCopy={() => void copyEntryField(choice)} onStatus={(status) => updateEntryStatus(key, status, false)} />; })}</section>
                <section className="session-entry-change"><header><h4>Preserve a change made inside TEW</h4><p>The original tracker value remains in history.</p></header><div className="session-form-grid"><label className="field field--wide"><span>Changed field</span><select aria-label="Session changed TEW field" value={changeFieldKey} onChange={(event) => { const choice = entryChoices.find((item) => item.fieldKey === event.target.value); setChangeFieldKey(event.target.value); setChangedValue(choice?.field.value ?? ""); }}><option value="">Choose a field…</option>{entryChoices.map((choice) => <option key={choice.fieldKey} value={choice.fieldKey}>{choice.event ? "Event" : "Segment"} · {choice.field.label}</option>)}</select></label><label className="field field--wide"><span>Value actually entered in TEW</span><textarea aria-label="Session changed TEW value" rows={3} value={changedValue} onChange={(event) => setChangedValue(event.target.value)} /></label><label className="field field--full"><span>Reason for change</span><textarea aria-label="Session TEW change reason" rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></label></div><label><input type="checkbox" checked={updateCreativePlan} onChange={(event) => setUpdateCreativePlan(event.target.checked)} /> Update the current tracker plan to match TEW</label><label><input type="checkbox" checked={requiresNewVersion} onChange={(event) => setRequiresNewVersion(event.target.checked)} /> This change requires a new frozen or output version</label><button className="secondary-button" type="button" onClick={recordTewChange}>Record TEW Entry Change</button></section>
                <div className="session-entry-actions"><button className="primary-button" type="button" onClick={markSegmentEntered}>Mark Segment Entered in TEW</button><button className="secondary-button" type="button" disabled={!allSegmentsEntered} onClick={markShowRunInTew}>Show Has Been Run in TEW</button></div>
              </>}
            </section>}

            {activeStep === "result" && <section className="session-step-panel">
              <header><div><p className="eyebrow">POST-SHOW RESULT INTAKE</p><h3>Reconcile the actual TEW result inside this session</h3><p>Suggestions use show identity, participant overlap, running order, duration, and winner information. Every link still requires confirmation.</p></div><div className="session-snapshot-card"><span>Loaded snapshot</span><strong>{snapshot?.fileName ?? "None"}</strong><small>{snapshot ? `${snapshot.shows.length} shows · read-only` : "Select the post-show MDB copy"}</small></div></header>
              <input ref={snapshotInputRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const file = event.target.files?.item(0); if (file) void onSnapshotFile(file); event.currentTarget.value = ""; }} />
              <div className="session-result-actions"><button className="secondary-button" type="button" onClick={() => snapshotInputRef.current?.click()}>{snapshot ? "Replace Post-Show Snapshot" : "Load Post-Show TEW Snapshot"}</button><button className="primary-button" type="button" disabled={!snapshot || snapshotLoading} onClick={analyzeResults}>{snapshotLoading ? "Reading Snapshot…" : "Analyze Result Suggestions"}</button></div>
              {snapshotError && <div className="status-banner error"><strong>Snapshot import failed</strong><span>{snapshotError}</span></div>}
              {latestResultSession && <section className="session-result-session"><header><div><span>{latestResultSession.actualShowName}</span><h4>{latestResultSession.showConfidence}% show confidence</h4></div><small>{latestResultSession.sourceFile} · {formatDate(latestResultSession.createdAt)}</small></header><p>{latestResultSession.showReasons.join(" · ") || "No supporting show evidence was recorded."}</p>{selectedSegment.type === "match" ? selectedSuggestion ? <article className={`session-result-suggestion session-result-suggestion--${selectedSuggestion.status.toLowerCase()}`}><header><strong>{selectedSuggestion.actualDescription}</strong><span>{selectedSuggestion.confidence}%</span></header><p>{selectedSuggestion.reasons.join(" · ") || "Low-confidence participant and card-position match."}</p><footer><button className="primary-button" type="button" onClick={() => updateSuggestion("Confirmed")}>Confirm This Link</button><button className="secondary-button" type="button" onClick={() => updateSuggestion("Rejected")}>Reject This Link</button><b>{selectedSuggestion.status}</b></footer></article> : <p>No match suggestion exists for this segment.</p> : <p>TEW match history does not expose an equivalent angle-result record. The Angle Output remains the permanent creative record and is reconciled when the show is confirmed.</p>}<button className="primary-button" type="button" disabled={!latestResultSession.suggestions.some((suggestion) => suggestion.status === "Confirmed") || Boolean(latestResultSession.appliedAt)} onClick={applyConfirmedResults}>{latestResultSession.appliedAt ? "Confirmed Links Applied" : "Apply All Confirmed Match Links"}</button></section>}
              {selectedSegment.reconciliation.actualMatch && <section className="session-actual-result"><header><div><p className="eyebrow">ACTUAL TEW RESULT</p><h4>{selectedSegment.reconciliation.actualMatch.description}</h4></div><strong>{selectedSegment.reconciliation.actualRating ?? selectedSegment.reconciliation.actualMatch.rating ?? "—"}</strong></header><dl><div><dt>Winner</dt><dd>{selectedSegment.reconciliation.actualMatch.winner || "Unavailable"}</dd></div><div><dt>Time</dt><dd>{selectedSegment.reconciliation.actualMatch.matchTime || "Unavailable"}</dd></div><div><dt>Happened as planned</dt><dd>{selectedSegment.reconciliation.happenedAsPlanned === null ? "Unresolved" : selectedSegment.reconciliation.happenedAsPlanned ? "Yes" : "No"}</dd></div></dl><p>{selectedSegment.reconciliation.finalNarrative || selectedSegment.matchStory}</p></section>}
              <footer><button className="primary-button" type="button" disabled={!selectedShow.reconciliation || !allMatchesReconciled || selectedShow.status === "Reconciled"} onClick={markShowReconciled}>{selectedShow.status === "Reconciled" ? "Show Reconciled" : "Confirm Show Reconciliation"}</button><button className="secondary-button" type="button" onClick={onOpenOutputLibrary}>Review Planned-versus-Actual History</button></footer>
            </section>}
          </>}
        </main>
      </div>
    </>}
  </section>;
}
