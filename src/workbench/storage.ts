import { normalizeMatchApproachSetup } from "../matchEngine/storage";
import type { WrestlerSkill } from "../matchEngine/types";
import { MATCH_ENGINE_SKILLS } from "../matchEngine/profileCatalog";
import { createEmptySegmentReconciliation, createPlannedSegment } from "../planner/model";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";
import { BUILT_IN_WORKBENCH_TEMPLATES, emptyWorkbenchUniverse } from "./model";
import type {
  QuickSegmentRecord,
  RatingFieldSource,
  WorkbenchDraftRevision,
  WorkbenchSettings,
  WorkbenchTemplate,
  WorkbenchUniverse,
  WorkerRatingSourceRecord,
} from "./types";

export const WORKBENCH_STORAGE_KEY = "tew-story-tracker:workbench:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeWorker(value: unknown): PlannedWorkerReference | null {
  if (!isRecord(value) || !text(value.name).trim()) return null;
  return {
    id: text(value.id, `manual-${text(value.name)}`),
    name: text(value.name),
    role: text(value.role),
    side: text(value.side),
    source: value.source === "tew" ? "tew" : "manual",
  };
}

function normalizeSegment(value: unknown, type: "match" | "angle"): PlannedSegment {
  const defaults = createPlannedSegment(type);
  if (!isRecord(value)) return defaults;
  return {
    ...defaults,
    ...value,
    id: text(value.id, defaults.id),
    type,
    section: value.section === "Pre-Show" || value.section === "Post-Show" ? value.section : "Main Show",
    title: text(value.title, defaults.title),
    durationMinutes: Math.max(1, numberValue(value.durationMinutes, defaults.durationMinutes)),
    workers: Array.isArray(value.workers) ? value.workers.map(normalizeWorker).filter((worker): worker is PlannedWorkerReference => worker !== null) : [],
    storylines: Array.isArray(value.storylines) ? value.storylines.filter(isRecord).map((storyline) => ({ id: text(storyline.id), name: text(storyline.name), source: storyline.source === "tew" ? "tew" as const : "manual" as const })).filter((storyline) => storyline.name) : [],
    matchApproachSetup: normalizeMatchApproachSetup(value.matchApproachSetup),
    workflowStatus: value.workflowStatus === "Entered in TEW" || value.workflowStatus === "Completed" || value.workflowStatus === "Reconciled" ? value.workflowStatus : "Planned",
    reconciliation: isRecord(value.reconciliation) ? value.reconciliation as unknown as PlannedSegment["reconciliation"] : createEmptySegmentReconciliation(),
  } as PlannedSegment;
}

function normalizeRevision(value: unknown): WorkbenchDraftRevision | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: text(value.id),
    createdAt: text(value.createdAt),
    label: text(value.label, "Saved draft"),
    tone: value.tone === "dramatic" || value.tone === "road-agent" ? value.tone : "sports",
    detail: value.detail === "concise" || value.detail === "detailed" ? value.detail : "standard",
    fullOutput: text(value.fullOutput),
    keyMoments: text(value.keyMoments),
    tewNotes: text(value.tewNotes),
  };
}

function normalizeQuick(value: unknown): QuickSegmentRecord | null {
  if (!isRecord(value) || !text(value.id) || (value.type !== "match" && value.type !== "angle")) return null;
  return {
    id: text(value.id),
    type: value.type,
    segment: normalizeSegment(value.segment, value.type),
    templateId: text(value.templateId),
    draftHistory: Array.isArray(value.draftHistory) ? value.draftHistory.map(normalizeRevision).filter((item): item is WorkbenchDraftRevision => item !== null) : [],
    attachedShowIds: Array.isArray(value.attachedShowIds) ? value.attachedShowIds.filter((id): id is string => typeof id === "string") : [],
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
    lastOpenedAt: text(value.lastOpenedAt),
  };
}

function normalizeTemplate(value: unknown): WorkbenchTemplate | null {
  if (!isRecord(value) || !text(value.id) || !text(value.name) || (value.type !== "match" && value.type !== "angle")) return null;
  return {
    id: text(value.id),
    name: text(value.name),
    type: value.type,
    summary: text(value.summary),
    builtIn: value.builtIn === true,
    durationMinutes: Math.max(1, numberValue(value.durationMinutes, value.type === "match" ? 12 : 5)),
    matchType: text(value.matchType),
    matchAimId: text(value.matchAimId, "call-it-in-the-ring") as WorkbenchTemplate["matchAimId"],
    angleLocation: text(value.angleLocation),
    angleContentType: text(value.angleContentType),
    purpose: text(value.purpose),
    notes: text(value.notes),
  };
}

