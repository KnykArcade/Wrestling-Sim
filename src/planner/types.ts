export type PlannedSegmentType = "match" | "angle";
export type PlannedSegmentSection = "Pre-Show" | "Main Show" | "Post-Show";
export type PlannedShowStatus = "Draft" | "Ready" | "Completed";
export type PlannedReferenceSource = "tew" | "manual";

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
  version: 2;
  exportedAt: string;
  shows: PlannedShow[];
}
