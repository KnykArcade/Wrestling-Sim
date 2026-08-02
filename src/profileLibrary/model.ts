import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "../matchEngine/profileCatalog";
import { createMatchEngineProfile, normalizeApproachName, workerProfileKey } from "../matchEngine/model";
import type { MatchEngineProfile, MatchEngineUniverse, WrestlerSkill, WrestlerStyleId } from "../matchEngine/types";
import type { TewSnapshot } from "../tew/types";
import type {
  ImportedProfileValues,
  ImportConflictDecision,
  ProfileFieldKey,
  ProfileFieldProvenance,
  ProfileIdentityLink,
  ProfileImportApplyResult,
  ProfileImportMappingPreset,
  ProfileImportRow,
  ProfileImportSession,
  ProfileLibraryRecord,
  ProfileLibraryUniverse,
  ProfileReadiness,
  ProfileValueSource,
  WorkbookData,
} from "./types";

export const PROFILE_CORE_FIELDS: ProfileFieldKey[] = [
  "overall",
  "health",
  "popularity",
  "experience",
  "fanReaction",
  "gimmick",
];

export const PROFILE_IMPORT_FIELDS: ProfileFieldKey[] = [
  "name",
  "tewWorkerId",
  "styleId",
  ...PROFILE_CORE_FIELDS,
  ...MATCH_ENGINE_SKILLS,
];

const REQUIRED_FIELDS: ProfileFieldKey[] = ["overall", "health", "popularity", "experience", ...MATCH_ENGINE_SKILLS];
const WARNING_FIELDS: ProfileFieldKey[] = ["styleId", "fanReaction", "gimmick"];
const PLACEHOLDER_SOURCES: ProfileValueSource[] = ["Missing", "Baseline placeholder"];

const DEFAULT_VALUES: Partial<Record<ProfileFieldKey, number | string>> = {
  styleId: "all-rounder",
  overall: 60,
  health: 100,
  popularity: 50,
  experience: 50,
  fanReaction: 3,
  gimmick: 3,
  ...Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, 60])),
};

const HEADER_ALIASES: Partial<Record<ProfileFieldKey, string[]>> = {
  name: ["name", "wrestler", "worker", "worker name", "wrestler name", "display name"],
  tewWorkerId: ["tew id", "tew worker id", "worker id", "uid", "worker uid"],
  styleId: ["style", "wrestler style", "style id", "archetype"],
  overall: ["overall", "overall rating", "ovr"],
  health: ["health", "condition"],
  popularity: ["popularity", "pop", "overness"],
  experience: ["experience", "exp"],
  fanReaction: ["fan reaction", "fanreaction", "reaction"],
  gimmick: ["gimmick", "gimmick rating"],
  Aerial: ["aerial", "aerial skill"],
  Athleticism: ["athleticism", "athletic"],
  Basics: ["basics", "fundamentals"],
  Brawling: ["brawling", "brawl"],
  Charisma: ["charisma"],
  Consistency: ["consistency"],
  Flashiness: ["flashiness", "flashy"],
  Hardcore: ["hardcore"],
  Menace: ["menace"],
  Power: ["power", "strength"],
  Psychology: ["psychology", "ring psychology"],
  Puroresu: ["puroresu", "puro"],
  Resilience: ["resilience"],
  Safety: ["safety"],
  Selling: ["selling"],
  Stamina: ["stamina"],
  Technical: ["technical", "technique"],
  Toughness: ["toughness"],
};

function now(): string {
  return new Date().toISOString();
}

function profileLibraryId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeWorkerName(value: string): string {
  return normalizeApproachName(value);
}

function sourceForExistingValue(field: ProfileFieldKey, value: string | number): ProfileValueSource {
  return DEFAULT_VALUES[field] === value ? "Baseline placeholder" : "Manual override";
}

