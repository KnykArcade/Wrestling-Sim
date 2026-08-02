export type CompanionWorkspaceView = "workflow" | "comparison" | "mappings" | "readiness" | "dry-run";
export type BridgeMappingStatus = "Candidate" | "Verified" | "Unsupported";
export type BridgeFieldCategory = "Show" | "Match" | "Angle" | "Worker" | "Storyline" | "Championship" | "Competition";
export type BridgeConfidence = "Low" | "Medium" | "High";

export interface CompanionModeSettings {
  enabled: boolean;
  advancedPreviewTools: boolean;
  defaultView: CompanionWorkspaceView;
}

export interface BridgeFieldMapping {
  id: string;
  category: BridgeFieldCategory;
  trackerField: string;
  trackerLabel: string;
  tewTable: string;
  tewField: string;
  status: BridgeMappingStatus;
  confidence: BridgeConfidence;
  evidence: string;
  notes: string;
  updatedAt: string;
}

export interface TewTableChange {
  tableName: string;
  beforeRows: number;
  afterRows: number;
  rowDelta: number;
  beforeColumns: number;
  afterColumns: number;
  classification: "Unchanged" | "Rows Added" | "Rows Removed" | "Schema Changed" | "New Table" | "Missing Table";
}

export interface TewEntityFieldChange {
  field: string;
  beforeValue: string;
  afterValue: string;
}

export interface TewEntityChange {
  entityType: "Show" | "Match" | "Worker" | "Storyline";
  entityId: string;
  entityName: string;
  changeType: "Added" | "Removed" | "Changed";
  fieldChanges: TewEntityFieldChange[];
}

export interface TewComparisonReport {
  id: string;
  createdAt: string;
  beforeFileName: string;
  afterFileName: string;
  beforeImportedAt: string;
  afterImportedAt: string;
  tableChanges: TewTableChange[];
  entityChanges: TewEntityChange[];
  candidateTables: string[];
  notes: string;
}

export interface BridgeReadinessField {
  trackerField: string;
  label: string;
  status: "Verified" | "Candidate" | "Manual" | "Missing" | "Unsupported";
  detail: string;
}

export interface BridgeReadinessReport {
  showId: string;
  showName: string;
  generatedAt: string;
  verifiedCount: number;
  candidateCount: number;
  manualCount: number;
  blockingCount: number;
  fields: BridgeReadinessField[];
}

export interface ProposedBridgeChange {
  id: string;
  category: BridgeFieldCategory;
  targetTable: string;
  targetField: string;
  proposedValue: string;
  referencedIds: string[];
  validation: "Ready" | "Candidate" | "Blocked" | "Manual";
  problem: string;
}

export interface BridgeDryRunPackage {
  id: string;
  showId: string;
  showName: string;
  generatedAt: string;
  writingEnabled: false;
  proposedChanges: ProposedBridgeChange[];
  readyCount: number;
  candidateCount: number;
  blockedCount: number;
  manualCount: number;
}

export interface BridgeUniverse {
  settings: CompanionModeSettings;
  mappings: BridgeFieldMapping[];
  comparisonReports: TewComparisonReport[];
}
