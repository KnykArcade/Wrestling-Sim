import type { HandoffUniverse, ShowHandoffRecord } from "../handoff/types";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { MatchRecord, ShowRecord, StorylineRecord, TewSnapshot, WorkerReference } from "../tew/types";
import type {
  BridgeDryRunPackage,
  BridgeFieldMapping,
  BridgeReadinessField,
  BridgeReadinessReport,
  BridgeUniverse,
  ProposedBridgeChange,
  TewComparisonReport,
  TewEntityChange,
  TewEntityFieldChange,
  TewTableChange,
} from "./types";

function id(prefix = "bridge"): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).join(", ");
  return String(value);
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): TewEntityFieldChange[] {
  return fields.flatMap((field) => {
    const beforeValue = text(before[field]);
    const afterValue = text(after[field]);
    return beforeValue === afterValue ? [] : [{ field, beforeValue, afterValue }];
  });
}

function workerRecord(worker: WorkerReference): Record<string, unknown> {
  return { id: worker.id, name: worker.name, role: worker.role, side: worker.side };
}

function matchRecord(match: MatchRecord): Record<string, unknown> {
  return {
    id: match.id,
    showId: match.showId,
    description: match.description,
    rating: match.rating,
    winner: match.winner,
    matchTime: match.matchTime,
    notes: match.notes,
    placement: match.placement,
    workers: match.workers.map((worker) => worker.name),
  };
}

function showRecord(show: ShowRecord): Record<string, unknown> {
  return {
    id: show.id,
    name: show.name,
    date: show.date,
    rating: show.rating,
    attendance: show.attendance,
    venue: show.venue,
    company: show.company,
    broadcast: show.broadcast,
    matchCount: show.matches.length,
  };
}

function storylineRecord(storyline: StorylineRecord): Record<string, unknown> {
  return {
    id: storyline.id,
    name: storyline.name,
    description: storyline.description,
    status: storyline.status,
    heat: storyline.heat,
    workers: storyline.workers.map((worker) => worker.name),
    sourceTable: storyline.sourceTable,
  };
}

function compareEntityGroup(
  entityType: TewEntityChange["entityType"],
  beforeItems: Array<{ id: string; name: string; record: Record<string, unknown> }>,
  afterItems: Array<{ id: string; name: string; record: Record<string, unknown> }>,
  fields: string[],
): TewEntityChange[] {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(afterItems.map((item) => [item.id, item]));
  const changes: TewEntityChange[] = [];
  for (const item of afterItems) {
    const before = beforeById.get(item.id);
    if (!before) {
      changes.push({ entityType, entityId: item.id, entityName: item.name, changeType: "Added", fieldChanges: [] });
      continue;
    }
    const fieldChanges = changedFields(before.record, item.record, fields);
    if (fieldChanges.length > 0) changes.push({ entityType, entityId: item.id, entityName: item.name, changeType: "Changed", fieldChanges });
  }
  for (const item of beforeItems) {
    if (!afterById.has(item.id)) changes.push({ entityType, entityId: item.id, entityName: item.name, changeType: "Removed", fieldChanges: [] });
  }
  return changes;
}

export function createDefaultBridgeMappings(): BridgeFieldMapping[] {
  const now = new Date().toISOString();
  const rows: Array<[BridgeFieldMapping["category"], string, string]> = [
    ["Show", "name", "Show name"],
    ["Show", "date", "Show date"],
    ["Show", "showType", "Event type"],
    ["Show", "venue", "Venue"],
    ["Show", "company", "Company"],
    ["Match", "title", "Segment title"],
    ["Match", "durationMinutes", "Duration"],
    ["Match", "matchType", "Match type"],
    ["Match", "workers", "Participants and sides"],
    ["Match", "plannedWinner", "Winner"],
    ["Match", "plannedFinish", "Finish"],
    ["Match", "championship", "Championship"],
    ["Match", "storylines", "Storyline links"],
    ["Match", "matchStory", "Match Story / road-agent notes"],
    ["Angle", "workers", "Angle participants and roles"],
    ["Angle", "durationMinutes", "Angle duration"],
    ["Angle", "angleLocation", "Angle location"],
    ["Angle", "angleContentType", "Angle content type"],
    ["Angle", "segmentOutput", "Segment Output"],
  ];
  return rows.map(([category, trackerField, trackerLabel]) => ({
    id: id("mapping"),
    category,
    trackerField,
    trackerLabel,
    tewTable: "",
    tewField: "",
    status: "Candidate",
    confidence: "Low",
    evidence: "No verified before/after database evidence has been attached yet.",
    notes: "",
    updatedAt: now,
  }));
}

