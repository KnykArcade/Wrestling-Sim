import type { OutputComparisonStatus, OutputLineageStage } from "../outputLibrary/types";

export type ShowSessionStep = "overview" | "setup" | "creative" | "package" | "entry" | "result" | "wrap-up";

export type SegmentSessionStatus =
  | "Not Started"
  | "Setup Incomplete"
  | "Creative In Progress"
  | "Ready for TEW"
  | "Entering in TEW"
  | "Entered"
  | "Awaiting Result"
  | "Reconciliation Needed"
  | "Reconciled";

export interface ShowSessionCheckpointLog {
  id: string;
  showId: string;
  segmentId: string;
  stage: OutputLineageStage;
  outputItemId: string;
  outputVersionId: string;
  fingerprint: string;
  createdAt: string;
}

export interface ShowSessionRecord {
  showId: string;
  selectedSegmentId: string;
  activeStep: ShowSessionStep;
  appliedOutputSegmentIds: string[];
  readyForTewSegmentIds: string[];
  dismissedCheckpointFingerprints: string[];
  checkpointLog: ShowSessionCheckpointLog[];
  awaitingResultsAt: string;
  lastSnapshotFile: string;
  lastOpenedAt: string;
  updatedAt: string;
}

export interface ShowSessionUniverse {
  records: ShowSessionRecord[];
  lastShowId: string;
}

export interface SegmentSessionSummary {
  segmentId: string;
  title: string;
  type: "match" | "angle";
  status: SegmentSessionStatus;
  setupComplete: boolean;
  approachesComplete: boolean;
  outputComplete: boolean;
  packageCurrent: boolean;
  entryStarted: boolean;
  entryComplete: boolean;
  resultAvailable: boolean;
  reconciled: boolean;
}

export interface UnifiedShowSessionSummary {
  showId: string;
  segmentCount: number;
  matchCount: number;
  angleCount: number;
  plannedMinutes: number;
  setupComplete: number;
  approachesComplete: number;
  outputsComplete: number;
  packagesCurrent: number;
  entryComplete: number;
  reconciled: number;
  nextSegmentId: string;
  segments: SegmentSessionSummary[];
}

export interface SessionCheckpointChange {
  field: string;
  beforeValue: string;
  afterValue: string;
  status: OutputComparisonStatus;
}

export interface SessionCheckpointOffer {
  stage: OutputLineageStage;
  fingerprint: string;
  duplicate: boolean;
  dismissed: boolean;
  currentVersionId: string;
  changes: SessionCheckpointChange[];
}

export interface ShowSessionIntegrityIssue {
  id: string;
  severity: "Blocking" | "Warning" | "Information";
  message: string;
  detail: string;
}