function provenance(
  field: ProfileFieldKey,
  source: ProfileValueSource,
  value: string | number | null,
  options: Partial<ProfileFieldProvenance> = {},
): ProfileFieldProvenance {
  return {
    field,
    source,
    sourceFile: options.sourceFile ?? "",
    sourceSheet: options.sourceSheet ?? "",
    importSessionId: options.importSessionId ?? "",
    importedValue: source === "Manual override" ? null : value,
    manualOverrideValue: source === "Manual override" ? value : null,
    note: options.note ?? "",
    updatedAt: options.updatedAt ?? now(),
  };
}

function fieldValue(profile: MatchEngineProfile, field: ProfileFieldKey): string | number | null {
  if (MATCH_ENGINE_SKILLS.includes(field as WrestlerSkill)) return profile.skills[field as WrestlerSkill];
  if (field === "name") return profile.workerName;
  if (field === "tewWorkerId") return profile.workerSource === "tew" ? profile.workerId : "";
  if (field === "styleId") return profile.styleId;
  if (field === "overall" || field === "health" || field === "popularity" || field === "experience" || field === "fanReaction" || field === "gimmick") return profile[field];
  return null;
}

function identityForProfile(profile: MatchEngineProfile, snapshot: TewSnapshot | null): ProfileIdentityLink {
  if (profile.workerSource === "tew") {
    const exact = snapshot?.workers.find((worker) => worker.id === profile.workerId);
    return {
      status: exact ? "Confirmed" : snapshot ? "Missing TEW worker" : "Confirmed",
      tewWorkerId: profile.workerId,
      tewWorkerName: exact?.name ?? profile.workerName,
      candidateWorkerIds: [],
      method: "Exact worker ID",
      confirmedAt: exact || !snapshot ? profile.updatedAt : "",
    };
  }
  if (!snapshot) return { status: "Manual", tewWorkerId: "", tewWorkerName: "", candidateWorkerIds: [], method: "None", confirmedAt: "" };
  const matches = snapshot.workers.filter((worker) => normalizeWorkerName(worker.name) === normalizeWorkerName(profile.workerName));
  if (matches.length === 1) return { status: "Suggested", tewWorkerId: matches[0].id, tewWorkerName: matches[0].name, candidateWorkerIds: [matches[0].id], method: "Exact normalized name", confirmedAt: "" };
  if (matches.length > 1) return { status: "Ambiguous", tewWorkerId: "", tewWorkerName: "", candidateWorkerIds: matches.map((worker) => worker.id), method: "Exact normalized name", confirmedAt: "" };
  return { status: "Manual", tewWorkerId: "", tewWorkerName: "", candidateWorkerIds: [], method: "None", confirmedAt: "" };
}

export function emptyProfileLibraryUniverse(): ProfileLibraryUniverse {
  return {
    records: [],
    mappingPresets: [],
    importSessions: [],
    settings: {
      searchQuery: "",
      readinessFilter: "All",
      linkFilter: "All",
      sourceFilter: "All",
      selectedProfileKey: "",
    },
  };
}

export function calculateProfileReadiness(profile: MatchEngineProfile, record: Pick<ProfileLibraryRecord, "provenance">): {
  readiness: ProfileReadiness;
  completenessPercent: number;
  missingRequiredFields: ProfileFieldKey[];
  warningFields: ProfileFieldKey[];
} {
  const missingRequiredFields = REQUIRED_FIELDS.filter((field) => {
    const item = record.provenance[field];
    return !item || PLACEHOLDER_SOURCES.includes(item.source);
  });
  const warningFields = WARNING_FIELDS.filter((field) => {
    const item = record.provenance[field];
    return !item || PLACEHOLDER_SOURCES.includes(item.source);
  });
  const completeRequired = REQUIRED_FIELDS.length - missingRequiredFields.length;
  const completenessPercent = Math.round((completeRequired / REQUIRED_FIELDS.length) * 100);
  const readiness: ProfileReadiness = missingRequiredFields.length === 0 && warningFields.length === 0
    ? "Ready"
    : missingRequiredFields.length <= 4 && completenessPercent >= 80
      ? "Usable with warnings"
      : "Incomplete";
  return { readiness, completenessPercent, missingRequiredFields, warningFields };
}

