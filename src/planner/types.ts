import type { TrackerStoryline } from "../storylines/types";

export type PlannedSegmentType = "match" | "angle";
export type PlannedSegmentSection = "Pre-Show" | "Main Show" | "Post-Show";
export type PlannedShowStatus = "Draft" | "Ready" | "Completed" | "Reconciled";
export type PlannedReferenceSource = "tew" | "manual";
export type SegmentWorkflowStatus = "Planned" | "Entered in TEW" | "Completed" | "Reconciled";

export interface PlannedWorkerReference {
  id: string;
  name: string;
  role: string;
  side: string;
  source: PlannedReferenceSource;
}

export interface PlannedStorylineReference {
  id: string;
  name: string;
  source: PlannedReferenceSource;
}

export interface ActualMatchSnapshot {
  id: string;
  description: string;
  rating: number | null;
  winner: string;
  matchTime: string;
  notes: string;
  placement: PlannedSegmentSection;
  workers: string[];
}

export interface SegmentReconciliation {
  linkedMatchId: string;
  actualMatch: ActualMatchSnapshot | null;
  happenedAsPlanned: boolean | null;
  actualRating: number | null;
  finalNarrative: string;
  changes: string;
  actualConsequences: string;
  finalFollowUp: string;
  reconciledAt: string;
}

export interface ActualShowSnapshot {
  id: string;
  name: string;
  date: string;
  rating: number | null;
  attendance: number | null;
  venue: string;
  company: string;
  broadcast: string;
  sourceFile: string;
}

export interface ShowReconciliation {
  linkedShowId: string;
  actualShow: ActualShowSnapshot;
  linkedAt: string;
  completedAt: string;
  notes: string;
}

export interface PlannedSegment {
  id: string;
  type: PlannedSegmentType;
  section: PlannedSegmentSection;
  title: string;
  durationMinutes: number;
  notes: string;
  workers: PlannedWorkerReference[];
  storylines: PlannedStorylineReference[];
  purpose: string;
  consequences: string;
  followUp: string;
  privateNotes: string;

  matchType: string;
  championship: string;
  plannedWinner: string;
  plannedFinish: string;
  matchStory: string;
  keyMoments: string;
  interference: string;
  postMatch: string;

  angleLocation: string;
  angleContentType: string;
  segmentOutput: string;
  audienceTakeaway: string;

  workflowStatus: SegmentWorkflowStatus;
  reconciliation: SegmentReconciliation;
}

export interface PlannedShow {
  id: string;
  name: string;
  date: string;
  company: string;
  showType: string;
  venue: string;
  expectedMinutes: number;
  status: PlannedShowStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  segments: PlannedSegment[];
  reconciliation: ShowReconciliation | null;
}

export interface PlannerBackup {
  product: "TEW IX Story Tracker";
  version: 4;
  exportedAt: string;
  shows: PlannedShow[];
  storylines: TrackerStoryline[];
}

export interface PlannerBackupBundle {
  shows: PlannedShow[];
  storylines: TrackerStoryline[];
}
