export type ShowOperationStage =
  | "Draft"
  | "Creative Ready"
  | "Handoff Ready"
  | "Entering in TEW"
  | "Entered"
  | "Awaiting Results"
  | "Reconciliation Needed"
  | "Reconciled";

export type PreflightSeverity = "Blocking" | "Important" | "Advisory";
export type PreflightCategory = "Show" | "Card" | "Match" | "Angle" | "Championship" | "Competition" | "Handoff" | "Transfer" | "Results";
export type PreflightActionTarget = "show" | "match-setup" | "match-story" | "angle-output" | "handoff" | "transfer" | "results";

export interface ShowPreflightIssue {
  id: string;
  severity: PreflightSeverity;
  category: PreflightCategory;
  message: string;
  detail: string;
  segmentId: string;
  actionLabel: string;
  actionTarget: PreflightActionTarget;
  acknowledged: boolean;
}

export interface ShowPreflightReport {
  showId: string;
  generatedAt: string;
  score: number;
  blockingCount: number;
  importantCount: number;
  advisoryCount: number;
  acknowledgedCount: number;
  issues: ShowPreflightIssue[];
}

export interface ShowOperationsSummary {
  showId: string;
  showName: string;
  stage: ShowOperationStage;
  stageDetail: string;
  nextAction: string;
  nextActionTarget: PreflightActionTarget;
  nextSegmentId: string;
  plannedMinutes: number;
  expectedMinutes: number;
  matchCount: number;
  angleCount: number;
  approachesComplete: number;
  approachesTotal: number;
  narrativesComplete: number;
  narrativesTotal: number;
  handoffVersion: number;
  transferCompleted: number;
  transferTotal: number;
  staleHandoff: boolean;
  staleTransfer: boolean;
}

export interface OperationsChangeNote {
  id: string;
  showId: string;
  segmentId: string;
  field: string;
  originalValue: string;
  enteredValue: string;
  reason: string;
  updateCreativePlan: boolean;
  requiresNewVersion: boolean;
  createdAt: string;
}

export type ResultSuggestionStatus = "Suggested" | "Confirmed" | "Rejected";

export interface ResultMatchSuggestion {
  plannedSegmentId: string;
  plannedTitle: string;
  actualMatchId: string;
  actualDescription: string;
  confidence: number;
  reasons: string[];
  status: ResultSuggestionStatus;
}

export interface ResultIntakeSession {
  id: string;
  showId: string;
  createdAt: string;
  sourceFile: string;
  actualShowId: string;
  actualShowName: string;
  showConfidence: number;
  showReasons: string[];
  suggestions: ResultMatchSuggestion[];
  appliedAt: string;
}

export interface ShowOperationsRecord {
  showId: string;
  acknowledgedIssueIds: string[];
  changeNotes: OperationsChangeNote[];
  resultSessions: ResultIntakeSession[];
  lastViewedTab: "overview" | "preflight" | "entry" | "results" | "changes";
  updatedAt: string;
}

export interface ShowOperationsUniverse {
  records: ShowOperationsRecord[];
}