export function createProfileLibraryRecord(profile: MatchEngineProfile, snapshot: TewSnapshot | null = null, existing?: ProfileLibraryRecord): ProfileLibraryRecord {
  const timestamp = now();
  const nextProvenance: Partial<Record<ProfileFieldKey, ProfileFieldProvenance>> = { ...(existing?.provenance ?? {}) };
  for (const field of ["name", "tewWorkerId", "styleId", ...PROFILE_CORE_FIELDS, ...MATCH_ENGINE_SKILLS] as ProfileFieldKey[]) {
    if (nextProvenance[field]) continue;
    const value = fieldValue(profile, field);
    const source: ProfileValueSource = field === "name" || field === "tewWorkerId"
      ? profile.workerSource === "tew" ? "Imported from TEW" : "Manual override"
      : sourceForExistingValue(field, value ?? "");
    nextProvenance[field] = provenance(field, source, value, {
      note: source === "Baseline placeholder"
        ? "Default tracker baseline. Replace or import this value before treating the profile as complete."
        : source === "Imported from TEW"
          ? "Worker identity came from the loaded read-only TEW snapshot."
          : "Existing tracker-side value treated as a manual override.",
      updatedAt: profile.updatedAt || timestamp,
    });
  }
  const readiness = calculateProfileReadiness(profile, { provenance: nextProvenance });
  return {
    workerKey: profile.workerKey,
    workerId: profile.workerId,
    workerName: profile.workerName,
    profileId: profile.id,
    identity: existing?.identity ?? identityForProfile(profile, snapshot),
    provenance: nextProvenance,
    ...readiness,
    lastImportSessionId: existing?.lastImportSessionId ?? "",
    createdAt: existing?.createdAt ?? profile.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function synchronizeProfileLibrary(
  matchEngine: MatchEngineUniverse,
  library: ProfileLibraryUniverse,
  snapshot: TewSnapshot | null,
): ProfileLibraryUniverse {
  const byKey = new Map(library.records.map((record) => [record.workerKey, record]));
  const records = matchEngine.profiles.map((profile) => createProfileLibraryRecord(profile, snapshot, byKey.get(profile.workerKey)));
  return {
    ...library,
    records,
    settings: {
      ...library.settings,
      selectedProfileKey: records.some((record) => record.workerKey === library.settings.selectedProfileKey)
        ? library.settings.selectedProfileKey
        : records[0]?.workerKey ?? "",
    },
  };
}

export function autoMapHeaders(headers: string[]): Partial<Record<ProfileFieldKey, string>> {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  const result: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of PROFILE_IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field] ?? [normalizeHeader(field)];
    const match = normalized.find((item) => aliases.includes(item.normalized));
    if (match) result[field] = match.header;
  }
  return result;
}

export function createMappingPreset(input: {
  name: string;
  workbook: WorkbookData;
  sheetName: string;
  headerRow: number;
  columnMap: Partial<Record<ProfileFieldKey, string>>;
}): ProfileImportMappingPreset {
  const timestamp = now();
  return {
    id: profileLibraryId("profile-mapping"),
    name: input.name.trim() || `${input.workbook.fileName} mapping`,
    fileType: input.workbook.fileType,
    sheetName: input.sheetName,
    headerRow: input.headerRow,
    columnMap: { ...input.columnMap },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function parseRating(value: string | number | undefined, minimum = 0, maximum = 100): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/%$/, ""));
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) return null;
  return numeric;
}

function resolveStyle(value: string | number | undefined): WrestlerStyleId {
  const normalized = normalizeHeader(String(value ?? ""));
  return WRESTLER_STYLES.find((style) => normalizeHeader(style.id) === normalized || normalizeHeader(style.name) === normalized)?.id ?? "all-rounder";
}

