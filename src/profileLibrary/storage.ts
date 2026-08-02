import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "../matchEngine/profileCatalog";
import { parseMatchEngineUniverse } from "../matchEngine/storage";
import type { ProfileFieldKey, ProfileFieldProvenance, ProfileIdentityLink, ProfileImportMappingPreset, ProfileImportRow, ProfileImportSession, ProfileLibraryRecord, ProfileLibraryUniverse, ProfileReadiness, ProfileValueSource } from "./types";
import { emptyProfileLibraryUniverse } from "./model";

export const PROFILE_LIBRARY_STORAGE_KEY = "tew-story-tracker:profile-library:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const sources: ProfileValueSource[] = ["Imported from workbook", "Imported from TEW", "Mapped from TEW", "Derived", "Manual override", "Missing", "Baseline placeholder"];
const readinessValues: ProfileReadiness[] = ["Ready", "Usable with warnings", "Incomplete"];
const profileFields = new Set<ProfileFieldKey>(["name", "tewWorkerId", "styleId", "overall", "health", "popularity", "experience", "fanReaction", "gimmick", ...MATCH_ENGINE_SKILLS]);

function normalizeProvenance(value: unknown): ProfileFieldProvenance | null {
  if (!isRecord(value) || !profileFields.has(value.field as ProfileFieldKey)) return null;
  const source = sources.includes(value.source as ProfileValueSource) ? value.source as ProfileValueSource : "Missing";
  const importedValue = typeof value.importedValue === "number" || typeof value.importedValue === "string" ? value.importedValue : null;
  const manualOverrideValue = typeof value.manualOverrideValue === "number" || typeof value.manualOverrideValue === "string" ? value.manualOverrideValue : null;
  return {
    field: value.field as ProfileFieldKey,
    source,
    sourceFile: text(value.sourceFile),
    sourceSheet: text(value.sourceSheet),
    importSessionId: text(value.importSessionId),
    importedValue,
    manualOverrideValue,
    note: text(value.note),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeIdentity(value: unknown): ProfileIdentityLink {
  if (!isRecord(value)) return { status: "Manual", tewWorkerId: "", tewWorkerName: "", candidateWorkerIds: [], method: "None", confirmedAt: "" };
  const statuses: ProfileIdentityLink["status"][] = ["Confirmed", "Suggested", "Ambiguous", "Manual", "Missing TEW worker"];
  const methods: ProfileIdentityLink["method"][] = ["Exact worker ID", "Exact normalized name", "Alternate name", "Manual confirmation", "None"];
  return {
    status: statuses.includes(value.status as ProfileIdentityLink["status"]) ? value.status as ProfileIdentityLink["status"] : "Manual",
    tewWorkerId: text(value.tewWorkerId),
    tewWorkerName: text(value.tewWorkerName),
    candidateWorkerIds: Array.isArray(value.candidateWorkerIds) ? value.candidateWorkerIds.filter((item): item is string => typeof item === "string") : [],
    method: methods.includes(value.method as ProfileIdentityLink["method"]) ? value.method as ProfileIdentityLink["method"] : "None",
    confirmedAt: text(value.confirmedAt),
  };
}

function normalizeRecord(value: unknown): ProfileLibraryRecord | null {
  if (!isRecord(value) || typeof value.workerKey !== "string" || typeof value.workerName !== "string") return null;
  const provenanceEntries = isRecord(value.provenance)
    ? Object.entries(value.provenance).flatMap(([key, item]) => {
        const normalized = normalizeProvenance(item);
        return normalized && profileFields.has(key as ProfileFieldKey) ? [[key, normalized] as const] : [];
      })
    : [];
  return {
    workerKey: value.workerKey,
    workerId: text(value.workerId),
    workerName: value.workerName,
    profileId: text(value.profileId),
    identity: normalizeIdentity(value.identity),
    provenance: Object.fromEntries(provenanceEntries),
    readiness: readinessValues.includes(value.readiness as ProfileReadiness) ? value.readiness as ProfileReadiness : "Incomplete",
    completenessPercent: Math.max(0, Math.min(100, finite(value.completenessPercent, 0))),
    missingRequiredFields: Array.isArray(value.missingRequiredFields) ? value.missingRequiredFields.filter((field): field is ProfileFieldKey => typeof field === "string" && profileFields.has(field as ProfileFieldKey)) : [],
    warningFields: Array.isArray(value.warningFields) ? value.warningFields.filter((field): field is ProfileFieldKey => typeof field === "string" && profileFields.has(field as ProfileFieldKey)) : [],
    lastImportSessionId: text(value.lastImportSessionId),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizePreset(value: unknown): ProfileImportMappingPreset | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const fileTypes: ProfileImportMappingPreset["fileType"][] = ["csv", "xlsx", "xlsm", "json"];
  const columnMap: ProfileImportMappingPreset["columnMap"] = {};
  if (isRecord(value.columnMap)) {
    for (const [key, header] of Object.entries(value.columnMap)) if (profileFields.has(key as ProfileFieldKey) && typeof header === "string") columnMap[key as ProfileFieldKey] = header;
  }
  return {
    id: value.id,
    name: value.name,
    fileType: fileTypes.includes(value.fileType as ProfileImportMappingPreset["fileType"]) ? value.fileType as ProfileImportMappingPreset["fileType"] : "csv",
    sheetName: text(value.sheetName),
    headerRow: Math.max(1, Math.round(finite(value.headerRow, 1))),
    columnMap,
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeRow(value: unknown): ProfileImportRow | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const statuses: ProfileImportRow["status"][] = ["Ready", "Conflict", "Error", "Skipped", "Accepted"];
  const decisions: ProfileImportRow["decision"][] = ["Keep existing profile", "Replace imported fields", "Merge missing fields", "Preserve manual overrides", "Create separate profile", "Skip row"];
  const values: ProfileImportRow["values"] = {};
  if (isRecord(value.values)) for (const [key, item] of Object.entries(value.values)) if (profileFields.has(key as ProfileFieldKey) && (typeof item === "string" || typeof item === "number")) values[key as ProfileFieldKey] = item;
  return {
    id: value.id,
    rowNumber: Math.max(1, Math.round(finite(value.rowNumber, 1))),
    sourceName: text(value.sourceName),
    sourceTewWorkerId: text(value.sourceTewWorkerId),
    values,
    status: statuses.includes(value.status as ProfileImportRow["status"]) ? value.status as ProfileImportRow["status"] : "Skipped",
    messages: Array.isArray(value.messages) ? value.messages.filter((item): item is string => typeof item === "string") : [],
    matchedProfileKey: text(value.matchedProfileKey),
    matchedTewWorkerId: text(value.matchedTewWorkerId),
    suggestedTewWorkerIds: Array.isArray(value.suggestedTewWorkerIds) ? value.suggestedTewWorkerIds.filter((item): item is string => typeof item === "string") : [],
    decision: decisions.includes(value.decision as ProfileImportRow["decision"]) ? value.decision as ProfileImportRow["decision"] : "Skip row",
  };
}

function normalizeSession(value: unknown): ProfileImportSession | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const fileTypes: ProfileImportSession["fileType"][] = ["csv", "xlsx", "xlsm", "json"];
  const rows = Array.isArray(value.rows) ? value.rows.map(normalizeRow).filter((item): item is ProfileImportRow => item !== null) : [];
  const beforeProfiles = parseMatchEngineUniverse({ profiles: Array.isArray(value.beforeProfiles) ? value.beforeProfiles : [] }).profiles;
  const beforeRecords = Array.isArray(value.beforeRecords) ? value.beforeRecords.map(normalizeRecord).filter((item): item is ProfileLibraryRecord => item !== null) : [];
  return {
    id: value.id,
    fileName: text(value.fileName),
    fileType: fileTypes.includes(value.fileType as ProfileImportSession["fileType"]) ? value.fileType as ProfileImportSession["fileType"] : "csv",
    sheetName: text(value.sheetName),
    headerRow: Math.max(1, Math.round(finite(value.headerRow, 1))),
    mappingPresetId: text(value.mappingPresetId),
    startedAt: text(value.startedAt),
    completedAt: text(value.completedAt),
    rowsAccepted: Math.max(0, Math.round(finite(value.rowsAccepted, 0))),
    rowsSkipped: Math.max(0, Math.round(finite(value.rowsSkipped, 0))),
    profilesCreated: Math.max(0, Math.round(finite(value.profilesCreated, 0))),
    profilesUpdated: Math.max(0, Math.round(finite(value.profilesUpdated, 0))),
    conflictsResolved: Math.max(0, Math.round(finite(value.conflictsResolved, 0))),
    rows,
    beforeProfiles,
    beforeRecords,
    rolledBackAt: text(value.rolledBackAt),
  };
}

export function parseProfileLibraryUniverse(value: unknown): ProfileLibraryUniverse {
  const fallback = emptyProfileLibraryUniverse();
  if (!isRecord(value)) return fallback;
  const records = Array.isArray(value.records) ? value.records.map(normalizeRecord).filter((item): item is ProfileLibraryRecord => item !== null) : [];
  const mappingPresets = Array.isArray(value.mappingPresets) ? value.mappingPresets.map(normalizePreset).filter((item): item is ProfileImportMappingPreset => item !== null) : [];
  const importSessions = Array.isArray(value.importSessions) ? value.importSessions.map(normalizeSession).filter((item): item is ProfileImportSession => item !== null) : [];
  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const readinessFilter = rawSettings.readinessFilter === "Ready" || rawSettings.readinessFilter === "Usable with warnings" || rawSettings.readinessFilter === "Incomplete" ? rawSettings.readinessFilter : "All";
  const linkStatuses = ["All", "Confirmed", "Suggested", "Ambiguous", "Manual", "Missing TEW worker"];
  const sourceFilter = rawSettings.sourceFilter === "All" || sources.includes(rawSettings.sourceFilter as ProfileValueSource) ? rawSettings.sourceFilter as ProfileLibraryUniverse["settings"]["sourceFilter"] : "All";
  return {
    records,
    mappingPresets,
    importSessions,
    settings: {
      searchQuery: text(rawSettings.searchQuery),
      readinessFilter,
      linkFilter: linkStatuses.includes(String(rawSettings.linkFilter)) ? rawSettings.linkFilter as ProfileLibraryUniverse["settings"]["linkFilter"] : "All",
      sourceFilter,
      selectedProfileKey: text(rawSettings.selectedProfileKey),
    },
  };
}

export function loadProfileLibraryUniverse(storage: Pick<Storage, "getItem">): ProfileLibraryUniverse {
  const stored = storage.getItem(PROFILE_LIBRARY_STORAGE_KEY);
  if (!stored) return emptyProfileLibraryUniverse();
  try { return parseProfileLibraryUniverse(JSON.parse(stored) as unknown); } catch { return emptyProfileLibraryUniverse(); }
}

export function saveProfileLibraryUniverse(storage: Pick<Storage, "setItem">, universe: ProfileLibraryUniverse): void {
  storage.setItem(PROFILE_LIBRARY_STORAGE_KEY, JSON.stringify(universe));
}
