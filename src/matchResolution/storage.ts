import type {
  MatchResolutionAttempt,
  MatchResolutionRecord,
  MatchResolutionSettings,
  MatchResolutionUniverse,
} from "./types";

export const MATCH_RESOLUTION_STORAGE_KEY = "wrestling-sim:match-resolution:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function emptyMatchResolutionUniverse(): MatchResolutionUniverse {
  return {
    records: [],
    settings: {
      defaultImportance: "Television",
      defaultChemistry: 0,
      defaultVolatility: 8,
      requireOverrideReason: true,
      selectedShowId: "",
      selectedSegmentId: "",
    },
  };
}

function normalizeSettings(value: unknown): MatchResolutionSettings {
  const defaults = emptyMatchResolutionUniverse().settings;
  if (!isRecord(value)) return defaults;
  const importance = ["Television", "Feature", "Main Event", "Championship", "Tournament"].includes(text(value.defaultImportance))
    ? text(value.defaultImportance) as MatchResolutionSettings["defaultImportance"]
    : defaults.defaultImportance;
  return {
    defaultImportance: importance,
    defaultChemistry: Math.max(-10, Math.min(10, numberValue(value.defaultChemistry))),
    defaultVolatility: Math.max(0, Math.min(20, numberValue(value.defaultVolatility, 8))),
    requireOverrideReason: value.requireOverrideReason !== false,
    selectedShowId: text(value.selectedShowId),
    selectedSegmentId: text(value.selectedSegmentId),
  };
}

function normalizeAttempt(value: unknown): MatchResolutionAttempt | null {
  if (!isRecord(value) || !text(value.id) || !isRecord(value.engineResult) || !Array.isArray(value.workerResults)) return null;
  return value as unknown as MatchResolutionAttempt;
}

function normalizeResolutionRecord(value: unknown): MatchResolutionRecord | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId) || !text(value.segmentId) || !isRecord(value.setup)) return null;
  const attempts = Array.isArray(value.attempts) ? value.attempts.map(normalizeAttempt).filter((item): item is MatchResolutionAttempt => item !== null) : [];
  if (!attempts.length) return null;
  const activeAttemptId = attempts.some((attempt) => attempt.id === value.activeAttemptId) ? text(value.activeAttemptId) : attempts.at(-1)!.id;
  const status = ["Unresolved", "Calculated", "Accepted", "Overridden"].includes(text(value.status))
    ? text(value.status) as MatchResolutionRecord["status"]
    : "Calculated";
  return {
    id: text(value.id),
    showId: text(value.showId),
    showName: text(value.showName),
    segmentId: text(value.segmentId),
    segmentTitle: text(value.segmentTitle),
    setup: value.setup as unknown as MatchResolutionRecord["setup"],
    attempts,
    activeAttemptId,
    status,
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

export function parseMatchResolutionUniverse(value: unknown): MatchResolutionUniverse {
  if (!isRecord(value)) return emptyMatchResolutionUniverse();
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeResolutionRecord).filter((item): item is MatchResolutionRecord => item !== null) : [],
    settings: normalizeSettings(value.settings),
  };
}

export function loadMatchResolutionUniverse(storage: Pick<Storage, "getItem">): MatchResolutionUniverse {
  const raw = storage.getItem(MATCH_RESOLUTION_STORAGE_KEY);
  if (!raw) return emptyMatchResolutionUniverse();
  try { return parseMatchResolutionUniverse(JSON.parse(raw) as unknown); } catch { return emptyMatchResolutionUniverse(); }
}

export function saveMatchResolutionUniverse(storage: Pick<Storage, "setItem">, universe: MatchResolutionUniverse): void {
  storage.setItem(MATCH_RESOLUTION_STORAGE_KEY, JSON.stringify(universe));
}

export function upsertMatchResolutionRecord(universe: MatchResolutionUniverse, record: MatchResolutionRecord): MatchResolutionUniverse {
  return {
    ...universe,
    records: universe.records.some((item) => item.showId === record.showId && item.segmentId === record.segmentId)
      ? universe.records.map((item) => item.showId === record.showId && item.segmentId === record.segmentId ? record : item)
      : [record, ...universe.records],
    settings: { ...universe.settings, selectedShowId: record.showId, selectedSegmentId: record.segmentId },
  };
}