export function importedValuesFromRow(row: ProfileImportRow): ImportedProfileValues {
  const skills = Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [skill, parseRating(row.values[skill])])) as Record<WrestlerSkill, number | null>;
  return {
    workerName: String(row.values.name ?? row.sourceName ?? "").trim(),
    tewWorkerId: String(row.values.tewWorkerId ?? row.sourceTewWorkerId ?? "").trim(),
    styleId: resolveStyle(row.values.styleId),
    overall: parseRating(row.values.overall),
    health: parseRating(row.values.health),
    popularity: parseRating(row.values.popularity),
    experience: parseRating(row.values.experience),
    fanReaction: parseRating(row.values.fanReaction, 1, 5),
    gimmick: parseRating(row.values.gimmick, 1, 5),
    skills: Object.fromEntries(MATCH_ENGINE_SKILLS.flatMap((skill) => skills[skill] === null ? [] : [[skill, skills[skill] as number]])) as Partial<Record<WrestlerSkill, number>>,
  };
}

function indexForHeader(headers: string[], header: string | undefined): number {
  if (!header) return -1;
  return headers.findIndex((value) => value === header);
}

export function buildImportRows(input: {
  workbook: WorkbookData;
  sheetName: string;
  headerRow: number;
  columnMap: Partial<Record<ProfileFieldKey, string>>;
  profiles: MatchEngineProfile[];
  snapshot: TewSnapshot | null;
}): ProfileImportRow[] {
  const sheet = input.workbook.sheets.find((item) => item.name === input.sheetName) ?? input.workbook.sheets[0];
  if (!sheet) return [];
  const headerIndex = Math.max(0, input.headerRow - 1);
  const headers = sheet.rows[headerIndex] ?? [];
  const seenNames = new Map<string, number>();
  const seenIds = new Map<string, number>();
  return sheet.rows.slice(headerIndex + 1).map((cells, offset) => {
    const values: Partial<Record<ProfileFieldKey, string | number>> = {};
    for (const field of PROFILE_IMPORT_FIELDS) {
      const index = indexForHeader(headers, input.columnMap[field]);
      if (index >= 0 && cells[index] !== undefined) values[field] = cells[index];
    }
    const sourceName = String(values.name ?? "").trim();
    const sourceTewWorkerId = String(values.tewWorkerId ?? "").trim();
    const normalizedName = normalizeWorkerName(sourceName);
    const messages: string[] = [];
    if (!sourceName) messages.push("Wrestler name is required.");
    if (normalizedName) seenNames.set(normalizedName, (seenNames.get(normalizedName) ?? 0) + 1);
    if (sourceTewWorkerId) seenIds.set(sourceTewWorkerId, (seenIds.get(sourceTewWorkerId) ?? 0) + 1);
    const exactIdProfile = sourceTewWorkerId ? input.profiles.find((profile) => profile.workerSource === "tew" && profile.workerId === sourceTewWorkerId) : undefined;
    const exactNameProfiles = input.profiles.filter((profile) => normalizeWorkerName(profile.workerName) === normalizedName);
    const tewIdWorker = sourceTewWorkerId ? input.snapshot?.workers.find((worker) => worker.id === sourceTewWorkerId) : undefined;
    const tewNameMatches = sourceName ? input.snapshot?.workers.filter((worker) => normalizeWorkerName(worker.name) === normalizedName) ?? [] : [];
    const matchedProfile = exactIdProfile ?? (exactNameProfiles.length === 1 ? exactNameProfiles[0] : undefined);
    const suggestedTewWorkerIds = tewIdWorker ? [tewIdWorker.id] : tewNameMatches.map((worker) => worker.id);
    if (sourceTewWorkerId && input.snapshot && !tewIdWorker) messages.push("The supplied TEW worker ID was not found in the loaded snapshot.");
    if (!sourceTewWorkerId && tewNameMatches.length > 1) messages.push("Multiple TEW workers share this normalized name.");
    if (exactNameProfiles.length > 1 && !exactIdProfile) messages.push("Multiple existing profiles share this normalized name.");
    const imported = importedValuesFromRow({
      id: "preview",
      rowNumber: headerIndex + offset + 2,
      sourceName,
      sourceTewWorkerId,
      values,
      status: "Ready",
      messages: [],
      matchedProfileKey: matchedProfile?.workerKey ?? "",
      matchedTewWorkerId: tewIdWorker?.id ?? (tewNameMatches.length === 1 ? tewNameMatches[0].id : ""),
      suggestedTewWorkerIds,
      decision: matchedProfile ? "Preserve manual overrides" : "Replace imported fields",
    });
    const numericFields: ProfileFieldKey[] = [...PROFILE_CORE_FIELDS, ...MATCH_ENGINE_SKILLS];
    for (const field of numericFields) {
      const raw = values[field];
      if (raw === undefined || String(raw).trim() === "") continue;
      const maximum = field === "fanReaction" || field === "gimmick" ? 5 : 100;
      const minimum = field === "fanReaction" || field === "gimmick" ? 1 : 0;
      if (parseRating(raw, minimum, maximum) === null) messages.push(`${field} is outside the supported ${minimum}-${maximum} range.`);
    }
    if (values.styleId && imported.styleId === "all-rounder" && normalizeHeader(String(values.styleId)) !== "all rounder") messages.push(`Unknown style "${values.styleId}"; the row will use All-Rounder unless corrected.`);
    const status = messages.some((message) => message.includes("required") || message.includes("outside")) ? "Error" : matchedProfile || messages.length ? "Conflict" : "Ready";
    return {
      id: profileLibraryId("profile-import-row"),
      rowNumber: headerIndex + offset + 2,
      sourceName,
      sourceTewWorkerId,
      values,
      status,
      messages,
      matchedProfileKey: matchedProfile?.workerKey ?? "",
      matchedTewWorkerId: tewIdWorker?.id ?? (tewNameMatches.length === 1 ? tewNameMatches[0].id : ""),
      suggestedTewWorkerIds,
      decision: status === "Error" ? "Skip row" : matchedProfile ? "Preserve manual overrides" : "Replace imported fields",
    };
  }).map((row) => {
    const normalizedName = normalizeWorkerName(row.sourceName);
    const duplicateName = normalizedName && (seenNames.get(normalizedName) ?? 0) > 1;
    const duplicateId = row.sourceTewWorkerId && (seenIds.get(row.sourceTewWorkerId) ?? 0) > 1;
    if (!duplicateName && !duplicateId) return row;
    const messages = [...row.messages];
    if (duplicateName) messages.push("Duplicate wrestler name appears in this import.");
    if (duplicateId) messages.push("Duplicate TEW worker ID appears in this import.");
    return { ...row, messages, status: row.status === "Error" ? "Error" : "Conflict" as const };
  });
}

