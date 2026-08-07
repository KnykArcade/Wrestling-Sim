import type { PlannedSegmentType, SegmentWorkflowStatus } from "../planner/types";

export type WorkerSource = "tew" | "manual" | "discovered";
export type WorkerAlignment = "Unspecified" | "Face" | "Heel" | "Tweener";
export type WorkerArcStatus = "Idea" | "Planned" | "Active" | "Paused" | "Completed" | "Abandoned";
export type WorkerRelationshipType =
  | "Ally"
  | "Rival"
  | "Tag Partner"
  | "Stable Member"
  | "Manager / Client"
  | "Mentor / Student"
  | "Family"
  | "Authority Conflict"
  | "Former Ally"
  | "Betrayal"
  | "Respect"
  | "Other";
export type WorkerRelationshipStatus = "Planned" | "Active" | "Paused" | "Ended";

export interface WorkerArc {
  id: string;
  name: string;
  status: WorkerArcStatus;
  startingSituation: string;
  motivation: string;
  internalConflict: string;
  externalConflict: string;
  turningPoint: string;
  plannedResolution: string;
  aftermath: string;
  linkedStorylineId: string;
  targetShowId: string;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerProfile {
  id: string;
  displayName: string;
  source: WorkerSource;
  linkedTewWorkerId: string;
  linkedTewWorkerName: string;
  companyId?: string;
  companyName?: string;
  currentRole: string;
  alignment: WorkerAlignment;
  brand: string;
  gimmickSummary: string;
  currentMotivation: string;
  longTermObjective: string;
  creativeDirection: string;
  privateNotes: string;
  inactivityWarningDays: number;
  arcs: WorkerArc[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkerRelationship {
  id: string;
  workerAId: string;
  workerBId: string;
  type: WorkerRelationshipType;
  status: WorkerRelationshipStatus;
  startDate: string;
  endDate: string;
  importance: number;
  publicDescription: string;
  privateNotes: string;
  linkedStorylineId: string;
  history: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerUniverse {
  profiles: WorkerProfile[];
  relationships: WorkerRelationship[];
}

export interface WorkerCandidate {
  key: string;
  name: string;
  source: WorkerSource;
  tewWorkerId: string;
  roles: string[];
  brands: string[];
  appearanceCount: number;
}

export interface WorkerHistoryEntry {
  id: string;
  showId: string;
  segmentId: string;
  showName: string;
  showDate: string;
  showStatus: string;
  segmentTitle: string;
  segmentType: PlannedSegmentType;
  workflowStatus: SegmentWorkflowStatus;
  plannedNarrative: string;
  finalNarrative: string;
  result: string;
  rating: number | null;
  consequences: string;
  followUp: string;
  storylineNames: string[];
  completed: boolean;
  winState: "Win" | "Loss" | "Unresolved" | "Not applicable";
}

export interface WorkerStatistics {
  plannedAppearances: number;
  completedAppearances: number;
  matches: number;
  angles: number;
  wins: number;
  losses: number;
  unresolvedMatches: number;
  averageMatchRating: number | null;
  averageAngleRating: number | null;
  storylines: number;
  lastAppearance: string;
  nextAppearance: string;
  appearanceStreak: number;
  daysSinceLastAppearance: number | null;
}

export interface WorkerComparison {
  sharedEntries: WorkerHistoryEntry[];
  sharedStorylines: string[];
  workerAWins: number;
  workerBWins: number;
  firstInteraction: string;
  latestInteraction: string;
  nextInteraction: string;
  relationship: WorkerRelationship | null;
}

export interface WorkerWarning {
  id: string;
  category: "Booking" | "Arc" | "Relationship" | "Continuity" | "Duplicate";
  message: string;
}
