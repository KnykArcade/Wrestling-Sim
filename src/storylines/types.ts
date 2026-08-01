import type {
  PlannedReferenceSource,
  PlannedSegmentSection,
  PlannedSegmentType,
  SegmentWorkflowStatus,
} from "../planner/types";

export type TrackerStorylineStatus =
  | "Idea"
  | "Planned"
  | "Active"
  | "Paused"
  | "Completed"
  | "Abandoned";

export type StorylineParticipantSource = "tew" | "manual";
export type StorylineMilestoneType =
  | "Inciting Incident"
  | "Escalation"
  | "Betrayal"
  | "Reveal"
  | "Match"
  | "Title Change"
  | "Turn"
  | "Climax"
  | "Aftermath"
  | "Other";
export type StorylineMilestoneStatus =
  | "Unassigned"
  | "Assigned"
  | "Completed"
  | "Delayed"
  | "Cancelled";

export interface StorylineParticipant {
  id: string;
  name: string;
  role: string;
  source: StorylineParticipantSource;
}

export interface StorylineReferenceLink {
  id: string;
  source: PlannedReferenceSource;
  referenceId: string;
  name: string;
}

export interface StorylineMilestone {
  id: string;
  type: StorylineMilestoneType;
  title: string;
  targetDate: string;
  status: StorylineMilestoneStatus;
  assignedShowId: string;
  notes: string;
}

export interface TrackerStoryline {
  id: string;
  name: string;
  status: TrackerStorylineStatus;
  startDate: string;
  plannedEndDate: string;
  currentPhase: string;
  linkedChampionship: string;
  premise: string;
  centralConflict: string;
  motivations: string;
  plannedBeginning: string;
  plannedClimax: string;
  plannedEnding: string;
  aftermath: string;
  privateNotes: string;
  participants: StorylineParticipant[];
  referenceLinks: StorylineReferenceLink[];
  milestones: StorylineMilestone[];
  knownSegmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StorylineTimelineEntry {
  id: string;
  showId: string;
  segmentId: string;
  showName: string;
  showDate: string;
  showStatus: string;
  segmentTitle: string;
  segmentType: PlannedSegmentType;
  section: PlannedSegmentSection;
  workflowStatus: SegmentWorkflowStatus;
  workerNames: string[];
  plannedNarrative: string;
  finalNarrative: string;
  actualSummary: string;
  consequences: string;
  followUp: string;
  rating: number | null;
  reconciled: boolean;
}

export interface StorylineReferenceOption {
  key: string;
  source: PlannedReferenceSource;
  referenceId: string;
  name: string;
  usageCount: number;
}

export interface ContinuityWarning {
  id: string;
  message: string;
  category: "Follow-up" | "Milestone" | "Participant" | "Aftermath" | "Broken Link" | "Payoff";
}
