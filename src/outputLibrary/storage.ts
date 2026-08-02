import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import type { MatchAimId, MatchApproachId } from "../matchEngine/types";
import { emptyOutputLibraryUniverse } from "./model";
import type {
  OutputActualSnapshot,
  OutputApproachSnapshot,
  OutputComparisonStatus,
  OutputLibraryItem,
  OutputLibrarySettings,
  OutputLibraryUniverse,
  OutputLineageStage,
  OutputPackageField,
  OutputProductionPackage,
  OutputSegmentSnapshot,
  OutputVersion,
  PhraseSourceAttribution,
  PlannedActualRow,
  PlannedVsActualReport,
  ReusableOutputStructure,
  ShowProductionPacket,
} from "./types";

export const OUTPUT_LIBRARY_STORAGE_KEY = "tew-story-tracker:output-library:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchAim(value: unknown): MatchAimId {
  return MATCH_AIMS.some((aim) => aim.id === value) ? value as MatchAimId : "call-it-in-the-ring";
}

function approachIds(value: unknown): MatchApproachId[] {
  const valid = new Set(MATCH_APPROACHES.map((approach) => approach.id));
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is MatchApproachId => typeof item === "string" && valid.has(item as MatchApproachId))))
    : [];
}

function normalizeActual(value: unknown): OutputActualSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    linkedMatchId: stringValue(value.linkedMatchId),
    description: stringValue(value.description),
    winner: stringValue(value.winner),
    matchTime: stringValue(value.matchTime),
    rating: nullableNumber(value.rating),
    notes: stringValue(value.notes),
    happenedAsPlanned: nullableBoolean(value.happenedAsPlanned),
    finalNarrative: stringValue(value.finalNarrative),
    changes: stringValue(value.changes),
    actualConsequences: stringValue(value.actualConsequences),
    finalFollowUp: stringValue(value.finalFollowUp),
    reconciledAt: stringValue(value.reconciledAt),
  };
}

function normalizeApproachPlan(value: unknown): OutputApproachSnapshot | null {
  if (!isRecord(value) || !stringValue(value.workerKey)) return null;
  return {
    workerKey: stringValue(value.workerKey),
    workerName: stringValue(value.workerName),
    approachIds: approachIds(value.approachIds),
  };
}

function normalizeSnapshot(value: unknown): OutputSegmentSnapshot | null {
  if (!isRecord(value) || !stringValue(value.segmentId) || (value.type !== "match" && value.type !== "angle")) return null;
  const section = value.section === "Pre-Show" || value.section === "Post-Show" ? value.section : "Main Show";
  const workflowStatus = value.workflowStatus === "Entered in TEW" || value.workflowStatus === "Completed" || value.workflowStatus === "Reconciled" ? value.workflowStatus : "Planned";
  return {
    segmentId: stringValue(value.segmentId),
    type: value.type,
    section,
    title: stringValue(value.title, value.type === "match" ? "Untitled Match" : "Untitled Angle"),
    durationMinutes: Math.max(1, numberValue(value.durationMinutes, value.type === "match" ? 12 : 5)),
    notes: stringValue(value.notes),
    workers: Array.isArray(value.workers) ? value.workers.filter(isRecord).map((worker) => ({
      id: stringValue(worker.id),
      name: stringValue(worker.name),
      role: stringValue(worker.role),
      side: stringValue(worker.side),
      source: worker.source === "tew" ? "tew" as const : "manual" as const,
    })).filter((worker) => worker.name) : [],
    storylines: Array.isArray(value.storylines) ? value.storylines.filter(isRecord).map((storyline) => ({
      id: stringValue(storyline.id),
      name: stringValue(storyline.name),
      source: storyline.source === "tew" ? "tew" as const : "manual" as const,
    })).filter((storyline) => storyline.name) : [],
    purpose: stringValue(value.purpose),
    consequences: stringValue(value.consequences),
    followUp: stringValue(value.followUp),
    privateNotes: stringValue(value.privateNotes),
    matchType: stringValue(value.matchType),
    championship: stringValue(value.championship),
    championshipId: stringValue(value.championshipId),
    championshipStakes: stringValue(value.championshipStakes),
    plannedWinner: stringValue(value.plannedWinner),
    plannedFinish: stringValue(value.plannedFinish),
    matchStory: stringValue(value.matchStory),
    keyMoments: stringValue(value.keyMoments),
    interference: stringValue(value.interference),
    postMatch: stringValue(value.postMatch),
    matchAimId: matchAim(value.matchAimId),
    approaches: Array.isArray(value.approaches) ? value.approaches.map(normalizeApproachPlan).filter((item): item is OutputApproachSnapshot => item !== null) : [],
    advisoryMatchScore: nullableNumber(value.advisoryMatchScore),
    advisoryStarRating: nullableNumber(value.advisoryStarRating),
    advisorySummary: stringValue(value.advisorySummary),
    competitionId: stringValue(value.competitionId),
    competitionRoundLabel: stringValue(value.competitionRoundLabel),
    angleLocation: stringValue(value.angleLocation),
    angleContentType: stringValue(value.angleContentType),
    segmentOutput: stringValue(value.segmentOutput),
    audienceTakeaway: stringValue(value.audienceTakeaway),
    workflowStatus,
    actual: normalizeActual(value.actual),
  };
}

