export type PlannedSegmentType = "match" | "angle";
export type PlannedSegmentSection = "Pre-Show" | "Main Show" | "Post-Show";
export type PlannedShowStatus = "Draft" | "Ready" | "Completed";

export interface PlannedSegment {
  id: string;
  type: PlannedSegmentType;
  section: PlannedSegmentSection;
  title: string;
  durationMinutes: number;
  notes: string;
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
}

export interface PlannerBackup {
  product: "TEW IX Story Tracker";
  version: 1;
  exportedAt: string;
  shows: PlannedShow[];
}
