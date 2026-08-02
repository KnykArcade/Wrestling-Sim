import { emptyTransferUniverse } from "./model";
import type {
  TransferAuditLog,
  TransferFieldProgress,
  TransferPackage,
  TransferRecord,
  TransferSegmentProgress,
  TransferUniverse,
} from "./types";

export const TRANSFER_STORAGE_KEY = "tew-story-tracker:transfer:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeFieldProgress(value: unknown): TransferFieldProgress | null {
  if (!isRecord(value) || !text(value.fieldKey)) return null;
  const status = ["Pending", "Copied", "Entered", "Not Applicable"].includes(text(value.status))
    ? text(value.status) as TransferFieldProgress["status"]
    : "Pending";
  return { fieldKey: text(value.fieldKey), status, updatedAt: text(value.updatedAt) };
}

function normalizeSegmentProgress(value: unknown): TransferSegmentProgress | null {
  if (!isRecord(value) || !text(value.segmentId)) return null;
  return {
    segmentId: text(value.segmentId),
    fields: Array.isArray(value.fields) ? value.fields.map(normalizeFieldProgress).filter((item): item is TransferFieldProgress => item !== null) : [],
    completed: value.completed === true,
    entryNotes: text(value.entryNotes),
    updatedAt: text(value.updatedAt),
  };
}

function normalizePackage(value: unknown): TransferPackage | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !Array.isArray(value.eventFields) || !Array.isArray(value.segments)) return null;
  return value as unknown as TransferPackage;
}

function normalizeRecord(value: unknown): TransferRecord | null {
  if (!isRecord(value) || !text(value.showId)) return null;
  const packageHistory = Array.isArray(value.packageHistory)
    ? value.packageHistory.map(normalizePackage).filter((item): item is TransferPackage => item !== null)
    : [];
  return {
    showId: text(value.showId),
    activePackageId: text(value.activePackageId, packageHistory.at(-1)?.id ?? ""),
    packageHistory,
    eventProgress: Array.isArray(value.eventProgress) ? value.eventProgress.map(normalizeFieldProgress).filter((item): item is TransferFieldProgress => item !== null) : [],
    segmentProgress: Array.isArray(value.segmentProgress) ? value.segmentProgress.map(normalizeSegmentProgress).filter((item): item is TransferSegmentProgress => item !== null) : [],
    currentSegmentIndex: typeof value.currentSegmentIndex === "number" && Number.isFinite(value.currentSegmentIndex) ? Math.max(0, Math.floor(value.currentSegmentIndex)) : 0,
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeAudit(value: unknown): TransferAuditLog | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  const action = ["Package Generated", "Field Copied", "Field Entered", "Segment Completed", "Export Plan Downloaded"].includes(text(value.action))
    ? text(value.action) as TransferAuditLog["action"]
    : "Package Generated";
  return { id: text(value.id), showId: text(value.showId), createdAt: text(value.createdAt), action, detail: text(value.detail) };
}

export function parseTransferUniverse(value: unknown): TransferUniverse {
  if (!isRecord(value)) return emptyTransferUniverse();
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord).filter((item): item is TransferRecord => item !== null) : [],
    auditLogs: Array.isArray(value.auditLogs) ? value.auditLogs.map(normalizeAudit).filter((item): item is TransferAuditLog => item !== null) : [],
  };
}

export function loadTransferUniverse(storage: Pick<Storage, "getItem">): TransferUniverse {
  const stored = storage.getItem(TRANSFER_STORAGE_KEY);
  if (!stored) return emptyTransferUniverse();
  try { return parseTransferUniverse(JSON.parse(stored) as unknown); } catch { return emptyTransferUniverse(); }
}

export function saveTransferUniverse(storage: Pick<Storage, "setItem">, universe: TransferUniverse): void {
  storage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(universe));
}
