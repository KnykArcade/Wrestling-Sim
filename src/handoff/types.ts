export type HandoffStatus =
  | "Draft"
  | "Ready"
  | "Finalized for TEW"
  | "Entering in TEW"
  | "Entered in TEW"
  | "Completed"
  | "Reconciled";

export type HandoffMappingKind = "Worker" | "Championship" | "Storyline" | "Company" | "Match Term";

export type HandoffFieldKey =
  | "title"
  | "participants"
  | "duration"
  | "winner"
  | "finish"
  | "championship"
  | "narrative"
  | "storylines"
  | "agentNotes";

export interface HandoffMapping {
  id: string;
  kind: HandoffMappingKind;
  trackerId: string;
  trackerName: string;
  tewId: string;
  tewName: string;
  updatedAt: string;
}

export interface HandoffWorkerSnapshot {
  id: string;
  name: string;
  role: string;
  side: string;
  source: "tew" | "manual";
}

export interface HandoffStorylineSnapshot {
  id: string;
  name: string;
  source: "tew" | "manual";
}

export interface HandoffSegmentSnapshot {
  id: string;
  order: number;
  type: "match" | "angle";
  section: "Pre-Show" | "Main Show" | "Post-Show";
  title: string;
  durationMinutes: number;
  notes: string;
  workers: HandoffWorkerSnapshot[];
  storylines: HandoffStorylineSnapshot[];
  purpose: string;
  consequences: string;
  followUp: string;
  privateNotes: string;
  matchType: string;
  championship: string;
  championshipId: string;
  championshipMatchPurpose: string;
  championEntering: string;
  challenger: string;
  expectedTitleChange: boolean | null;
  championshipStakes: string;
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
  bookingIdeaId: string;
}

export interface HandoffShowSnapshot {
  id: string;
  name: string;
  date: string;
  company: string;
  showType: string;
  venue: string;
  expectedMinutes: number;
  notes: string;
  sourceUpdatedAt: string;
}

export interface HandoffVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  show: HandoffShowSnapshot;
  segments: HandoffSegmentSnapshot[];
  changesFromPrevious: string[];
}

export interface HandoffChecklist {
  showCreated: boolean;
  eventSettingsEntered: boolean;
  matchesEntered: boolean;
  anglesEntered: boolean;
  workersAssigned: boolean;
  winnersAndFinishesEntered: boolean;
  championshipsAssigned: boolean;
  storylinesAssigned: boolean;
  durationsChecked: boolean;
  runningOrderConfirmed: boolean;
  finalCardReviewed: boolean;
}

export interface HandoffSegmentProgress {
  segmentId: string;
  fields: Record<HandoffFieldKey, boolean>;
  completed: boolean;
  updatedAt: string;
}

export interface ShowHandoffRecord {
  showId: string;
  status: HandoffStatus;
  activeVersionId: string;
  versions: HandoffVersion[];
  checklist: HandoffChecklist;
  segmentProgress: HandoffSegmentProgress[];
  entryNotes: string;
  startedAt: string;
  enteredAt: string;
  updatedAt: string;
}

export interface HandoffUniverse {
  records: ShowHandoffRecord[];
  mappings: HandoffMapping[];
}

export interface HandoffWarning {
  id: string;
  category: "Snapshot" | "Mapping" | "Card" | "Segment" | "Championship" | "Conflict";
  message: string;
  segmentId: string;
}
