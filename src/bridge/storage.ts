import { emptyBridgeUniverse } from "./model";
import type { BridgeFieldMapping, BridgeUniverse, CompanionModeSettings, TewComparisonReport } from "./types";

export const BRIDGE_STORAGE_KEY = "tew-story-tracker:bridge:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
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
  return {
    id: text(value.id),
    category,
    trackerField: text(value.trackerField),
    trackerLabel: text(value.trackerLabel, text(value.trackerField)),
    tewTable: text(value.tewTable),
    tewField: text(value.tewField),
    status,
    confidence,
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
    candidateTables: Array.isArray(value.candidateTables) ? value.candidateTables.filter((item): item is string => typeof item === "string") : [],
    notes: text(value.notes),
  };
}

export function parseBridgeUniverse(value: unknown): BridgeUniverse {
  const defaults = emptyBridgeUniverse();
  if (!isRecord(value)) return defaults;
  const mappings = Array.isArray(value.mappings)
    ? value.mappings.map(normalizeMapping).filter((item): item is BridgeFieldMapping => item !== null)
    : [];
  const comparisons = Array.isArray(value.comparisonReports)
    ? value.comparisonReports.map(normalizeComparison).filter((item): item is TewComparisonReport => item !== null)
    : [];
  return {
    settings: normalizeSettings(value.settings),
    mappings: mappings.length > 0 ? mappings : defaults.mappings,
    comparisonReports: comparisons,
  };
}

export function loadBridgeUniverse(storage: Pick<Storage, "getItem">): BridgeUniverse {
  const stored = storage.getItem(BRIDGE_STORAGE_KEY);
  if (!stored) return emptyBridgeUniverse();
  try { return parseBridgeUniverse(JSON.parse(stored) as unknown); } catch { return emptyBridgeUniverse(); }
}

export function saveBridgeUniverse(storage: Pick<Storage, "setItem">, universe: BridgeUniverse): void {
  storage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(universe));
}