export function emptyBridgeUniverse(): BridgeUniverse {
  return {
    settings: { enabled: true, advancedPreviewTools: false, defaultView: "workflow" },
    mappings: createDefaultBridgeMappings(),
    comparisonReports: [],
  };
}

export function compareTewSnapshots(before: TewSnapshot, after: TewSnapshot): TewComparisonReport {
  const tableNames = new Set([...before.tables.map((table) => table.name), ...after.tables.map((table) => table.name)]);
  const tableChanges: TewTableChange[] = [...tableNames].sort().map((tableName) => {
    const left = before.tables.find((table) => table.name === tableName);
    const right = after.tables.find((table) => table.name === tableName);
    const beforeRows = left?.rowCount ?? 0;
    const afterRows = right?.rowCount ?? 0;
    let classification: TewTableChange["classification"] = "Unchanged";
    if (!left) classification = "New Table";
    else if (!right) classification = "Missing Table";
    else if (left.columnCount !== right.columnCount || left.columns.join("|") !== right.columns.join("|")) classification = "Schema Changed";
    else if (afterRows > beforeRows) classification = "Rows Added";
    else if (afterRows < beforeRows) classification = "Rows Removed";
    return { tableName, beforeRows, afterRows, rowDelta: afterRows - beforeRows, beforeColumns: left?.columnCount ?? 0, afterColumns: right?.columnCount ?? 0, classification };
  });

  const beforeMatches = before.shows.flatMap((show) => show.matches);
  const afterMatches = after.shows.flatMap((show) => show.matches);
  const entityChanges = [
    ...compareEntityGroup("Show", before.shows.map((show) => ({ id: show.id, name: show.name, record: showRecord(show) })), after.shows.map((show) => ({ id: show.id, name: show.name, record: showRecord(show) })), ["name", "date", "rating", "attendance", "venue", "company", "broadcast", "matchCount"]),
    ...compareEntityGroup("Match", beforeMatches.map((match) => ({ id: match.id, name: match.description, record: matchRecord(match) })), afterMatches.map((match) => ({ id: match.id, name: match.description, record: matchRecord(match) })), ["showId", "description", "rating", "winner", "matchTime", "notes", "placement", "workers"]),
    ...compareEntityGroup("Worker", before.workers.map((worker) => ({ id: worker.id, name: worker.name, record: workerRecord(worker) })), after.workers.map((worker) => ({ id: worker.id, name: worker.name, record: workerRecord(worker) })), ["name", "role", "side"]),
    ...compareEntityGroup("Storyline", before.storylines.map((storyline) => ({ id: `${storyline.sourceTable}:${storyline.id}`, name: storyline.name, record: storylineRecord(storyline) })), after.storylines.map((storyline) => ({ id: `${storyline.sourceTable}:${storyline.id}`, name: storyline.name, record: storylineRecord(storyline) })), ["name", "description", "status", "heat", "workers", "sourceTable"]),
  ];
  const candidateTables = tableChanges.filter((change) => change.classification !== "Unchanged").map((change) => change.tableName);
  return {
    id: id("comparison"),
    createdAt: new Date().toISOString(),
    beforeFileName: before.fileName,
    afterFileName: after.fileName,
    beforeImportedAt: before.importedAt,
    afterImportedAt: after.importedAt,
    tableChanges,
    entityChanges,
    candidateTables,
    notes: "Read-only structural comparison. A changed table is evidence to investigate, not proof that direct writing is safe.",
  };
}

function mappingFor(mappings: BridgeFieldMapping[], category: BridgeFieldMapping["category"], field: string): BridgeFieldMapping | undefined {
  return mappings.find((mapping) => mapping.category === category && mapping.trackerField === field);
}

function readinessField(mappings: BridgeFieldMapping[], category: BridgeFieldMapping["category"], field: string, label: string, value: unknown): BridgeReadinessField {
  const mapping = mappingFor(mappings, category, field);
  if (!text(value).trim()) return { trackerField: field, label, status: "Missing", detail: "Required tracker value is empty." };
  if (!mapping || mapping.status === "Unsupported") return { trackerField: field, label, status: mapping?.status === "Unsupported" ? "Unsupported" : "Manual", detail: mapping?.notes || "No TEW database mapping is confirmed; use the Entry Assistant." };
  if (mapping.status === "Verified" && mapping.tewTable && mapping.tewField) return { trackerField: field, label, status: "Verified", detail: `${mapping.tewTable}.${mapping.tewField} · ${mapping.confidence} confidence` };
  return { trackerField: field, label, status: "Candidate", detail: mapping.evidence || "Candidate mapping requires more before/after evidence." };
}

