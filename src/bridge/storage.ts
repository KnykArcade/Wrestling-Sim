import { emptyBridgeUniverse } from "./model";
import type {
  BridgeFieldMapping,
  BridgeMappingHistoryEntry,
  BridgeUniverse,
  CompanionModeSettings,
  GuardedExportAudit,
  RawEvidenceSession,
  TewComparisonReport,
} from "./types";

export const BRIDGE_STORAGE_KEY = "tew-story-tracker:bridge:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSettings(value: unknown): CompanionModeSettings {
  const defaults = emptyBridgeUniverse().settings;
  if (!isRecord(value)) return defaults;
  const defaultView = ["workflow", "comparison", "mappings", "readiness", "dry-run"].includes(text(value.defaultView))
    ? text(value.defaultView) as CompanionModeSettings["defaultView"]
    : defaults.defaultView;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    advancedPreviewTools: typeof value.advancedPreviewTools === "boolean" ? value.advancedPreviewTools : false,
    defaultView,
  };
}

function normalizeHistory(value: unknown): BridgeMappingHistoryEntry | null {
  if (!isRecord(value) || !text(value.id)) return null;
  const stages = ["Candidate", "Corroborated", "Verified", "Export Eligible", "Unsupported"];
  return {
    id: text(value.id),
    changedAt: text(value.changedAt),
    fromStage: stages.includes(text(value.fromStage)) ? text(value.fromStage) as BridgeMappingHistoryEntry["fromStage"] : "Candidate",
    toStage: stages.includes(text(value.toStage)) ? text(value.toStage) as BridgeMappingHistoryEntry["toStage"] : "Candidate",
    reason: text(value.reason),
  };
}

function normalizeMapping(value: unknown): BridgeFieldMapping | null {
  if (!isRecord(value) || !text(value.id) || !text(value.trackerField)) return null;
  const category = ["Show", "Match", "Angle", "Worker", "Storyline", "Championship", "Competition"].includes(text(value.category))
    ? text(value.category) as BridgeFieldMapping["category"]
    : "Show";
  const status = ["Candidate", "Verified", "Unsupported"].includes(text(value.status))
    ? text(value.status) as BridgeFieldMapping["status"]
    : "Candidate";
  const confidence = ["Low", "Medium", "High"].includes(text(value.confidence))
    ? text(value.confidence) as BridgeFieldMapping["confidence"]
    : "Low";
  const stages = ["Candidate", "Corroborated", "Verified", "Export Eligible", "Unsupported"];
  const fallbackStage = status === "Verified" ? "Verified" : status === "Unsupported" ? "Unsupported" : "Candidate";
  return {
    id: text(value.id),
    category,
    trackerField: text(value.trackerField),
    trackerLabel: text(value.trackerLabel, text(value.trackerField)),
    tewTable: text(value.tewTable),
    tewField: text(value.tewField),
    status,
    verificationStage: stages.includes(text(value.verificationStage)) ? text(value.verificationStage) as BridgeFieldMapping["verificationStage"] : fallbackStage,
    confidence,
    identityField: text(value.identityField),
    requiredDefaults: text(value.requiredDefaults),
    formatNotes: text(value.formatNotes),
    evidenceSessionIds: strings(value.evidenceSessionIds),
    history: Array.isArray(value.history) ? value.history.map(normalizeHistory).filter((item): item is BridgeMappingHistoryEntry => item !== null) : [],
    evidence: text(value.evidence),
    notes: text(value.notes),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeComparison(value: unknown): TewComparisonReport | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: text(value.id),
    createdAt: text(value.createdAt),
    beforeFileName: text(value.beforeFileName),
    afterFileName: text(value.afterFileName),
    beforeImportedAt: text(value.beforeImportedAt),
    afterImportedAt: text(value.afterImportedAt),
    tableChanges: Array.isArray(value.tableChanges) ? value.tableChanges.filter(isRecord).map((item) => ({
      tableName: text(item.tableName),
      beforeRows: typeof item.beforeRows === "number" ? item.beforeRows : 0,
      afterRows: typeof item.afterRows === "number" ? item.afterRows : 0,
      rowDelta: typeof item.rowDelta === "number" ? item.rowDelta : 0,
      beforeColumns: typeof item.beforeColumns === "number" ? item.beforeColumns : 0,
      afterColumns: typeof item.afterColumns === "number" ? item.afterColumns : 0,
      classification: ["Unchanged", "Rows Added", "Rows Removed", "Schema Changed", "New Table", "Missing Table"].includes(text(item.classification)) ? text(item.classification) as TewComparisonReport["tableChanges"][number]["classification"] : "Unchanged",
    })) : [],
    entityChanges: Array.isArray(value.entityChanges) ? value.entityChanges.filter(isRecord).map((item) => ({
      entityType: ["Show", "Match", "Worker", "Storyline"].includes(text(item.entityType)) ? text(item.entityType) as TewComparisonReport["entityChanges"][number]["entityType"] : "Show",
      entityId: text(item.entityId),
      entityName: text(item.entityName),
      changeType: ["Added", "Removed", "Changed"].includes(text(item.changeType)) ? text(item.changeType) as TewComparisonReport["entityChanges"][number]["changeType"] : "Changed",
      fieldChanges: Array.isArray(item.fieldChanges) ? item.fieldChanges.filter(isRecord).map((field) => ({ field: text(field.field), beforeValue: text(field.beforeValue), afterValue: text(field.afterValue) })) : [],
    })) : [],
    candidateTables: strings(value.candidateTables),
    notes: text(value.notes),
  };
}

function normalizeRawEvidence(value: unknown): RawEvidenceSession | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return value as unknown as RawEvidenceSession;
}

function normalizeExportAudit(value: unknown): GuardedExportAudit | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return value as unknown as GuardedExportAudit;
}

export function parseBridgeUniverse(value: unknown): BridgeUniverse {
  const defaults = emptyBridgeUniverse();
  if (!isRecord(value)) return { ...defaults, rawEvidenceSessions: [], exportAudits: [] };
  const mappings = Array.isArray(value.mappings)
    ? value.mappings.map(normalizeMapping).filter((item): item is BridgeFieldMapping => item !== null)
    : [];
  const comparisons = Array.isArray(value.comparisonReports)
    ? value.comparisonReports.map(normalizeComparison).filter((item): item is TewComparisonReport => item !== null)
    : [];
  return {
    settings: normalizeSettings(value.settings),
    mappings: mappings.length > 0 ? mappings : defaults.mappings.map((mapping) => normalizeMapping(mapping) ?? mapping),
    comparisonReports: comparisons,
    rawEvidenceSessions: Array.isArray(value.rawEvidenceSessions) ? value.rawEvidenceSessions.map(normalizeRawEvidence).filter((item): item is RawEvidenceSession => item !== null) : [],
    exportAudits: Array.isArray(value.exportAudits) ? value.exportAudits.map(normalizeExportAudit).filter((item): item is GuardedExportAudit => item !== null) : [],
  };
}

export function loadBridgeUniverse(storage: Pick<Storage, "getItem">): BridgeUniverse {
  const stored = storage.getItem(BRIDGE_STORAGE_KEY);
  if (!stored) return parseBridgeUniverse(emptyBridgeUniverse());
  try { return parseBridgeUniverse(JSON.parse(stored) as unknown); } catch { return parseBridgeUniverse(emptyBridgeUniverse()); }
}

export function saveBridgeUniverse(storage: Pick<Storage, "setItem">, universe: BridgeUniverse): void {
  storage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(universe));
}