function normalizeAttribution(value: unknown): PhraseSourceAttribution | null {
  if (!isRecord(value) || !stringValue(value.id)) return null;
  const sources = ["Canonical approach phrase library", "Entered creative plan", "Generic structural fallback"];
  const rawApproach = stringValue(value.approachId);
  return {
    id: stringValue(value.id),
    label: stringValue(value.label),
    source: sources.includes(stringValue(value.source)) ? stringValue(value.source) as PhraseSourceAttribution["source"] : "Entered creative plan",
    approachId: rawApproach && MATCH_APPROACHES.some((approach) => approach.id === rawApproach) ? rawApproach as MatchApproachId : "",
    note: stringValue(value.note),
  };
}

function normalizeVersion(value: unknown): OutputVersion | null {
  if (!isRecord(value) || !stringValue(value.id)) return null;
  const snapshot = normalizeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const stages: OutputLineageStage[] = ["Plan", "Generated Draft", "Applied Output", "Entered in TEW Version", "Reconciled Actual Version"];
  return {
    id: stringValue(value.id),
    stage: stages.includes(value.stage as OutputLineageStage) ? value.stage as OutputLineageStage : "Applied Output",
    label: stringValue(value.label, "Saved output"),
    createdAt: stringValue(value.createdAt),
    snapshot,
    sourceAttribution: Array.isArray(value.sourceAttribution) ? value.sourceAttribution.map(normalizeAttribution).filter((item): item is PhraseSourceAttribution => item !== null) : [],
  };
}

function normalizeField(value: unknown): OutputPackageField | null {
  if (!isRecord(value) || !stringValue(value.label)) return null;
  return { label: stringValue(value.label), value: stringValue(value.value) };
}

function normalizePackage(value: unknown, type: "match" | "angle"): OutputProductionPackage {
  const kind = type === "match" ? "Road-Agent Match Package" : "Angle Production Package";
  if (!isRecord(value)) {
    return { id: "", kind, generatedAt: "", directTewFields: [], tewNotes: [], companionOnly: [], warnings: [], conciseText: "", fullText: "" };
  }
  return {
    id: stringValue(value.id),
    kind: value.kind === "Angle Production Package" || value.kind === "Road-Agent Match Package" ? value.kind : kind,
    generatedAt: stringValue(value.generatedAt),
    directTewFields: Array.isArray(value.directTewFields) ? value.directTewFields.map(normalizeField).filter((item): item is OutputPackageField => item !== null) : [],
    tewNotes: Array.isArray(value.tewNotes) ? value.tewNotes.map(normalizeField).filter((item): item is OutputPackageField => item !== null) : [],
    companionOnly: Array.isArray(value.companionOnly) ? value.companionOnly.map(normalizeField).filter((item): item is OutputPackageField => item !== null) : [],
    warnings: stringArray(value.warnings),
    conciseText: stringValue(value.conciseText),
    fullText: stringValue(value.fullText),
  };
}

function comparisonStatus(value: unknown): OutputComparisonStatus {
  return value === "Same" || value === "Added" || value === "Removed" || value === "Pending" ? value : "Changed";
}

function normalizePlannedActualRow(value: unknown): PlannedActualRow | null {
  if (!isRecord(value) || !stringValue(value.field)) return null;
  return {
    field: stringValue(value.field),
    plannedValue: stringValue(value.plannedValue),
    actualValue: stringValue(value.actualValue),
    status: comparisonStatus(value.status),
  };
}

function normalizeReport(value: unknown): PlannedVsActualReport {
  if (!isRecord(value)) return { generatedAt: "", ready: false, summary: "No reconciled TEW match result is linked yet.", rows: [] };
  return {
    generatedAt: stringValue(value.generatedAt),
    ready: value.ready === true,
    summary: stringValue(value.summary),
    rows: Array.isArray(value.rows) ? value.rows.map(normalizePlannedActualRow).filter((item): item is PlannedActualRow => item !== null) : [],
  };
}