function cloneProfiles(profiles: MatchEngineProfile[]): MatchEngineProfile[] {
  return profiles.map((profile) => ({ ...profile, skills: { ...profile.skills } }));
}

function cloneRecords(records: ProfileLibraryRecord[]): ProfileLibraryRecord[] {
  return records.map((record) => ({
    ...record,
    identity: { ...record.identity, candidateWorkerIds: [...record.identity.candidateWorkerIds] },
    provenance: Object.fromEntries(Object.entries(record.provenance).map(([key, value]) => [key, value ? { ...value } : value])) as ProfileLibraryRecord["provenance"],
    missingRequiredFields: [...record.missingRequiredFields],
    warningFields: [...record.warningFields],
  }));
}

function shouldApplyField(existing: ProfileFieldProvenance | undefined, decision: ImportConflictDecision): boolean {
  if (decision === "Keep existing profile" || decision === "Skip row") return false;
  if (decision === "Merge missing fields") return !existing || PLACEHOLDER_SOURCES.includes(existing.source);
  if (decision === "Preserve manual overrides") return existing?.source !== "Manual override";
  return true;
}

function resolveProfileForImport(row: ProfileImportRow, profiles: MatchEngineProfile[]): MatchEngineProfile | undefined {
  if (row.matchedProfileKey) return profiles.find((profile) => profile.workerKey === row.matchedProfileKey);
  if (row.sourceTewWorkerId) return profiles.find((profile) => profile.workerSource === "tew" && profile.workerId === row.sourceTewWorkerId);
  const normalized = normalizeWorkerName(row.sourceName);
  const matches = profiles.filter((profile) => normalizeWorkerName(profile.workerName) === normalized);
  return matches.length === 1 ? matches[0] : undefined;
}

