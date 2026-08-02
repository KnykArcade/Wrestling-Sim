import { emptyPromotionScheduleUniverse } from "./model";
import type {
  CalendarViewMode,
  ContinuityDecision,
  PromotionScheduleUniverse,
  PromotionShowStage,
  ScheduleException,
  ScheduleExclusion,
  ScheduleGenerationSession,
  ScheduleShowLink,
  SeriesTemplateSlot,
  ShowSeries,
  ShowSeriesCategory,
  ShowSeriesStatus,
  ShowSeriesTemplate,
  ShowRecurrenceKind,
  VenueMode,
} from "./types";

export const PROMOTION_SCHEDULE_STORAGE_KEY = "tew-story-tracker:promotion-schedule:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

const seriesCategories: ShowSeriesCategory[] = ["Weekly Television", "Biweekly Television", "Monthly Event", "Premium Event", "Competition Event", "Special", "One-Off", "Custom"];
const seriesStatuses: ShowSeriesStatus[] = ["Active", "Paused", "Completed", "Inactive"];
const recurrenceKinds: ShowRecurrenceKind[] = ["Weekly", "Biweekly", "Monthly", "Interval Days", "One-Off"];
const venueModes: VenueMode[] = ["Fixed", "Manual Per Show"];
const calendarViews: CalendarViewMode[] = ["month", "list", "series", "templates", "obligations"];
const promotionStages: Array<"All" | PromotionShowStage> = ["All", "Scheduled", "Card Started", "Creative In Progress", "Ready for TEW", "Entering in TEW", "Awaiting Results", "Reconciliation Needed", "Reconciled", "Reconciled — Wrap-Up Pending", "Reconciled — Closed"];

function normalizeSlot(value: unknown): SeriesTemplateSlot | null {
  if (!isRecord(value) || !text(value.id) || (value.type !== "match" && value.type !== "angle")) return null;
  const section = value.section === "Pre-Show" || value.section === "Post-Show" ? value.section : "Main Show";
  return {
    id: text(value.id),
    type: value.type,
    section,
    title: text(value.title, value.type === "match" ? "Match Slot" : "Angle Slot"),
    durationMinutes: Math.max(1, numberValue(value.durationMinutes, value.type === "match" ? 12 : 5)),
    notes: text(value.notes),
  };
}

