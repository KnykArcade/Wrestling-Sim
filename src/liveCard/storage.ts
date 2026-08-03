import { emptyLiveCardUniverse, upsertLiveCardSession as upsertSession } from "./model";
import type {
  LiveCardAuditEntry,
  LiveCardCorrectionEntry,
  LiveCardSegmentProgress,
  LiveCardSession,
  LiveCardUniverse,
} from "./types";

export const LIVE_CARD_STORAGE_KEY = "wrestling-sim:live-card:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function correction(value: unknown): LiveCardCorrectionEntry | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: text(value.id),
    reason: text(value.reason),
    beforeOutput: text(value.beforeOutput),
    afterOutput: text(value.afterOutput),
    openedAt: text(value.openedAt),
    completedAt: text(value.completedAt),
  };
}

function progress(value: unknown): LiveCardSegmentProgress | null {
  if (!isRecord(value) || !text(value.segmentId) || (value.type !== "match" && value.type !== "angle")) return null;
  const statuses: LiveCardSegmentProgress["status"][] = ["Planned", "Current", "Result Pending", "Completed", "Skipped", "Correction"];
  return {
    segmentId: text(value.segmentId),
    type: value.type,
    title: text(value.title),
    status: statuses.includes(value.status as LiveCardSegmentProgress["status"]) ? value.status as LiveCardSegmentProgress["status"] : "Planned",
    insertedDuringShow: value.insertedDuringShow === true,
    sourceSegmentId: text(value.sourceSegmentId),
    result: isRecord(value.result) ? value.result as unknown as LiveCardSegmentProgress["result"] : null,
    finalAngleOutput: text(value.finalAngleOutput),
    finalConsequences: text(value.finalConsequences),
    finalFollowUp: text(value.finalFollowUp),
    groundedFacts: strings(value.groundedFacts),
    startedAt: text(value.startedAt),
    completedAt: text(value.completedAt),
    skippedAt: text(value.skippedAt),
    skipReason: text(value.skipReason),
    corrections: Array.isArray(value.corrections) ? value.corrections.map(correction).filter((item): item is LiveCardCorrectionEntry => item !== null) : [],
    updatedAt: text(value.updatedAt),
  };
}

function audit(value: unknown): LiveCardAuditEntry | null {
  if (!isRecord(value) || !text(value.id) || !text(value.action)) return null;
  return value as unknown as LiveCardAuditEntry;
}

function session(value: unknown): LiveCardSession | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  const statuses: LiveCardSession["status"][] = ["Planned", "In Progress", "Completed"];
  return {
    id: text(value.id),
    showId: text(value.showId),
    showName: text(value.showName),
    status: statuses.includes(value.status as LiveCardSession["status"]) ? value.status as LiveCardSession["status"] : "Planned",
    currentSegmentId: text(value.currentSegmentId),
    segmentOrder: strings(value.segmentOrder),
    progress: Array.isArray(value.progress) ? value.progress.map(progress).filter((item): item is LiveCardSegmentProgress => item !== null) : [],
    audit: Array.isArray(value.audit) ? value.audit.map(audit).filter((item): item is LiveCardAuditEntry => item !== null).slice(0, 500) : [],
    startedAt: text(value.startedAt),
    completedAt: text(value.completedAt),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

export function parseLiveCardUniverse(value: unknown): LiveCardUniverse {
  if (!isRecord(value)) return emptyLiveCardUniverse();
  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    sessions: Array.isArray(value.sessions) ? value.sessions.map(session).filter((item): item is LiveCardSession => item !== null) : [],
    settings: {
      selectedShowId: text(settings.selectedShowId),
      showRunnerVisible: settings.showRunnerVisible !== false,
    },
  };
}

export function loadLiveCardUniverse(storage: Pick<Storage, "getItem">): LiveCardUniverse {
  const raw = storage.getItem(LIVE_CARD_STORAGE_KEY);
  if (!raw) return emptyLiveCardUniverse();
  try { return parseLiveCardUniverse(JSON.parse(raw) as unknown); } catch { return emptyLiveCardUniverse(); }
}

export function saveLiveCardUniverse(storage: Pick<Storage, "setItem">, universe: LiveCardUniverse): void {
  storage.setItem(LIVE_CARD_STORAGE_KEY, JSON.stringify(universe));
}

export function upsertLiveCardSession(universe: LiveCardUniverse, sessionValue: LiveCardSession): LiveCardUniverse {
  return upsertSession(universe, sessionValue);
}