function normalizeSource(value: unknown, field: string): RatingFieldSource {
  if (!isRecord(value)) return { field, source: "Missing", importedValue: null, overrideValue: null, note: "No rating source has been recorded." };
  const validSources = ["Imported from workbook", "Imported from TEW", "Mapped from TEW", "Derived", "Manual Override", "Baseline placeholder", "Missing"];
  return {
    field: text(value.field, field),
    source: validSources.includes(text(value.source)) ? text(value.source) as RatingFieldSource["source"] : "Missing",
    importedValue: typeof value.importedValue === "number" ? value.importedValue : null,
    overrideValue: typeof value.overrideValue === "number" ? value.overrideValue : null,
    note: text(value.note),
  };
}

function normalizeRatingRecord(value: unknown): WorkerRatingSourceRecord | null {
  if (!isRecord(value) || !text(value.workerKey) || !text(value.workerName)) return null;
  const skillValues = isRecord(value.skills) ? value.skills : {};
  return {
    workerKey: text(value.workerKey),
    workerId: text(value.workerId),
    workerName: text(value.workerName),
    snapshotFile: text(value.snapshotFile),
    identitySource: value.identitySource === "Manual tracker worker" ? "Manual tracker worker" : "TEW snapshot",
    overall: normalizeSource(value.overall, "Overall"),
    health: normalizeSource(value.health, "Health"),
    popularity: normalizeSource(value.popularity, "Popularity"),
    experience: normalizeSource(value.experience, "Experience"),
    skills: Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, normalizeSource(skillValues[skill], skill)])) as Record<WrestlerSkill, RatingFieldSource>,
    updatedAt: text(value.updatedAt),
  };
}

function normalizeSettings(value: unknown): WorkbenchSettings {
  const defaults = emptyWorkbenchUniverse().settings;
  if (!isRecord(value)) return defaults;
  return {
    advancedToolsVisible: value.advancedToolsVisible === true,
    defaultMode: value.defaultMode === "quick-angle" || value.defaultMode === "planned-show" ? value.defaultMode : "quick-match",
    lastQuickSegmentId: text(value.lastQuickSegmentId),
    lastPlannedShowId: text(value.lastPlannedShowId),
    lastPlannedSegmentId: text(value.lastPlannedSegmentId),
    compactApproachView: value.compactApproachView !== false,
  };
}

export function parseWorkbenchUniverse(value: unknown): WorkbenchUniverse {
  const defaults = emptyWorkbenchUniverse();
  if (!isRecord(value)) return defaults;
  const customTemplates = Array.isArray(value.templates)
    ? value.templates.map(normalizeTemplate).filter((item): item is WorkbenchTemplate => item !== null && !item.builtIn)
    : [];
  return {
    quickSegments: Array.isArray(value.quickSegments) ? value.quickSegments.map(normalizeQuick).filter((item): item is QuickSegmentRecord => item !== null) : [],
    templates: [...BUILT_IN_WORKBENCH_TEMPLATES.map((template) => ({ ...template })), ...customTemplates],
    ratingSources: Array.isArray(value.ratingSources) ? value.ratingSources.map(normalizeRatingRecord).filter((item): item is WorkerRatingSourceRecord => item !== null) : [],
    recentSegmentIds: Array.isArray(value.recentSegmentIds) ? value.recentSegmentIds.filter((id): id is string => typeof id === "string").slice(0, 12) : [],
    settings: normalizeSettings(value.settings),
  };
}

export function loadWorkbenchUniverse(storage: Pick<Storage, "getItem">): WorkbenchUniverse {
  const stored = storage.getItem(WORKBENCH_STORAGE_KEY);
  if (!stored) return emptyWorkbenchUniverse();
  try { return parseWorkbenchUniverse(JSON.parse(stored) as unknown); } catch { return emptyWorkbenchUniverse(); }
}

export function saveWorkbenchUniverse(storage: Pick<Storage, "setItem">, universe: WorkbenchUniverse): void {
  storage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(universe));
}

export function updateWorkbenchSettings(storage: Pick<Storage, "getItem" | "setItem">, patch: Partial<WorkbenchSettings>): WorkbenchUniverse {
  const universe = loadWorkbenchUniverse(storage);
  const updated = { ...universe, settings: { ...universe.settings, ...patch } };
  saveWorkbenchUniverse(storage, updated);
  return updated;
}