export function buildBridgeReadiness(show: PlannedShow, mappings: BridgeFieldMapping[]): BridgeReadinessReport {
  const fields: BridgeReadinessField[] = [
    readinessField(mappings, "Show", "name", "Show name", show.name),
    readinessField(mappings, "Show", "date", "Show date", show.date),
    readinessField(mappings, "Show", "showType", "Event type", show.showType),
    readinessField(mappings, "Show", "venue", "Venue", show.venue),
    readinessField(mappings, "Show", "company", "Company", show.company),
  ];
  for (const segment of show.segments) {
    const category = segment.type === "match" ? "Match" : "Angle";
    fields.push(readinessField(mappings, category, "title", `${segment.title}: title`, segment.title));
    fields.push(readinessField(mappings, category, "durationMinutes", `${segment.title}: duration`, segment.durationMinutes));
    fields.push(readinessField(mappings, category, "workers", `${segment.title}: workers`, segment.workers.map((worker) => worker.name)));
    if (segment.type === "match") {
      fields.push(readinessField(mappings, "Match", "matchType", `${segment.title}: match type`, segment.matchType));
      fields.push(readinessField(mappings, "Match", "plannedWinner", `${segment.title}: winner`, segment.plannedWinner || "Manual/TEW authoritative"));
      fields.push(readinessField(mappings, "Match", "plannedFinish", `${segment.title}: finish`, segment.plannedFinish || "Manual/TEW authoritative"));
      fields.push(readinessField(mappings, "Match", "matchStory", `${segment.title}: Match Story`, segment.matchStory));
    } else {
      fields.push(readinessField(mappings, "Angle", "angleLocation", `${segment.title}: location`, segment.angleLocation));
      fields.push(readinessField(mappings, "Angle", "segmentOutput", `${segment.title}: Segment Output`, segment.segmentOutput));
    }
  }
  return {
    showId: show.id,
    showName: show.name,
    generatedAt: new Date().toISOString(),
    verifiedCount: fields.filter((field) => field.status === "Verified").length,
    candidateCount: fields.filter((field) => field.status === "Candidate").length,
    manualCount: fields.filter((field) => field.status === "Manual").length,
    blockingCount: fields.filter((field) => field.status === "Missing" || field.status === "Unsupported").length,
    fields,
  };
}

function proposedChange(mapping: BridgeFieldMapping | undefined, category: BridgeFieldMapping["category"], value: unknown, referencedIds: string[] = []): ProposedBridgeChange {
  const hasValue = Boolean(text(value).trim());
  const validation: ProposedBridgeChange["validation"] = !hasValue
    ? "Blocked"
    : mapping?.status === "Verified" && mapping.tewTable && mapping.tewField
      ? "Ready"
      : mapping?.status === "Candidate"
        ? "Candidate"
        : "Manual";
  return {
    id: id("change"),
    category,
    targetTable: mapping?.tewTable || "Unverified",
    targetField: mapping?.tewField || mapping?.trackerField || "Unmapped",
    proposedValue: text(value),
    referencedIds,
    validation,
    problem: !hasValue ? "Tracker value is empty." : validation === "Ready" ? "" : validation === "Candidate" ? "Mapping requires verification before any exporter can use it." : "Use the TEW Entry Assistant for this field.",
  };
}