function importedProvenance(field: ProfileFieldKey, value: string | number | null, input: { fileName: string; sheetName: string; sessionId: string }): ProfileFieldProvenance {
  return provenance(field, "Imported from workbook", value, {
    sourceFile: input.fileName,
    sourceSheet: input.sheetName,
    importSessionId: input.sessionId,
    note: "Imported from a user-selected workbook or CSV after column mapping and review.",
  });
}

export function applyImportRows(input: {
  workbook: WorkbookData;
  sheetName: string;
  headerRow: number;
  mappingPresetId: string;
  rows: ProfileImportRow[];
  profiles: MatchEngineProfile[];
  library: ProfileLibraryUniverse;
  snapshot: TewSnapshot | null;
}): ProfileImportApplyResult {
  const timestamp = now();
  const sessionId = profileLibraryId("profile-import-session");
  const beforeProfiles = cloneProfiles(input.profiles);
  const beforeRecords = cloneRecords(input.library.records);
  let profiles = cloneProfiles(input.profiles);
  let records = cloneRecords(input.library.records);
  let profilesCreated = 0;
  let profilesUpdated = 0;
  let conflictsResolved = 0;
  const invalidatedWorkerKeys: string[] = [];
  const completedRows: ProfileImportRow[] = [];

  for (const row of input.rows) {
    if (row.status === "Error" || row.decision === "Skip row") {
      completedRows.push({ ...row, status: "Skipped" });
      continue;
    }
    const imported = importedValuesFromRow(row);
    if (!imported.workerName) {
      completedRows.push({ ...row, status: "Skipped", messages: [...row.messages, "Wrestler name is required."] });
      continue;
    }
    let profile = resolveProfileForImport(row, profiles);
    const separate = row.decision === "Create separate profile";
    if (!profile || separate) {
      const tewWorkerId = row.matchedTewWorkerId || imported.tewWorkerId;
      profile = createMatchEngineProfile({
        id: tewWorkerId || profileLibraryId("manual-worker"),
        name: imported.workerName,
        source: tewWorkerId ? "tew" : "manual",
      });
      if (separate && profiles.some((item) => item.workerKey === profile!.workerKey)) {
        profile = { ...profile, workerKey: `manual:${normalizeWorkerName(imported.workerName)}:${profileLibraryId("separate").slice(-6)}`, workerSource: "manual", workerId: profileLibraryId("manual-worker") };
      }
      profiles.push(profile);
      profilesCreated += 1;
    } else {
      profilesUpdated += 1;
      if (row.status === "Conflict") conflictsResolved += 1;
    }
    let record = records.find((item) => item.workerKey === profile!.workerKey) ?? createProfileLibraryRecord(profile, input.snapshot);
    const nextProvenance = { ...record.provenance };
    const sourceMeta = { fileName: input.workbook.fileName, sheetName: input.sheetName, sessionId };
    const updates: Partial<MatchEngineProfile> = {};
    const skillUpdates: Partial<Record<WrestlerSkill, number>> = {};
    const scalarFields: Array<keyof Pick<MatchEngineProfile, "overall" | "health" | "popularity" | "experience" | "fanReaction" | "gimmick">> = ["overall", "health", "popularity", "experience", "fanReaction", "gimmick"];
    for (const field of scalarFields) {
      const value = imported[field];
      if (value === null || !shouldApplyField(nextProvenance[field], row.decision)) continue;
      updates[field] = value as never;
      nextProvenance[field] = importedProvenance(field, value, sourceMeta);
    }
    if (row.values.styleId !== undefined && shouldApplyField(nextProvenance.styleId, row.decision)) {
      updates.styleId = imported.styleId;
      nextProvenance.styleId = importedProvenance("styleId", imported.styleId, sourceMeta);
    }
    for (const skill of MATCH_ENGINE_SKILLS) {
      const value = imported.skills[skill];
      if (value === undefined || !shouldApplyField(nextProvenance[skill], row.decision)) continue;
      skillUpdates[skill] = value;
      nextProvenance[skill] = importedProvenance(skill, value, sourceMeta);
    }
    if (imported.workerName && shouldApplyField(nextProvenance.name, row.decision)) {
      updates.workerName = imported.workerName;
      nextProvenance.name = importedProvenance("name", imported.workerName, sourceMeta);
    }
    const updatedProfile: MatchEngineProfile = {
      ...profile,
      ...updates,
      skills: { ...profile.skills, ...skillUpdates },
      updatedAt: timestamp,
    };
    profiles = profiles.map((item) => item.workerKey === profile!.workerKey ? updatedProfile : item);
    record = createProfileLibraryRecord(updatedProfile, input.snapshot, {
      ...record,
      provenance: nextProvenance,
      lastImportSessionId: sessionId,
      identity: row.matchedTewWorkerId
        ? { status: row.sourceTewWorkerId ? "Confirmed" : "Suggested", tewWorkerId: row.matchedTewWorkerId, tewWorkerName: input.snapshot?.workers.find((worker) => worker.id === row.matchedTewWorkerId)?.name ?? imported.workerName, candidateWorkerIds: row.suggestedTewWorkerIds, method: row.sourceTewWorkerId ? "Exact worker ID" : "Exact normalized name", confirmedAt: row.sourceTewWorkerId ? timestamp : "" }
        : record.identity,
    });
    records = records.some((item) => item.workerKey === record.workerKey)
      ? records.map((item) => item.workerKey === record.workerKey ? record : item)
      : [...records, record];
    invalidatedWorkerKeys.push(updatedProfile.workerKey);
    completedRows.push({ ...row, status: "Accepted" });
  }

  const session: ProfileImportSession = {
    id: sessionId,
    fileName: input.workbook.fileName,
    fileType: input.workbook.fileType,
    sheetName: input.sheetName,
    headerRow: input.headerRow,
    mappingPresetId: input.mappingPresetId,
    startedAt: timestamp,
    completedAt: now(),
    rowsAccepted: completedRows.filter((row) => row.status === "Accepted").length,
    rowsSkipped: completedRows.filter((row) => row.status === "Skipped").length,
    profilesCreated,
    profilesUpdated,
    conflictsResolved,
    rows: completedRows,
    beforeProfiles,
    beforeRecords,
    rolledBackAt: "",
  };
  return {
    profiles,
    library: { ...input.library, records, importSessions: [session, ...input.library.importSessions].slice(0, 30) },
    session,
    invalidatedWorkerKeys: [...new Set(invalidatedWorkerKeys)],
  };
}