function normalizeTemplate(value: unknown): ShowSeriesTemplate | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: text(value.id),
    name: text(value.name, "Untitled Show Template"),
    expectedMinutes: Math.max(15, numberValue(value.expectedMinutes, 120)),
    preShowMinutes: Math.max(0, numberValue(value.preShowMinutes)),
    mainShowMinutes: Math.max(0, numberValue(value.mainShowMinutes, 120)),
    postShowMinutes: Math.max(0, numberValue(value.postShowMinutes)),
    productionNotes: text(value.productionNotes),
    slots: Array.isArray(value.slots) ? value.slots.map(normalizeSlot).filter((item): item is SeriesTemplateSlot => item !== null) : [],
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeSeries(value: unknown): ShowSeries | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: text(value.id),
    name: text(value.name, "Untitled Show Series"),
    company: text(value.company),
    brand: text(value.brand),
    category: enumValue(value.category, seriesCategories, "Weekly Television"),
    status: enumValue(value.status, seriesStatuses, "Active"),
    defaultMinutes: Math.max(15, numberValue(value.defaultMinutes, 60)),
    recurrence: enumValue(value.recurrence, recurrenceKinds, "Weekly"),
    intervalDays: Math.max(1, numberValue(value.intervalDays, 7)),
    defaultDayOfWeek: Math.max(0, Math.min(6, Math.floor(numberValue(value.defaultDayOfWeek)))),
    startDate: text(value.startDate),
    endDate: text(value.endDate),
    startingEpisodeNumber: Math.max(1, Math.floor(numberValue(value.startingEpisodeNumber, 1))),
    namingPattern: text(value.namingPattern, "{series} #{episode}"),
    defaultVenue: text(value.defaultVenue),
    venueMode: enumValue(value.venueMode, venueModes, "Manual Per Show"),
    productionNotes: text(value.productionNotes),
    templateId: text(value.templateId),
    competitionId: text(value.competitionId),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeLink(value: unknown): ScheduleShowLink | null {
  if (!isRecord(value) || !text(value.id) || !text(value.showId)) return null;
  return {
    id: text(value.id),
    showId: text(value.showId),
    seriesId: text(value.seriesId),
    episodeNumber: Math.max(0, Math.floor(numberValue(value.episodeNumber))),
    generatedSessionId: text(value.generatedSessionId),
    originalDate: text(value.originalDate),
    generatedFingerprint: text(value.generatedFingerprint),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeExclusion(value: unknown): ScheduleExclusion | null {
  if (!isRecord(value) || !text(value.id) || !text(value.seriesId) || !text(value.date)) return null;
  return { id: text(value.id), seriesId: text(value.seriesId), date: text(value.date), reason: text(value.reason), createdAt: text(value.createdAt) };
}

function normalizeException(value: unknown): ScheduleException | null {
  if (!isRecord(value) || !text(value.id)) return null;
  const types: ScheduleException["type"][] = ["Skipped", "Rescheduled", "Inserted Special", "Replaced", "Manual Edit"];
  return {
    id: text(value.id),
    seriesId: text(value.seriesId),
    showId: text(value.showId),
    type: enumValue(value.type, types, "Manual Edit"),
    originalDate: text(value.originalDate),
    newDate: text(value.newDate),
    note: text(value.note),
    createdAt: text(value.createdAt),
  };
}

function normalizeGeneration(value: unknown): ScheduleGenerationSession | null {
  if (!isRecord(value) || !text(value.id) || !text(value.seriesId)) return null;
  const modes: ScheduleGenerationSession["mode"][] = ["count", "through-date", "regenerate"];
  return {
    id: text(value.id),
    seriesId: text(value.seriesId),
    mode: enumValue(value.mode, modes, "count"),
    requestedCount: Math.max(0, Math.floor(numberValue(value.requestedCount))),
    throughDate: text(value.throughDate),
    createdAt: text(value.createdAt),
    appliedAt: text(value.appliedAt),
    generatedShowIds: strings(value.generatedShowIds),
    skippedDates: strings(value.skippedDates),
    conflicts: strings(value.conflicts),
  };
}

function normalizeDecision(value: unknown): ContinuityDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.obligationKey) || !text(value.showId)) return null;
  const statuses: ContinuityDecision["status"][] = ["Added as Match", "Added as Angle", "Attached to Segment", "Deferred", "Addressed", "Dismissed"];
  return {
    id: text(value.id),
    obligationKey: text(value.obligationKey),
    showId: text(value.showId),
    status: enumValue(value.status, statuses, "Addressed"),
    targetShowId: text(value.targetShowId),
    targetSegmentId: text(value.targetSegmentId),
    reason: text(value.reason),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

export function parsePromotionScheduleUniverse(value: unknown): PromotionScheduleUniverse {
  const defaults = emptyPromotionScheduleUniverse();
  if (!isRecord(value)) return defaults;
  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    series: Array.isArray(value.series) ? value.series.map(normalizeSeries).filter((item): item is ShowSeries => item !== null) : [],
    templates: Array.isArray(value.templates) ? value.templates.map(normalizeTemplate).filter((item): item is ShowSeriesTemplate => item !== null) : [],
    links: Array.isArray(value.links) ? value.links.map(normalizeLink).filter((item): item is ScheduleShowLink => item !== null) : [],
    exclusions: Array.isArray(value.exclusions) ? value.exclusions.map(normalizeExclusion).filter((item): item is ScheduleExclusion => item !== null) : [],
    exceptions: Array.isArray(value.exceptions) ? value.exceptions.map(normalizeException).filter((item): item is ScheduleException => item !== null) : [],
    generationSessions: Array.isArray(value.generationSessions) ? value.generationSessions.map(normalizeGeneration).filter((item): item is ScheduleGenerationSession => item !== null) : [],
    continuityDecisions: Array.isArray(value.continuityDecisions) ? value.continuityDecisions.map(normalizeDecision).filter((item): item is ContinuityDecision => item !== null) : [],
    settings: {
      activeView: enumValue(settings.activeView, calendarViews, defaults.settings.activeView),
      selectedShowId: text(settings.selectedShowId),
      selectedSeriesId: text(settings.selectedSeriesId),
      selectedTemplateId: text(settings.selectedTemplateId),
      month: /^\d{4}-\d{2}$/.test(text(settings.month)) ? text(settings.month) : defaults.settings.month,
      listFilter: enumValue(settings.listFilter, promotionStages, "All"),
    },
  };
}

export function loadPromotionScheduleUniverse(storage: Pick<Storage, "getItem">): PromotionScheduleUniverse {
  const raw = storage.getItem(PROMOTION_SCHEDULE_STORAGE_KEY);
  if (!raw) return emptyPromotionScheduleUniverse();
  try { return parsePromotionScheduleUniverse(JSON.parse(raw) as unknown); } catch { return emptyPromotionScheduleUniverse(); }
}

export function savePromotionScheduleUniverse(storage: Pick<Storage, "setItem">, universe: PromotionScheduleUniverse): void {
  storage.setItem(PROMOTION_SCHEDULE_STORAGE_KEY, JSON.stringify(universe));
}
