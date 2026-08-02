import type { BridgeMappingVerificationStage } from "../bridge/types";

export type TransferDestination = "Direct TEW Field" | "TEW Notes" | "Companion Only";
export type TransferFieldStatus = "Pending" | "Copied" | "Entered" | "Not Applicable";

export interface TransferField {
  key: string;
  label: string;
  value: string;
  destination: TransferDestination;
  required: boolean;
  mappingStage: BridgeMappingVerificationStage | "Manual";
  mappingTarget: string;
  guidance: string;
}

export interface TransferSegmentTranslation {
  segmentId: string;
  order: number;
  section: "Pre-Show" | "Main Show" | "Post-Show";
  type: "match" | "angle";
  title: string;
  directFields: TransferField[];
  tewNotes: TransferField[];
  companionOnly: TransferField[];
  completeEntryText: string;
}

export interface TransferPackage {
  id: string;
  showId: string;
  showName: string;
  generatedAt: string;
  eventFields: TransferField[];
  segments: TransferSegmentTranslation[];
  warnings: string[];
}

export interface TransferFieldProgress {
  fieldKey: string;
  status: TransferFieldStatus;
  updatedAt: string;
}

export interface TransferSegmentProgress {
  segmentId: string;
  fields: TransferFieldProgress[];
  completed: boolean;
  entryNotes: string;
  updatedAt: string;
}

export interface TransferRecord {
  showId: string;
  activePackageId: string;
  packageHistory: TransferPackage[];
  eventProgress: TransferFieldProgress[];
  segmentProgress: TransferSegmentProgress[];
  currentSegmentIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransferAuditLog {
  id: string;
  showId: string;
  createdAt: string;
  action: "Package Generated" | "Field Copied" | "Field Entered" | "Segment Completed" | "Export Plan Downloaded";
  detail: string;
}

export interface TransferUniverse {
  records: TransferRecord[];
  auditLogs: TransferAuditLog[];
}
