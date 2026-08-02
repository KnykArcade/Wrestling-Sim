import type { PlannedSegmentSection, PlannedSegmentType } from "../planner/types";

export type ShowSeriesCategory =
  | "Weekly Television"
  | "Biweekly Television"
  | "Monthly Event"
  | "Premium Event"
  | "Competition Event"
  | "Special"
  | "One-Off"
  | "Custom";

export type ShowSeriesStatus = "Active" | "Paused" | "Completed" | "Inactive";
export type ShowRecurrenceKind = "Weekly" | "Biweekly" | "Monthly" | "Interval Days" | "One-Off";
export type VenueMode = "Fixed" | "Manual Per Show";
export type CalendarViewMode = "month" | "list" | "series" | "templates" | "obligations";
export type ScheduleGenerationMode = "count" | "through-date" | "regenerate";
export type SchedulePreviewStatus = "New" | "Unchanged" | "Manually Edited" | "Conflict" | "Excluded";
export type ScheduleExceptionType = "Skipped" | "Rescheduled" | "Inserted Special" | "Replaced" | "Manual Edit";
export type PromotionShowStage =
  | "Scheduled"
  | "Card Started"
  | "Creative In Progress"
  | "Ready for TEW"
  | "Entering in TEW"
  | "Awaiting Results"
  | "Reconciliation Needed"
  | "Reconciled"
  | "Reconciled — Wrap-Up Pending"
  | "Reconciled — Closed";

export type BookingObligationKind =
  | "Follow-up"
  | "Storyline Milestone"
  | "Booking Idea"
  | "Character Arc"
  | "Championship Program"
  | "Vacant Championship"
  | "Competition Fixture"
  | "TEW Entry Revision";

export type BookingObligationDecisionStatus =
  | "Added as Match"
  | "Added as Angle"
  | "Attached to Segment"
  | "Deferred"
  | "Addressed"
  | "Dismissed";

export interface SeriesTemplateSlot {
  id: string;
  type: PlannedSegmentType;
  section: PlannedSegmentSection;
  title: string;
  durationMinutes: number;
  notes: string;
}

export interface ShowSeriesTemplate {
  id: string;
  name: string;
  expectedMinutes: number;
  preShowMinutes: number;
  mainShowMinutes: number;
  postShowMinutes: number;
  productionNotes: string;
  slots: SeriesTemplateSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface ShowSeries {
  id: string;
  name: string;
  company: string;
  brand: string;
  category: ShowSeriesCategory;
  status: ShowSeriesStatus;
  defaultMinutes: number;
  recurrence: ShowRecurrenceKind;
  intervalDays: number;
  defaultDayOfWeek: number;
  startDate: string;
  endDate: string;
  startingEpisodeNumber: number;
  namingPattern: string;
  defaultVenue: string;
  venueMode: VenueMode;
  productionNotes: string;
  templateId: string;
  competitionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleShowLink {
  id: string;
  showId: string;
  seriesId: string;
  episodeNumber: number;
  generatedSessionId: string;
  originalDate: string;
  generatedFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleExclusion {
  id: string;
  seriesId: string;
  date: string;
  reason: string;
  createdAt: string;
}

export interface ScheduleException {
  id: string;
  seriesId: string;
  showId: string;
  type: ScheduleExceptionType;
  originalDate: string;
  newDate: string;
  note: string;
  createdAt: string;
}

export interface SchedulePreviewItem {
  id: string;
  seriesId: string;
  date: string;
  showName: string;
  episodeNumber: number;
  status: SchedulePreviewStatus;
  existingShowId: string;
  conflictShowIds: string[];
  reason: string;
}

export interface ScheduleGenerationSession {
  id: string;
  seriesId: string;
  mode: ScheduleGenerationMode;
  requestedCount: number;
  throughDate: string;
  createdAt: string;
  appliedAt: string;
  generatedShowIds: string[];
  skippedDates: string[];
  conflicts: string[];
}

export interface ContinuityDecision {
  id: string;
  obligationKey: string;
  showId: string;
  status: BookingObligationDecisionStatus;
  targetShowId: string;
  targetSegmentId: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCalendarSettings {
  activeView: CalendarViewMode;
  selectedShowId: string;
  selectedSeriesId: string;
  selectedTemplateId: string;
  month: string;
  listFilter: "All" | PromotionShowStage;
}

export interface PromotionScheduleUniverse {
  series: ShowSeries[];
  templates: ShowSeriesTemplate[];
  links: ScheduleShowLink[];
  exclusions: ScheduleExclusion[];
  exceptions: ScheduleException[];
  generationSessions: ScheduleGenerationSession[];
  continuityDecisions: ContinuityDecision[];
  settings: PromotionCalendarSettings;
}

export interface ScheduleGenerationOptions {
  mode: "count" | "through-date";
  count: number;
  throughDate: string;
}

export interface BookingObligation {
  key: string;
  kind: BookingObligationKind;
  title: string;
  detail: string;
  sourceShowId: string;
  sourceSegmentId: string;
  sourceStorylineId: string;
  sourceWorkerId: string;
  sourceIdeaId: string;
  sourceChampionshipId: string;
  sourceCompetitionId: string;
  sourceFixtureId: string;
  dueDate: string;
  priority: "Blocking" | "Important" | "Informational";
}

export interface CalendarIntegrityIssue {
  id: string;
  severity: "Blocking" | "Important" | "Informational";
  message: string;
  detail: string;
  showId: string;
  seriesId: string;
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
}
