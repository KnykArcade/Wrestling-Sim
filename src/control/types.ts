export type BookingIdeaType =
  | "Match" | "Angle" | "Promo" | "Debut" | "Return" | "Turn" | "Betrayal"
  | "Title Change" | "Challenge" | "Reveal" | "Mystery" | "Interference"
  | "Injury Story" | "Custom";

export type BookingIdeaStatus =
  | "Inbox" | "Developing" | "Ready" | "Scheduled" | "Completed" | "Delayed" | "Cancelled" | "Archived";

export type BookingIdeaPriority = "Low" | "Normal" | "High" | "Critical";

export interface BookingIdeaWorker {
  id: string;
  name: string;
  role: string;
}

export interface BookingIdeaStoryline {
  id: string;
  name: string;
}

export interface BookingIdea {
  id: string;
  title: string;
  type: BookingIdeaType;
  status: BookingIdeaStatus;
  priority: BookingIdeaPriority;
  targetDate: string;
  targetShowId: string;
  workers: BookingIdeaWorker[];
  storylines: BookingIdeaStoryline[];
  championship: string;
  concept: string;
  creativePurpose: string;
  plannedConsequences: string;
  followUp: string;
  privateNotes: string;
  scheduledSegmentId: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlSettings {
  dashboardWindowDays: number;
  calendarFilter: "All" | "Shows" | "Milestones" | "Arcs" | "Ideas";
  searchQuery: string;
}

export interface CreativeControlData {
  ideas: BookingIdea[];
  settings: ControlSettings;
}

export interface CalendarEntry {
  id: string;
  date: string;
  type: "Show" | "Milestone" | "Arc" | "Idea";
  title: string;
  subtitle: string;
  showId: string;
  storylineId: string;
  workerId: string;
  ideaId: string;
  status: string;
}

export interface ShowReadinessIssue {
  id: string;
  category: "Time" | "Narrative" | "Worker" | "Storyline" | "Idea" | "Milestone" | "Follow-up";
  message: string;
}

export interface ShowReadinessSummary {
  score: number;
  bookedMinutes: number;
  expectedMinutes: number;
  issues: ShowReadinessIssue[];
}

export interface ControlWarning {
  id: string;
  category: "Storyline" | "Worker" | "Arc" | "Relationship" | "Milestone" | "Idea" | "Championship" | "Follow-up";
  message: string;
  showId: string;
  storylineId: string;
  workerId: string;
  ideaId: string;
}

export interface GlobalSearchResult {
  id: string;
  kind: "Show" | "Segment" | "Storyline" | "Worker" | "Arc" | "Relationship" | "Milestone" | "Booking Idea";
  title: string;
  detail: string;
  showId: string;
  segmentId: string;
  storylineId: string;
  workerId: string;
  ideaId: string;
}