function normalizeItem(value: unknown): OutputLibraryItem | null {
  if (!isRecord(value) || !stringValue(value.id) || (value.type !== "match" && value.type !== "angle")) return null;
  const versions = Array.isArray(value.versions) ? value.versions.map(normalizeVersion).filter((item): item is OutputVersion => item !== null) : [];
  if (versions.length === 0) return null;
  const currentVersionId = versions.some((version) => version.id === value.currentVersionId) ? stringValue(value.currentVersionId) : versions.at(-1)!.id;
  return {
    id: stringValue(value.id),
    sourceKind: value.sourceKind === "Planned Show" ? "Planned Show" : "Quick Segment",
    sourceQuickSegmentId: stringValue(value.sourceQuickSegmentId),
    sourceShowId: stringValue(value.sourceShowId),
    sourceShowName: stringValue(value.sourceShowName),
    sourceSegmentId: stringValue(value.sourceSegmentId),
    type: value.type,
    title: stringValue(value.title),
    participantNames: stringArray(value.participantNames),
    storylineNames: stringArray(value.storylineNames),
    championship: stringValue(value.championship),
    competitionRoundLabel: stringValue(value.competitionRoundLabel),
    matchAimId: matchAim(value.matchAimId),
    approachIds: approachIds(value.approachIds),
    versions,
    currentVersionId,
    productionPackage: normalizePackage(value.productionPackage, value.type),
    plannedVsActual: normalizeReport(value.plannedVsActual),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizeStructure(value: unknown): ReusableOutputStructure | null {
  if (!isRecord(value) || !stringValue(value.id) || (value.type !== "match" && value.type !== "angle")) return null;
  return {
    id: stringValue(value.id),
    name: stringValue(value.name, "Reusable Output Structure"),
    type: value.type,
    summary: stringValue(value.summary),
    durationMinutes: Math.max(1, numberValue(value.durationMinutes, value.type === "match" ? 12 : 5)),
    matchType: stringValue(value.matchType),
    matchAimId: matchAim(value.matchAimId),
    angleLocation: stringValue(value.angleLocation),
    angleContentType: stringValue(value.angleContentType),
    purpose: stringValue(value.purpose),
    notes: stringValue(value.notes),
    requiredSections: stringArray(value.requiredSections),
    sourceItemId: stringValue(value.sourceItemId),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  };
}

function normalizePacket(value: unknown): ShowProductionPacket | null {
  if (!isRecord(value) || !stringValue(value.id) || !stringValue(value.showId)) return null;
  return {
    id: stringValue(value.id),
    showId: stringValue(value.showId),
    showName: stringValue(value.showName),
    generatedAt: stringValue(value.generatedAt),
    segmentCount: Math.max(0, numberValue(value.segmentCount)),
    matchCount: Math.max(0, numberValue(value.matchCount)),
    angleCount: Math.max(0, numberValue(value.angleCount)),
    warnings: stringArray(value.warnings),
    segmentItemIds: stringArray(value.segmentItemIds),
    text: stringValue(value.text),
    json: stringValue(value.json),
  };
}

function normalizeSettings(value: unknown): OutputLibrarySettings {
  const defaults = emptyOutputLibraryUniverse().settings;
  if (!isRecord(value)) return defaults;
  return {
    activeTab: value.activeTab === "packets" || value.activeTab === "templates" ? value.activeTab : "library",
    searchQuery: stringValue(value.searchQuery),
    typeFilter: value.typeFilter === "match" || value.typeFilter === "angle" ? value.typeFilter : "All",
    sourceFilter: value.sourceFilter === "Quick Segment" || value.sourceFilter === "Planned Show" ? value.sourceFilter : "All",
    selectedItemId: stringValue(value.selectedItemId),
    selectedShowId: stringValue(value.selectedShowId),
    compareFromVersionId: stringValue(value.compareFromVersionId),
    compareToVersionId: stringValue(value.compareToVersionId),
  };
}

export function parseOutputLibraryUniverse(value: unknown): OutputLibraryUniverse {
  const defaults = emptyOutputLibraryUniverse();
  if (!isRecord(value)) return defaults;
  const items = Array.isArray(value.items) ? value.items.map(normalizeItem).filter((item): item is OutputLibraryItem => item !== null) : [];
  const settings = normalizeSettings(value.settings);
  return {
    items,
    structures: Array.isArray(value.structures) ? value.structures.map(normalizeStructure).filter((item): item is ReusableOutputStructure => item !== null) : [],
    showPackets: Array.isArray(value.showPackets) ? value.showPackets.map(normalizePacket).filter((item): item is ShowProductionPacket => item !== null) : [],
    settings: {
      ...settings,
      selectedItemId: items.some((item) => item.id === settings.selectedItemId) ? settings.selectedItemId : items[0]?.id ?? "",
    },
  };
}

export function loadOutputLibraryUniverse(storage: Pick<Storage, "getItem">): OutputLibraryUniverse {
  const stored = storage.getItem(OUTPUT_LIBRARY_STORAGE_KEY);
  if (!stored) return emptyOutputLibraryUniverse();
  try { return parseOutputLibraryUniverse(JSON.parse(stored) as unknown); } catch { return emptyOutputLibraryUniverse(); }
}

export function saveOutputLibraryUniverse(storage: Pick<Storage, "setItem">, universe: OutputLibraryUniverse): void {
  storage.setItem(OUTPUT_LIBRARY_STORAGE_KEY, JSON.stringify(universe));
}
