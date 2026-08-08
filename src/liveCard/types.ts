import type { MatchResolutionFinalResult } from "../matchResolution/types";
import type { PlannedSegmentType } from "../planner/types";
import type { LiveAudienceResult } from "../crowd/types";
import type { ShowExpectationSnapshot } from "../showEvaluation/types";

export type LiveCardShowStatus = "Planned" | "In Progress" | "Completed";
export type LiveCardSegmentStatus = "Planned" | "Current" | "Result Pending" | "Completed" | "Skipped" | "Correction";
export type LiveCardAuditAction =
  | "Session Created"
  | "Show Started"
  | "Segment Selected"
  | "Match Result Locked"
  | "Angle Completed"
  | "Segment Skipped"
  | "Follow-Up Angle Inserted"
  | "Post-Match Segment Inserted"
  | "Correction Opened"
  | "Correction Completed"
  | "Show Completed";

export interface LiveCardResultSnapshot {
  resolutionRecordId: string;
  resolutionAttemptId: string;
  status: "Accepted" | "Overridden";
  engineWinnerName: string;
  finalResult: MatchResolutionFinalResult;
  capturedAt: string;
}

export interface LiveCardCorrectionEntry {
  id: string;
  reason: string;
  beforeOutput: string;
  afterOutput: string;
  openedAt: string;
  completedAt: string;
}

export interface LiveCardSegmentProgress {
  segmentId: string;
  type: PlannedSegmentType;
  title: string;
  status: LiveCardSegmentStatus;
  insertedDuringShow: boolean;
  sourceSegmentId: string;
  result: LiveCardResultSnapshot | null;
  audience: LiveAudienceResult | null;
  finalAngleOutput: string;
  finalConsequences: string;
  finalFollowUp: string;
  groundedFacts: string[];
  startedAt: string;
  completedAt: string;
  skippedAt: string;
  skipReason: string;
  corrections: LiveCardCorrectionEntry[];
  updatedAt: string;
}

export interface LiveCardAuditEntry {
  id: string;
  action: LiveCardAuditAction;
  showId: string;
  segmentId: string;
  detail: string;
  createdAt: string;
}

export interface LiveCardSession {
  id: string;
  showId: string;
  showName: string;
  status: LiveCardShowStatus;
  currentSegmentId: string;
  segmentOrder: string[];
  progress: LiveCardSegmentProgress[];
  audit: LiveCardAuditEntry[];
  crowdStart: number;
  currentCrowd: number;
  expectationSnapshot: ShowExpectationSnapshot | null;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveCardSettings {
  selectedShowId: string;
  showRunnerVisible: boolean;
}

export interface LiveCardUniverse {
  sessions: LiveCardSession[];
  settings: LiveCardSettings;
}

export interface GroundedAngleInput {
  title: string;
  purpose: string;
  location: string;
  contentType: string;
  mode: "Follow-Up Angle" | "Post-Match Segment";
}