export function rollbackImportSession(
  library: ProfileLibraryUniverse,
  currentProfiles: MatchEngineProfile[],
  sessionId: string,
): { library: ProfileLibraryUniverse; profiles: MatchEngineProfile[] } {
  const session = library.importSessions.find((item) => item.id === sessionId);
  if (!session || session.rolledBackAt) return { library, profiles: currentProfiles };
  const rolledBackAt = now();
  return {
    profiles: cloneProfiles(session.beforeProfiles),
    library: {
      ...library,
      records: cloneRecords(session.beforeRecords),
      importSessions: library.importSessions.map((item) => item.id === sessionId ? { ...item, rolledBackAt } : item),
    },
  };
}

export function setManualProfileField(
  profile: MatchEngineProfile,
  record: ProfileLibraryRecord,
  field: ProfileFieldKey,
  value: string | number,
): { profile: MatchEngineProfile; record: ProfileLibraryRecord } {
  const timestamp = now();
  let updatedProfile = { ...profile, skills: { ...profile.skills }, updatedAt: timestamp };
  if (MATCH_ENGINE_SKILLS.includes(field as WrestlerSkill)) updatedProfile.skills[field as WrestlerSkill] = Number(value);
  else if (field === "styleId") updatedProfile.styleId = value as WrestlerStyleId;
  else if (field === "name") updatedProfile.workerName = String(value);
  else if (field === "overall" || field === "health" || field === "popularity" || field === "experience" || field === "fanReaction" || field === "gimmick") updatedProfile = { ...updatedProfile, [field]: Number(value) };
  const updatedRecord = createProfileLibraryRecord(updatedProfile, null, {
    ...record,
    provenance: {
      ...record.provenance,
      [field]: provenance(field, "Manual override", value, { note: "Manually edited in the Wrestler Profile Library.", updatedAt: timestamp }),
    },
  });
  return { profile: updatedProfile, record: updatedRecord };
}

