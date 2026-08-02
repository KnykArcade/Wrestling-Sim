import { createShowOperationsRecord, emptyShowOperationsUniverse } from "./model";
import type {
  OperationsChangeNote,
  ResultIntakeSession,
  ResultMatchSuggestion,
  ShowOperationsRecord,
  ShowOperationsUniverse,
} from "./types";

export const SHOW_OPERATIONS_STORAGE_KEY = "tew-story-tracker:show-operations:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSuggestion(value: unknown): ResultMatchSuggestion | null {
  if (!isRecord(value) || !text(value.plannedSegmentId) || !text(value.actualMatchId)) return null;
  const status = ["Suggested", "Confirmed", "Rejected"].includes(text(value.status))
    ? text(value.status) as ResultMatchSuggestion["status"]
    : "Suggested";
  return {
    plannedSegmentId: text(value.plannedSegmentId),
    plannedTitle: text(value.plannedTitle),
    actualMatchId: text(value.actualMatchId),
    actualDescription: text(value.actualDescription),
    confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(100, value.confidence)) : 0,
    reasons: strings(value.reasons),
    status,
  };
}

function normalizeSession(value: unknown): ResultIntakeSession | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    createdAt: text(value.createdAt),
    sourceFile: text(value.sourceFile),
    actualShowId: text(value.actualShowId),
    actualShowName: text(value.actualShowName),
    showConfidence: typeof value.showConfidence === "number" && Number.isFinite(value.showConfidence) ? Math.max(0, Math.min(100, value.showConfidence)) : 0,
    showReasons: strings(value.showReasons),
    suggestions: Array.isArray(value.suggestions) ? value.suggestions.map(normalizeSuggestion).filter((item): item is ResultMatchSuggestion => item !== null) : [],
    appliedAt: text(value.appliedAt),
  };
}

function normalizeChangeNote(value: unknown): OperationsChangeNote | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    segmentId: text(value.segmentId),
    field: text(value.field),
    originalValue: text(value.originalValue),
    enteredValue: text(value.enteredValue),
    reason: text(value.reason),
    updateCreativePlan: value.updateCreativePlan === true,
    requiresNewVersion: value.requiresNewVersion === true,
    createdAt: text(value.createdAt),
  };
}

function normalizeRecord(value: unknown): ShowOperationsRecord | null {
  if (!isRecord(value) || !text(value.showId)) return null;
  const defaults = createShowOperationsRecord(text(value.showId));
  const tab = ["overview", "preflight", "entry", "results", "changes"].includes(text(value.lastViewedTab))
    ? text(value.lastViewedTab) as ShowOperationsRecord["lastViewedTab"]
    : defaults.lastViewedTab;
  return {
    showId: text(value.showId),
    acknowledgedIssueIds: strings(value.acknowledgedIssueIds),
    changeNotes: Array.isArray(value.changeNotes) ? value.changeNotes.map(normalizeChangeNote).filter((item): item is OperationsChangeNote => item !== null) : [],
    resultSessions: Array.isArray(value.resultSessions) ? value.resultSessions.map(normalizeSession).filter((item): item is ResultIntakeSession => item !== null) : [],
    lastViewedTab: tab,
    updatedAt: text(value.updatedAt),
  };
}

export function parseShowOperationsUniverse(value: unknown): ShowOperationsUniverse {
  if (!isRecord(value)) return emptyShowOperationsUniverse();
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord).filter((item): item is ShowOperationsRecord => item !== null) : [],
  };
}

export function loadShowOperationsUniverse(storage: Pick<Storage, "getItem">): ShowOperationsUniverse {
  const stored = storage.getItem(SHOW_OPERATIONS_STORAGE_KEY);
  if (!stored) return emptyShowOperationsUniverse();
  try { return parseShowOperationsUniverse(JSON.parse(stored) as unknown); } catch { return emptyShowOperationsUniverse(); }
}

export function saveShowOperationsUniverse(storage: Pick<Storage, "setItem">, universe: ShowOperationsUniverse): void {
  storage.setItem(SHOW_OPERATIONS_STORAGE_KEY, JSON.stringify(universe));
}
