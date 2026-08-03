import type { TewSnapshot } from "../tew/types";

export type SnapshotRole =
  | "Current TEW Save"
  | "Baseline"
  | "Before Show"
  | "After Show"
  | "Historical Reference"
  | "Unclassified";

export type SnapshotMappingConfidence = "Good" | "Limited" | "Poor";
export type SnapshotWarningSeverity = "Blocking" | "Important" | "Informational";
export type CompanionHomeTab = "home" | "vault" | "onboarding" | "data";
export type OnboardingStatus = "Not Reviewed" | "In Progress" | "Completed";

export interface SnapshotManifestRecord {
  id: string;
  fingerprint: string;
  fileName: string;
  fileSize: number;
  databaseCreatedAt: string;
  importedAt: string;
  role: SnapshotRole | (string & {});
  notes: string;
  tableCount: number;
  mappedTableCount: number;
  workerCount: number;
  showCount: number;
  matchCount: number;
  storylineCount: number;
  warningCount: number;
  mappingConfidence: SnapshotMappingConfidence;
  estimatedBytes: number;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt: string;
}

export interface StoredSnapshotRecord {
  id: string;
  manifest: SnapshotManifestRecord;
  snapshot: TewSnapshot;
}

export type SnapshotChangeKind =
  | "New Show"
  | "Removed Show"
  | "Changed Show"
  | "New Match"
  | "Removed Match"
  | "Changed Match"
  | "New Worker"
  | "Missing Worker"
  | "New Storyline"
  | "Missing Storyline"
  | "Changed Storyline"
  | "Mapping Changed"
  | "Warning Added"
  | "Warning Resolved";

export interface SnapshotComparisonChange {
  id: string;
  kind: SnapshotChangeKind;
  entityId: string;
  title: string;
  beforeValue: string;
  afterValue: string;
  detail: string;
}

export interface SnapshotComparisonRecord {
  id: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
  beforeFileName: string;
  afterFileName: string;
  createdAt: string;
  newShowIds: string[];
  changedShowIds: string[];
  newMatchIds: string[];
  changedMatchIds: string[];
  newWorkerIds: string[];
  missingWorkerIds: string[];
  newStorylineIds: string[];
  changedStorylineIds: string[];
  mappingChangeCount: number;
  warningChangeCount: number;
  changes: SnapshotComparisonChange[];
}

export interface SnapshotSafetyWarning {
  id: string;
  severity: SnapshotWarningSeverity;
  title: string;
  detail: string;
  snapshotId: string;
  showId: string;
}

export interface PromotionIdentity {
  status: OnboardingStatus;
  promotionName: string;
  abbreviation: string;
  defaultBrand: string;
  defaultWeeklyShow: string;
  defaultShowLength: number;
  calendarStartDate: string;
  activeSnapshotId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export type WorkerIdentityDecisionKind =
  | "Confirmed Existing Link"
  | "Linked Existing Profile"
  | "Created Identity-Only Profile"
  | "Ignored"
  | "Ambiguous"
  | "Unresolved"
  | "Preserve Tracker Name"
  | "Update TEW Display Name";

export interface WorkerIdentityDecision {
  id: string;
  snapshotId: string;
  tewWorkerId: string;
  tewWorkerName: string;
  decision: WorkerIdentityDecisionKind;
  profileKey: string;
  candidateProfileKeys: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type StorylineIdentityDecisionKind =
  | "Linked Existing Storyline"
  | "Created Tracker Storyline"
  | "Ignored"
  | "Historical Only"
  | "Ambiguous"
  | "Unresolved"
  | "Preserve Tracker Details"
  | "Update Imported Fields";

export interface StorylineIdentityDecision {
  id: string;
  snapshotId: string;
  tewStorylineId: string;
  tewStorylineName: string;
  decision: StorylineIdentityDecisionKind;
  trackerStorylineId: string;
  candidateStorylineIds: string[];
  importedStatus: string;
  importedHeat: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionHomeState {
  activeTab: CompanionHomeTab;
  lastSelectedHistoricalShowId: string;
  lastSelectedTewStorylineId: string;
  compareBeforeSnapshotId: string;
  compareAfterSnapshotId: string;
  lastPrimaryAction: string;
  updatedAt: string;
}

export interface DataCenterSettings {
  retentionLimit: number;
  storageWarningMegabytes: number;
  lastCompleteBackupAt: string;
  lastVaultExportAt: string;
  lastRestoreAt: string;
  lastPreRestoreSafetyAt: string;
}

export interface SnapshotVaultUniverse {
  manifest: SnapshotManifestRecord[];
  activeSnapshotId: string;
  baselineSnapshotId: string;
  lastPostShowSnapshotId: string;
  lastReconciliationSnapshotId: string;
  lastComparisonId: string;
  comparisons: SnapshotComparisonRecord[];
  promotion: PromotionIdentity;
  workerDecisions: WorkerIdentityDecision[];
  storylineDecisions: StorylineIdentityDecision[];
  home: CompanionHomeState;
  dataCenter: DataCenterSettings;
}

export interface SnapshotVaultImportResult {
  universe: SnapshotVaultUniverse;
  record: StoredSnapshotRecord;
  duplicate: boolean;
  comparison: SnapshotComparisonRecord | null;
}

export interface SnapshotVaultPackage {
  product: "TEW IX Snapshot Vault";
  version: number;
  exportedAt: string;
  universe: SnapshotVaultUniverse;
  records: StoredSnapshotRecord[];
}

export interface SnapshotVaultStorageEstimate {
  recordCount: number;
  manifestBytes: number;
  parsedSnapshotBytes: number;
  totalBytes: number;
  quotaBytes: number | null;
  usageBytes: number | null;
}

export interface WorkerIdentityCandidate {
  tewWorkerId: string;
  tewWorkerName: string;
  exactIdProfileKeys: string[];
  exactNameProfileKeys: string[];
  candidateProfileKeys: string[];
  recommendedDecision: WorkerIdentityDecisionKind | (string & {});
  conflict: boolean;
}

export interface StorylineIdentityCandidate {
  tewStorylineId: string;
  tewStorylineName: string;
  linkedTrackerStorylineIds: string[];
  exactNameStorylineIds: string[];
  candidateStorylineIds: string[];
  recommendedDecision: StorylineIdentityDecisionKind | (string & {});
  conflict: boolean;
}