export function confirmProfileIdentity(record: ProfileLibraryRecord, workerId: string, workerName: string): ProfileLibraryRecord {
  return {
    ...record,
    identity: {
      status: "Confirmed",
      tewWorkerId: workerId,
      tewWorkerName: workerName,
      candidateWorkerIds: [workerId],
      method: "Manual confirmation",
      confirmedAt: now(),
    },
    updatedAt: now(),
  };
}

export function bulkAssignStyle(
  profiles: MatchEngineProfile[],
  records: ProfileLibraryRecord[],
  workerKeys: string[],
  styleId: WrestlerStyleId,
): { profiles: MatchEngineProfile[]; records: ProfileLibraryRecord[] } {
  const selected = new Set(workerKeys);
  const timestamp = now();
  const nextProfiles = profiles.map((profile) => selected.has(profile.workerKey) ? { ...profile, styleId, updatedAt: timestamp } : profile);
  const profileMap = new Map(nextProfiles.map((profile) => [profile.workerKey, profile]));
  const nextRecords = records.map((record) => {
    if (!selected.has(record.workerKey)) return record;
    const profile = profileMap.get(record.workerKey);
    return profile ? createProfileLibraryRecord(profile, null, {
      ...record,
      provenance: { ...record.provenance, styleId: provenance("styleId", "Manual override", styleId, { note: "Assigned through a confirmed bulk style action.", updatedAt: timestamp }) },
    }) : record;
  });
  return { profiles: nextProfiles, records: nextRecords };
}

export function profileLibraryCsv(profiles: MatchEngineProfile[], records: ProfileLibraryRecord[]): string {
  const headers = ["Name", "TEW Worker ID", "Style", "Readiness", "Completeness", "Overall", "Health", "Popularity", "Experience", "Fan Reaction", "Gimmick", ...MATCH_ENGINE_SKILLS];
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const recordMap = new Map(records.map((record) => [record.workerKey, record]));
  const rows = profiles.map((profile) => {
    const record = recordMap.get(profile.workerKey);
    return [profile.workerName, profile.workerSource === "tew" ? profile.workerId : "", profile.styleId, record?.readiness ?? "Incomplete", record?.completenessPercent ?? 0, profile.overall, profile.health, profile.popularity, profile.experience, profile.fanReaction, profile.gimmick, ...MATCH_ENGINE_SKILLS.map((skill) => profile.skills[skill])].map(escape).join(",");
  });
  return [headers.map(escape).join(","), ...rows].join("\n");
}

export function blankProfileTemplateCsv(): string {
  const headers = ["Wrestler Name", "TEW Worker ID", "Style", "Overall", "Health", "Popularity", "Experience", "Fan Reaction", "Gimmick", ...MATCH_ENGINE_SKILLS];
  return `${headers.join(",")}\n`;
}

export function invalidatePlansForProfiles<T extends { segments: Array<{ matchApproachSetup: { workerPlans: Array<{ workerKey: string }>; performancePreview: unknown; updatedAt: string } }> }>(shows: T[], workerKeys: string[]): T[] {
  const changed = new Set(workerKeys);
  const timestamp = now();
  return shows.map((show) => ({
    ...show,
    segments: show.segments.map((segment) => segment.matchApproachSetup.workerPlans.some((plan) => changed.has(plan.workerKey))
      ? { ...segment, matchApproachSetup: { ...segment.matchApproachSetup, performancePreview: null, updatedAt: timestamp } }
      : segment),
  }));
}