export function buildBridgeDryRun(show: PlannedShow, mappings: BridgeFieldMapping[]): BridgeDryRunPackage {
  const proposedChanges: ProposedBridgeChange[] = [];
  const add = (category: BridgeFieldMapping["category"], field: string, value: unknown, ids: string[] = []) => proposedChanges.push(proposedChange(mappingFor(mappings, category, field), category, value, ids));
  add("Show", "name", show.name);
  add("Show", "date", show.date);
  add("Show", "showType", show.showType);
  add("Show", "venue", show.venue);
  add("Show", "company", show.company);
  show.segments.forEach((segment) => {
    const category = segment.type === "match" ? "Match" : "Angle";
    add(category, "title", segment.title, [segment.id]);
    add(category, "durationMinutes", segment.durationMinutes, [segment.id]);
    add(category, "workers", segment.workers.map((worker) => `${worker.name} (${worker.role || "Unspecified role"}${worker.side ? `, ${worker.side}` : ""})`), segment.workers.map((worker) => worker.id));
    if (segment.type === "match") {
      add("Match", "matchType", segment.matchType, [segment.id]);
      add("Match", "plannedWinner", segment.plannedWinner, [segment.id]);
      add("Match", "plannedFinish", segment.plannedFinish, [segment.id]);
      add("Match", "championship", segment.championship, [segment.championshipId].filter(Boolean));
      add("Match", "storylines", segment.storylines.map((storyline) => storyline.name), segment.storylines.map((storyline) => storyline.id));
      add("Match", "matchStory", segment.matchStory, [segment.id]);
    } else {
      add("Angle", "angleLocation", segment.angleLocation, [segment.id]);
      add("Angle", "angleContentType", segment.angleContentType, [segment.id]);
      add("Angle", "segmentOutput", segment.segmentOutput, [segment.id]);
    }
  });
  return {
    id: id("dry-run"),
    showId: show.id,
    showName: show.name,
    generatedAt: new Date().toISOString(),
    writingEnabled: false,
    proposedChanges,
    readyCount: proposedChanges.filter((change) => change.validation === "Ready").length,
    candidateCount: proposedChanges.filter((change) => change.validation === "Candidate").length,
    blockedCount: proposedChanges.filter((change) => change.validation === "Blocked").length,
    manualCount: proposedChanges.filter((change) => change.validation === "Manual").length,
  };
}

export interface CompanionWorkflowStep {
  id: string;
  label: string;
  detail: string;
  status: "Complete" | "Current" | "Waiting" | "Needs Attention";
}

function handoffRecord(showId: string, universe: HandoffUniverse): ShowHandoffRecord | undefined {
  return universe.records.find((record) => record.showId === showId);
}

export function buildCompanionWorkflow(show: PlannedShow, handoff: HandoffUniverse): CompanionWorkflowStep[] {
  const record = handoffRecord(show.id, handoff);
  const narrativesReady = show.segments.length > 0 && show.segments.every((segment) => segment.type === "match" ? Boolean(segment.matchStory.trim()) : Boolean(segment.segmentOutput.trim()));
  const approachesReady = show.segments.filter((segment) => segment.type === "match").every((segment) => segment.matchApproachSetup.workerPlans.length > 0);
  const finalized = Boolean(record?.versions.length);
  const entered = record?.status === "Entered in TEW" || record?.status === "Completed" || record?.status === "Reconciled";
  const completed = show.status === "Completed" || show.status === "Reconciled";
  const reconciled = show.status === "Reconciled" && Boolean(show.reconciliation);
  const states = [
    { id: "snapshot", label: "Import current TEW snapshot", done: true, attention: false, detail: "Load a current read-only TEW MDB/ACCDB reference before final entry." },
    { id: "card", label: "Plan the card", done: show.segments.length > 0, attention: show.segments.length === 0, detail: `${show.segments.length} planned segment${show.segments.length === 1 ? "" : "s"}.` },
    { id: "approaches", label: "Select match approaches", done: approachesReady, attention: !approachesReady, detail: "Configure the tracker-only approach layer for each match." },
    { id: "outputs", label: "Complete Match Stories and Angle Outputs", done: narrativesReady, attention: !narrativesReady, detail: "Generated or manually written outputs remain editable." },
    { id: "handoff", label: "Finalize TEW handoff", done: finalized, attention: false, detail: record ? `${record.versions.length} frozen version${record.versions.length === 1 ? "" : "s"}.` : "No frozen handoff version yet." },
    { id: "entry", label: "Enter the finalized card in TEW", done: entered, attention: false, detail: record?.status || "Use the guided Entry Assistant." },
    { id: "run", label: "Run the show in TEW", done: completed, attention: false, detail: "TEW remains authoritative for actual results and ratings." },
    { id: "reconcile", label: "Import post-show snapshot and reconcile", done: reconciled, attention: completed && !reconciled, detail: reconciled ? "Actual TEW history is linked." : "Compare the actual show with the creative plan." },
  ];
  const firstIncomplete = states.findIndex((state) => !state.done);
  return states.map((state, index) => ({
    id: state.id,
    label: state.label,
    detail: state.detail,
    status: state.done ? "Complete" : state.attention ? "Needs Attention" : index === firstIncomplete ? "Current" : "Waiting",
  }));
}
