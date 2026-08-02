import type { MatchEngineProfile, WrestlerSkill, WrestlerStyleId } from "../matchEngine/types";

export type ProfileReadiness = "Ready" | "Usable with warnings" | "Incomplete";
export type ProfileLinkStatus = "Confirmed" | "Suggested" | "Ambiguous" | "Manual" | "Missing TEW worker";
export type ProfileValueSource =
  | "Imported from workbook"
  | "Imported from TEW"
  | "Mapped from TEW"
  | "Derived"
  | "Manual override"
  | "Missing"
  | "Baseline placeholder";

export type ProfileFieldKey =
  | "name"
  | "tewWorkerId"
  | "styleId"
  | "overall"
  | "health"
  | "popularity"
  | "experience"
  | "fanReaction"
  | "gimmick"
  | WrestlerSkill;

export interface ProfileFieldProvenance {
  field: ProfileFieldKey;
  source: ProfileValueSource;
  sourceFile: string;
  sourceSheet: string;
  importSessionId: string;
  importedValue: string | number | null;
  manualOverrideValue: string | number | null;
  note: string;
  updatedAt: string;
}

export interface ProfileIdentityLink {
  status: ProfileLinkStatus;
  tewWorkerId: string;
  tewWorkerName: string;
  candidateWorkerIds: string[];
  method: "Exact worker ID" | "Exact normalized name" | "Alternate name" | "Manual confirmation" | "None";
  confirmedAt: string;
}

export interface ProfileLibraryRecord {
  workerKey: string;
  workerId: string;
  workerName: string;
  profileId: string;
  identity: ProfileIdentityLink;
  provenance: Partial<Record<ProfileFieldKey, ProfileFieldProvenance>>;
  readiness: ProfileReadiness;
  completenessPercent: number;
  missingRequiredFields: ProfileFieldKey[];
  warningFields: ProfileFieldKey[];
  lastImportSessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkbookSheetData {
  name: string;
  rows: string[][];
}

export interface WorkbookData {
  fileName: string;
  fileType: "csv" | "xlsx" | "xlsm" | "json";
  sheets: WorkbookSheetData[];
}

export interface ProfileImportMappingPreset {
  id: string;
  name: string;
  fileType: WorkbookData["fileType"];
  sheetName: string;
  headerRow: number;
  columnMap: Partial<Record<ProfileFieldKey, string>>;
  createdAt: string;
  updatedAt: string;
}

export type ImportConflictDecision =
  | "Keep existing profile"
  | "Replace imported fields"
  | "Merge missing fields"
  | "Preserve manual overrides"
  | "Create separate profile"
  | "Skip row"
  | (string & {});

export type ImportRowStatus =
  | "Ready"
  | "Conflict"
  | "Error"
  | "Skipped"
  | "Accepted"
  | (string & {});

export interface ProfileImportRow {
  id: string;
  rowNumber: number;
  sourceName: string;
  sourceTewWorkerId: string;
  values: Partial<Record<ProfileFieldKey, string | number>>;
  status: ImportRowStatus;
  messages: string[];
  matchedProfileKey: string;
  matchedTewWorkerId: string;
  suggestedTewWorkerIds: string[];
  decision: ImportConflictDecision;
}

export interface ProfileImportSession {
  id: string;
  fileName: string;
  fileType: WorkbookData["fileType"];
  sheetName: string;
  headerRow: number;
  mappingPresetId: string;
  startedAt: string;
  completedAt: string;
  rowsAccepted: number;
  rowsSkipped: number;
  profilesCreated: number;
  profilesUpdated: number;
  conflictsResolved: number;
  rows: ProfileImportRow[];
  beforeProfiles: MatchEngineProfile[];
  beforeRecords: ProfileLibraryRecord[];
  rolledBackAt: string;
}

export interface ProfileLibrarySettings {
  searchQuery: string;
  readinessFilter: "All" | ProfileReadiness;
  linkFilter: "All" | ProfileLinkStatus;
  sourceFilter: "All" | ProfileValueSource;
  selectedProfileKey: string;
}

export interface ProfileLibraryUniverse {
  records: ProfileLibraryRecord[];
  mappingPresets: ProfileImportMappingPreset[];
  importSessions: ProfileImportSession[];
  settings: ProfileLibrarySettings;
}

export interface ImportedProfileValues {
  workerName: string;
  tewWorkerId: string;
  styleId: WrestlerStyleId;
  overall: number | null;
  health: number | null;
  popularity: number | null;
  experience: number | null;
  fanReaction: number | null;
  gimmick: number | null;
  skills: Partial<Record<WrestlerSkill, number>>;
}

export interface ProfileImportApplyResult {
  profiles: MatchEngineProfile[];
  library: ProfileLibraryUniverse;
  session: ProfileImportSession;
  invalidatedWorkerKeys: string[];
}
