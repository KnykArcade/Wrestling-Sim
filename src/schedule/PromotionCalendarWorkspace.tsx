import { useEffect, useMemo, useState } from "react";
import { loadChampionshipUniverse } from "../championships/storage";
import type { ChampionshipUniverse } from "../championships/types";
import { loadCreativeControlData } from "../control/storage";
import type { CreativeControlData } from "../control/types";
import { addFixtureToPlannedShow } from "../competitions/model";
import { loadCompetitionUniverse, saveCompetitionUniverse } from "../competitions/storage";
import type { Competition, CompetitionUniverse } from "../competitions/types";
import { operationsRecord as getOperationsRecord } from "../operations/model";
import { loadShowOperationsUniverse } from "../operations/storage";
import { loadOutputLibraryUniverse } from "../outputLibrary/storage";
import { createPlannerId, touchShow } from "../planner/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import { showSessionRecord, buildUnifiedShowSessionSummary } from "../showSession/model";
import { loadShowSessionUniverse, saveShowSessionUniverse } from "../showSession/storage";
import type { UnifiedShowSessionSummary } from "../showSession/types";
import { loadTrackerStorylines } from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import { loadTransferUniverse } from "../transfer/storage";
import { loadWorkerUniverse } from "../workers/storage";
import type { WorkerUniverse } from "../workers/types";
import {
  addDateMonths,
  addSeriesExclusion,
  applySeriesGeneration,
  attachObligationToSegment,
  buildBookingObligations,
  buildCalendarIntegrityIssues,
  createContinuityDecision,
  createShowSeries,
  createShowSeriesTemplate,
  createTemplateSlot,
  deleteSeriesKeepShows,
  derivePromotionShowStage,
  ensureScheduleLinks,
  formatSeriesShowName,
  insertOneOffShow,
  linkForShow,
  monthCalendarDays,
  obligationToSegment,
  previewSeriesGeneration,
  previewSeriesRegeneration,
  removeSeriesExclusion,
  rescheduleShow,
  seriesForShow,
  showFingerprint,
  todayDate,
  touchShowSeries,
  touchShowSeriesTemplate,
  upsertContinuityDecision,
} from "./model";
import { loadPromotionScheduleUniverse, savePromotionScheduleUniverse } from "./storage";
import type {
  BookingObligation,
  CalendarViewMode,
  PromotionScheduleUniverse,
  PromotionShowStage,
  ScheduleGenerationOptions,
  SchedulePreviewItem,
  ShowSeries,
  ShowSeriesTemplate,
} from "./types";

interface PromotionCalendarWorkspaceProps {
  onOpenShowSession: (showId: string) => void;
  onOpenPlannedShow: (showId: string, segmentId: string) => void;
  onOpenControl: () => void;
  onOpenStorylines: () => void;
  onOpenWorkers: () => void;
  onOpenChampionships: () => void;
  onOpenCompetitions: () => void;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const stageOrder: PromotionShowStage[] = ["Scheduled", "Card Started", "Creative In Progress", "Ready for TEW", "Entering in TEW", "Awaiting Results", "Reconciliation Needed", "Reconciled"];

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatDisplayDate(value: string): string {
  if (!value) return "Unscheduled";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function monthLabel(value: string): string {
  const date = new Date(`${value}-01T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function seriesLabel(series: ShowSeries | null, episodeNumber = 0): string {
  if (!series) return "One-Off / Unassigned Series";
  return `${series.name}${episodeNumber > 0 ? ` · Episode ${episodeNumber}` : ""}`;
}

function templateSlotTotal(template: ShowSeriesTemplate | null): number {
  return template?.slots.reduce((total, slot) => total + slot.durationMinutes, 0) ?? 0;
}

function sourceActionLabel(obligation: BookingObligation): string {
  if (obligation.kind === "Storyline Milestone") return "Open Storyline Hub";
  if (obligation.kind === "Character Arc") return "Open Worker Hub";
  if (obligation.kind === "Booking Idea") return "Open Control Center";
  if (obligation.kind === "Championship Program" || obligation.kind === "Vacant Championship") return "Open Championships";
  if (obligation.kind === "Competition Fixture") return "Open Competitions";
  return "Open Source Show";
}

export default function PromotionCalendarWorkspace({
  onOpenShowSession,
  onOpenPlannedShow,
  onOpenControl,
  onOpenStorylines,
  onOpenWorkers,
  onOpenChampionships,
  onOpenCompetitions,
}: PromotionCalendarWorkspaceProps) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [schedule, setSchedule] = useState<PromotionScheduleUniverse>(() => ensureScheduleLinks(loadPlannedShows(window.localStorage), loadPromotionScheduleUniverse(window.localStorage)));
  const [competitions, setCompetitions] = useState<CompetitionUniverse>(() => loadCompetitionUniverse(window.localStorage));
  const [control] = useState<CreativeControlData>(() => loadCreativeControlData(window.localStorage));
  const [storylines] = useState<TrackerStoryline[]>(() => loadTrackerStorylines(window.localStorage));
  const [workers] = useState<WorkerUniverse>(() => loadWorkerUniverse(window.localStorage));
  const [championships] = useState<ChampionshipUniverse>(() => loadChampionshipUniverse(window.localStorage));
  const [operations] = useState(() => loadShowOperationsUniverse(window.localStorage));
  const [outputLibrary] = useState(() => loadOutputLibraryUniverse(window.localStorage));
  const [transfer] = useState(() => loadTransferUniverse(window.localStorage));
  const [sessions] = useState(() => loadShowSessionUniverse(window.localStorage));
  const [preview, setPreview] = useState<SchedulePreviewItem[]>([]);
  const [generationMode, setGenerationMode] = useState<ScheduleGenerationOptions["mode"]>("count");
  const [generationCount, setGenerationCount] = useState(8);
  const [throughDate, setThroughDate] = useState("");
  const [exclusionDate, setExclusionDate] = useState("");
  const [exclusionReason, setExclusionReason] = useState("");
  const [specialName, setSpecialName] = useState("");
  const [specialDate, setSpecialDate] = useState(todayDate());
  const [specialCompany, setSpecialCompany] = useState("");
  const [specialVenue, setSpecialVenue] = useState("");
  const [specialMinutes, setSpecialMinutes] = useState(180);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [selectedObligationKey, setSelectedObligationKey] = useState("");
  const [obligationTargetSegmentId, setObligationTargetSegmentId] = useState("");
  const [deferShowId, setDeferShowId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => savePromotionScheduleUniverse(window.localStorage, schedule), [schedule]);
  useEffect(() => saveCompetitionUniverse(window.localStorage, competitions), [competitions]);
  useEffect(() => setSchedule((current) => ensureScheduleLinks(shows, current)), [shows]);

  const selectedShow = shows.find((show) => show.id === schedule.settings.selectedShowId) ?? shows[0] ?? null;
  const selectedSeries = schedule.series.find((series) => series.id === schedule.settings.selectedSeriesId) ?? schedule.series[0] ?? null;
  const selectedTemplate = schedule.templates.find((template) => template.id === schedule.settings.selectedTemplateId) ?? schedule.templates[0] ?? null;

  useEffect(() => {
    setRescheduleDate(selectedShow?.date ?? "");
    setRescheduleNote("");
    setObligationTargetSegmentId(selectedShow?.segments[0]?.id ?? "");
    setDeferShowId(shows.find((show) => selectedShow && show.date > selectedShow.date && show.status !== "Reconciled")?.id ?? "");
  }, [selectedShow?.id]);

  const summaries = useMemo(() => {
    const values = new Map<string, UnifiedShowSessionSummary>();
    shows.forEach((show) => {
      const record = showSessionRecord(show.id, sessions, show.segments[0]?.id ?? "");
      values.set(show.id, buildUnifiedShowSessionSummary({
        show,
        session: record,
        outputLibrary,
        transfer,
        operationsRecord: getOperationsRecord(show.id, operations),
      }));
    });
    return values;
  }, [shows, sessions, outputLibrary, transfer, operations]);

  const stageByShow = useMemo(() => new Map(shows.map((show) => [show.id, derivePromotionShowStage(show, summaries.get(show.id) ?? null)])), [shows, summaries]);
  const stageCounts = useMemo(() => new Map(stageOrder.map((stage) => [stage, shows.filter((show) => stageByShow.get(show.id) === stage).length])), [shows, stageByShow]);
  const calendarDays = useMemo(() => monthCalendarDays(schedule.settings.month), [schedule.settings.month]);
  const showsByDate = useMemo(() => {
    const map = new Map<string, PlannedShow[]>();
    shows.forEach((show) => map.set(show.date, [...(map.get(show.date) ?? []), show]));
    return map;
  }, [shows]);
  const visibleShows = useMemo(() => shows
    .filter((show) => schedule.settings.listFilter === "All" || stageByShow.get(show.id) === schedule.settings.listFilter)
    .sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name)), [shows, schedule.settings.listFilter, stageByShow]);
  const integrityIssues = useMemo(() => buildCalendarIntegrityIssues(schedule, shows, competitions, storylines, control.ideas), [schedule, shows, competitions, storylines, control.ideas]);
  const obligations = useMemo(() => selectedShow ? buildBookingObligations({
    targetShow: selectedShow,
    shows,
    storylines,
    workers,
    ideas: control.ideas,
    championships,
    competitions,
    operations,
    decisions: schedule.continuityDecisions,
  }) : [], [selectedShow, shows, storylines, workers, control.ideas, championships, competitions, operations, schedule.continuityDecisions]);
  const readyFixtures = useMemo(() => competitions.competitions.flatMap((competition) => competition.fixtures
    .filter((fixture) => !fixture.plannedSegmentId && fixture.participantAId && fixture.participantBId && ["Unscheduled", "Scheduled"].includes(fixture.status))
    .map((fixture) => ({ competition, fixture }))), [competitions]);

  function updateSettings(patch: Partial<PromotionScheduleUniverse["settings"]>): void {
    setSchedule((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function selectShow(showId: string): void {
    updateSettings({ selectedShowId: showId });
    const show = shows.find((item) => item.id === showId);
    if (show) setObligationTargetSegmentId(show.segments[0]?.id ?? "");
  }

  function createSeries(televisionPreset = false): void {
    let templateId = "";
    setSchedule((current) => {
      const templates = televisionPreset
        ? [...current.templates, createShowSeriesTemplate(current.templates.length + 1, true)]
        : current.templates;
      templateId = televisionPreset ? templates.at(-1)!.id : "";
      const series = {
        ...createShowSeries(current.series.length + 1),
        templateId,
        defaultMinutes: televisionPreset ? 60 : 60,
      };
      return {
        ...current,
        templates,
        series: [...current.series, series],
        settings: { ...current.settings, selectedSeriesId: series.id, selectedTemplateId: templateId, activeView: "series" },
      };
    });
    setPreview([]);
    setNotice(televisionPreset ? "Created a reusable weekly 60-minute television series and structural template." : "Created a new show series.");
  }

  function updateSeries(patch: Partial<ShowSeries>): void {
    if (!selectedSeries) return;
    setSchedule((current) => ({
      ...current,
      series: current.series.map((series) => series.id === selectedSeries.id ? touchShowSeries({ ...series, ...patch }) : series),
    }));
    setPreview([]);
  }

  function buildPreview(): void {
    if (!selectedSeries) return;
    const options: ScheduleGenerationOptions = { mode: generationMode, count: generationCount, throughDate };
    setPreview(previewSeriesGeneration(selectedSeries, schedule, shows, options));
    setNotice("Schedule preview created. Existing edited shows and date conflicts remain protected.");
  }

  function buildRegenerationPreview(): void {
    if (!selectedSeries) return;
    setPreview(previewSeriesRegeneration(selectedSeries, schedule, shows));
    setNotice("Existing generated episodes were inspected. Manually edited shows will not be overwritten.");
  }

  function applyPreview(): void {
    if (!selectedSeries || preview.length === 0) return;
    const options: ScheduleGenerationOptions = { mode: generationMode, count: generationCount, throughDate };
    const result = applySeriesGeneration(selectedSeries, schedule, shows, preview, options);
    setShows(result.shows);
    setSchedule(result.universe);
    setPreview([]);
    setNotice(`${result.session.generatedShowIds.length} show${result.session.generatedShowIds.length === 1 ? "" : "s"} created. Conflicts and excluded dates were skipped.`);
  }

  function addExclusion(): void {
    if (!selectedSeries || !exclusionDate) return;
    setSchedule((current) => addSeriesExclusion(current, selectedSeries.id, exclusionDate, exclusionReason));
    setExclusionDate("");
    setExclusionReason("");
    setPreview([]);
    setNotice("Excluded date saved. It will appear in the next generation preview without consuming an episode number.");
  }

  function addSpecial(): void {
    const result = insertOneOffShow(schedule, shows, {
      name: specialName,
      date: specialDate,
      company: specialCompany,
      showType: "Premium Event",
      venue: specialVenue,
      expectedMinutes: specialMinutes,
      note: "Inserted manually from Promotion Calendar.",
    });
    setShows(result.shows);
    setSchedule(result.universe);
    setSpecialName("");
    setNotice(`${result.show.name} was inserted as a one-off event without changing any recurring series.`);
  }

  function performReschedule(): void {
    if (!selectedShow || !rescheduleDate) return;
    const result = rescheduleShow(schedule, shows, selectedShow.id, rescheduleDate, rescheduleNote);
    setShows(result.shows);
    setSchedule(result.universe);
    setNotice(selectedShow.status === "Reconciled" ? "Reconciled history cannot be rescheduled." : `${selectedShow.name} moved to ${rescheduleDate}. The original date remains in the schedule exception history.`);
  }

  function createTemplate(televisionPreset = false): void {
    const template = createShowSeriesTemplate(schedule.templates.length + 1, televisionPreset);
    setSchedule((current) => ({
      ...current,
      templates: [...current.templates, template],
      settings: { ...current.settings, selectedTemplateId: template.id, activeView: "templates" },
    }));
    setNotice(televisionPreset ? "Created a 60-minute television structure with blank booking slots." : "Created a blank show template.");
  }

  function updateTemplate(patch: Partial<ShowSeriesTemplate>): void {
    if (!selectedTemplate) return;
    setSchedule((current) => ({
      ...current,
      templates: current.templates.map((template) => template.id === selectedTemplate.id ? touchShowSeriesTemplate({ ...template, ...patch }) : template),
    }));
  }

  function updateTemplateSlot(slotId: string, patch: Partial<ShowSeriesTemplate["slots"][number]>): void {
    if (!selectedTemplate) return;
    updateTemplate({ slots: selectedTemplate.slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot) });
  }

  function moveTemplateSlot(slotId: string, direction: -1 | 1): void {
    if (!selectedTemplate) return;
    const index = selectedTemplate.slots.findIndex((slot) => slot.id === slotId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= selectedTemplate.slots.length) return;
    const slots = [...selectedTemplate.slots];
    [slots[index], slots[destination]] = [slots[destination], slots[index]];
    updateTemplate({ slots });
  }

  function deleteTemplate(): void {
    if (!selectedTemplate) return;
    setSchedule((current) => ({
      ...current,
      templates: current.templates.filter((template) => template.id !== selectedTemplate.id),
      series: current.series.map((series) => series.templateId === selectedTemplate.id ? { ...series, templateId: "", updatedAt: new Date().toISOString() } : series),
      settings: { ...current.settings, selectedTemplateId: "" },
    }));
    setNotice("Template removed. Existing shows and cards were not changed.");
  }

  function openShowSession(showId: string): void {
    const sessionUniverse = loadShowSessionUniverse(window.localStorage);
    const show = shows.find((item) => item.id === showId);
    if (!show) return;
    const record = showSessionRecord(show.id, sessionUniverse, show.segments[0]?.id ?? "");
    saveShowSessionUniverse(window.localStorage, {
      records: sessionUniverse.records.some((item) => item.showId === show.id)
        ? sessionUniverse.records.map((item) => item.showId === show.id ? { ...record, activeStep: "overview", lastOpenedAt: new Date().toISOString() } : item)
        : [{ ...record, activeStep: "overview", lastOpenedAt: new Date().toISOString() }, ...sessionUniverse.records],
      lastShowId: show.id,
    });
    const nextSchedule = { ...schedule, settings: { ...schedule.settings, selectedShowId: show.id } };
    savePromotionScheduleUniverse(window.localStorage, nextSchedule);
    setSchedule(nextSchedule);
    onOpenShowSession(show.id);
  }

  function recordDecision(obligation: BookingObligation, status: Parameters<typeof createContinuityDecision>[2], targetShowId = "", targetSegmentId = "", reason = ""): void {
    setSchedule((current) => upsertContinuityDecision(current, createContinuityDecision(obligation.key, selectedShow?.id ?? "", status, targetShowId, targetSegmentId, reason)));
    setSelectedObligationKey("");
    setDecisionReason("");
  }

  function enrichedSegment(obligation: BookingObligation, type: "match" | "angle"): PlannedSegment {
    let segment = obligationToSegment(obligation, type);
    const idea = control.ideas.find((item) => item.id === obligation.sourceIdeaId);
    if (idea) {
      segment = {
        ...segment,
        title: idea.title,
        notes: idea.concept || segment.notes,
        purpose: idea.creativePurpose,
        consequences: idea.plannedConsequences,
        followUp: idea.followUp,
        privateNotes: [idea.privateNotes, segment.privateNotes].filter(Boolean).join("\n\n"),
        workers: idea.workers.map((worker, index) => ({
          id: worker.id || createPlannerId(),
          name: worker.name,
          role: worker.role || (type === "match" ? "Competitor" : "Participant"),
          side: type === "match" ? (index % 2 === 0 ? "Side 1" : "Side 2") : "",
          source: "manual",
        })),
        storylines: idea.storylines.map((storyline) => ({ id: storyline.id || createPlannerId(), name: storyline.name, source: "manual" })),
        championship: type === "match" ? idea.championship : "",
        matchStory: type === "match" ? idea.concept : "",
        segmentOutput: type === "angle" ? idea.concept : "",
        bookingIdeaId: idea.id,
      };
    }
    const championship = championships.championships.find((item) => item.id === obligation.sourceChampionshipId);
    if (championship && type === "match") segment = { ...segment, championshipId: championship.id, championship: championship.name };
    return segment;
  }

  function addObligation(obligation: BookingObligation, type: "match" | "angle"): void {
    if (!selectedShow) return;
    if (obligation.kind === "Competition Fixture") {
      const competition = competitions.competitions.find((item) => item.id === obligation.sourceCompetitionId);
      if (!competition) return;
      const result = addFixtureToPlannedShow(competition, obligation.sourceFixtureId, selectedShow.id, shows);
      if (!result.created) {
        setNotice("The competition fixture could not be scheduled. It may already be linked or may not have both participants.");
        return;
      }
      setShows(result.shows);
      setCompetitions((current) => ({ ...current, competitions: current.competitions.map((item) => item.id === competition.id ? result.competition : item) }));
      recordDecision(obligation, "Added as Match", selectedShow.id, result.segmentId);
      setNotice(`${obligation.title} was added to ${selectedShow.name}.`);
      return;
    }
    const segment = enrichedSegment(obligation, type);
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, segments: [...show.segments, segment] }) : show));
    recordDecision(obligation, type === "match" ? "Added as Match" : "Added as Angle", selectedShow.id, segment.id);
    setNotice(`${obligation.title} was added as a grounded ${type}. No winner, finish, or dialogue was invented.`);
  }

  function attachObligation(obligation: BookingObligation): void {
    if (!selectedShow || !obligationTargetSegmentId) return;
    const target = selectedShow.segments.find((segment) => segment.id === obligationTargetSegmentId);
    if (!target) return;
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({
      ...show,
      segments: show.segments.map((segment) => segment.id === target.id ? attachObligationToSegment(segment, obligation) : segment),
    }) : show));
    recordDecision(obligation, "Attached to Segment", selectedShow.id, target.id);
    setNotice(`${obligation.title} was attached to ${target.title}.`);
  }

  function deferObligation(obligation: BookingObligation): void {
    if (!selectedShow || !deferShowId) return;
    recordDecision(obligation, "Deferred", deferShowId, "", decisionReason);
    setNotice(`${obligation.title} was assigned to a later scheduled show.`);
  }

  function openObligationSource(obligation: BookingObligation): void {
    if (obligation.kind === "Storyline Milestone") onOpenStorylines();
    else if (obligation.kind === "Character Arc") onOpenWorkers();
    else if (obligation.kind === "Booking Idea") onOpenControl();
    else if (obligation.kind === "Championship Program" || obligation.kind === "Vacant Championship") onOpenChampionships();
    else if (obligation.kind === "Competition Fixture") onOpenCompetitions();
    else if (obligation.sourceShowId) onOpenPlannedShow(obligation.sourceShowId, obligation.sourceSegmentId);
  }

  function scheduleFixture(competition: Competition, fixtureId: string): void {
    if (!selectedShow) return;
    const result = addFixtureToPlannedShow(competition, fixtureId, selectedShow.id, shows);
    if (!result.created) {
      setNotice("The fixture was not added. Confirm that both participants are known and it is not already scheduled.");
      return;
    }
    setShows(result.shows);
    setCompetitions((current) => ({ ...current, competitions: current.competitions.map((item) => item.id === competition.id ? result.competition : item) }));
    setNotice(`Competition fixture added to ${selectedShow.name}.`);
  }

  const selectedLink = selectedShow ? linkForShow(selectedShow.id, schedule) : null;
  const selectedShowSeries = selectedShow ? seriesForShow(selectedShow.id, schedule) : null;
  const selectedStage = selectedShow ? stageByShow.get(selectedShow.id) ?? "Scheduled" : "Scheduled";
  const selectedSummary = selectedShow ? summaries.get(selectedShow.id) ?? null : null;
  const activeView = schedule.settings.activeView;

  return <section className="promotion-calendar-workspace">
    <header className="promotion-calendar-hero">
      <div><p className="eyebrow">PROMOTION SCHEDULE</p><h2>Promotion Calendar, recurring show series, and the weekly booking pipeline</h2><p>Schedule PWL Power Hour, annual premium events, Cups, League fixtures, and Classics around the unified Show Session. The calendar surfaces obligations; it never invents booking decisions or TEW results.</p></div>
      <div className="promotion-calendar-safety"><span>TEW authority</span><strong>Calendar and creative companion</strong><small>No MDB or ACCDB writing. TEW remains authoritative for actual results and ratings.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <nav className="promotion-calendar-tabs" aria-label="Promotion Calendar sections">
      {(["month", "list", "series", "templates", "obligations"] as CalendarViewMode[]).map((view) => <button key={view} type="button" className={activeView === view ? "active" : ""} onClick={() => updateSettings({ activeView: view })}>{view === "month" ? "Monthly Calendar" : view === "list" ? "Booking Pipeline" : view === "series" ? "Show Series" : view === "templates" ? "Show Templates" : "Booking Obligations"}</button>)}
    </nav>

    <section className="promotion-pipeline-strip" aria-label="Promotion booking pipeline">
      {stageOrder.map((stage) => <button type="button" key={stage} onClick={() => { updateSettings({ activeView: "list", listFilter: stage }); }}><span>{stage}</span><strong>{stageCounts.get(stage) ?? 0}</strong></button>)}
    </section>

    {activeView === "month" && <div className="promotion-calendar-layout">
      <main className="promotion-month-panel">
        <header className="promotion-month-header"><button className="secondary-button" type="button" onClick={() => updateSettings({ month: addDateMonths(`${schedule.settings.month}-01`, -1).slice(0, 7) })}>Previous Month</button><div><p className="eyebrow">MONTHLY CALENDAR</p><h3>{monthLabel(schedule.settings.month)}</h3></div><button className="secondary-button" type="button" onClick={() => updateSettings({ month: addDateMonths(`${schedule.settings.month}-01`, 1).slice(0, 7) })}>Next Month</button></header>
        <div className="promotion-month-weekdays">{dayNames.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}</div>
        <div className="promotion-month-grid">{calendarDays.map((day) => <article key={day.date} className={day.inMonth ? "" : "outside-month"}><header><span>{Number(day.date.slice(-2))}</span></header>{(showsByDate.get(day.date) ?? []).map((show) => <button key={show.id} type="button" className={`calendar-show-chip stage--${statusClass(stageByShow.get(show.id) ?? "Scheduled")} ${selectedShow?.id === show.id ? "selected" : ""}`} onClick={() => selectShow(show.id)}><strong>{show.name}</strong><small>{stageByShow.get(show.id)}</small></button>)}</article>)}</div>
      </main>
      <aside className="promotion-show-detail">
        <header><div><p className="eyebrow">SELECTED SHOW</p><h3>{selectedShow?.name ?? "No show selected"}</h3><p>{selectedShow ? formatDisplayDate(selectedShow.date) : "Create or generate a show to begin."}</p></div>{selectedShow && <span className={`promotion-stage-badge stage--${statusClass(selectedStage)}`}>{selectedStage}</span>}</header>
        {selectedShow ? <>
          <dl className="promotion-show-facts"><div><dt>Series</dt><dd>{seriesLabel(selectedShowSeries, selectedLink?.episodeNumber)}</dd></div><div><dt>Runtime</dt><dd>{selectedSummary?.plannedMinutes ?? 0}/{selectedShow.expectedMinutes} minutes</dd></div><div><dt>Card</dt><dd>{selectedShow.segments.length} segments</dd></div><div><dt>TEW Entry</dt><dd>{selectedSummary?.entryComplete ?? 0}/{selectedSummary?.segmentCount ?? 0}</dd></div></dl>
          <div className="promotion-show-actions"><button className="primary-button" type="button" onClick={() => openShowSession(selectedShow.id)}>Open Show Session</button><button className="secondary-button" type="button" onClick={() => onOpenPlannedShow(selectedShow.id, selectedShow.segments[0]?.id ?? "")}>Edit Card / Add Match</button><button className="secondary-button" type="button" onClick={() => updateSettings({ activeView: "obligations" })}>{obligations.length} Booking Obligation{obligations.length === 1 ? "" : "s"}</button></div>
          <section className="promotion-reschedule"><h4>Reschedule this show</h4><label className="field"><span>New date</span><input aria-label="Calendar reschedule date" type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label><label className="field"><span>Reason / exception note</span><textarea aria-label="Calendar reschedule reason" rows={2} value={rescheduleNote} onChange={(event) => setRescheduleNote(event.target.value)} /></label><button className="secondary-button" type="button" disabled={selectedShow.status === "Reconciled" || !rescheduleDate} onClick={performReschedule}>Save Schedule Exception</button></section>
          <section className="promotion-fixture-list"><header><h4>Ready Competition Fixtures</h4><span>{readyFixtures.length}</span></header>{readyFixtures.length === 0 ? <p>No unscheduled fixture currently has both participants confirmed.</p> : readyFixtures.slice(0, 8).map(({ competition, fixture }) => <article key={fixture.id}><div><strong>{competition.name} · {fixture.roundLabel}</strong><span>{competition.participants.find((item) => item.id === fixture.participantAId)?.name ?? "TBD"} vs {competition.participants.find((item) => item.id === fixture.participantBId)?.name ?? "TBD"}</span></div><button className="secondary-button" type="button" onClick={() => scheduleFixture(competition, fixture.id)}>Add to Selected Show</button></article>)}</section>
        </> : <div className="empty-state compact">No planned show is available.</div>}
      </aside>
      <section className="promotion-special-form"><header><div><p className="eyebrow">INSERT EVENT</p><h3>Add a one-off premium event or special</h3></div><span>Does not alter recurring series</span></header><div className="promotion-form-grid"><label className="field"><span>Event name</span><input aria-label="Calendar special event name" value={specialName} onChange={(event) => setSpecialName(event.target.value)} /></label><label className="field"><span>Date</span><input aria-label="Calendar special event date" type="date" value={specialDate} onChange={(event) => setSpecialDate(event.target.value)} /></label><label className="field"><span>Company</span><input aria-label="Calendar special event company" value={specialCompany} onChange={(event) => setSpecialCompany(event.target.value)} /></label><label className="field"><span>Venue</span><input aria-label="Calendar special event venue" value={specialVenue} onChange={(event) => setSpecialVenue(event.target.value)} /></label><label className="field"><span>Expected minutes</span><input aria-label="Calendar special event minutes" type="number" min={15} value={specialMinutes} onChange={(event) => setSpecialMinutes(Math.max(15, Number(event.target.value) || 15))} /></label></div><button className="primary-button" type="button" disabled={!specialName.trim() || !specialDate} onClick={addSpecial}>Insert One-Off Event</button></section>
      <section className="promotion-integrity"><header><div><p className="eyebrow">CROSS-SHOW SAFEGUARDS</p><h3>Calendar integrity</h3></div><span>{integrityIssues.length}</span></header>{integrityIssues.length === 0 ? <p>No duplicate episodes, broken schedule links, or deleted-show obligations were detected.</p> : integrityIssues.map((issue) => <article key={issue.id} className={`calendar-integrity--${issue.severity.toLowerCase()}`}><strong>{issue.severity}: {issue.message}</strong><span>{issue.detail}</span>{issue.showId && <button className="secondary-button" type="button" onClick={() => selectShow(issue.showId)}>Open Show</button>}</article>)}</section>
    </div>}

    {activeView === "list" && <section className="promotion-list-workspace">
      <header><div><p className="eyebrow">WEEKLY BOOKING PIPELINE</p><h3>Every scheduled show from card start through reconciliation</h3></div><label className="field"><span>Stage filter</span><select aria-label="Promotion pipeline stage filter" value={schedule.settings.listFilter} onChange={(event) => updateSettings({ listFilter: event.target.value as PromotionScheduleUniverse["settings"]["listFilter"] })}><option>All</option>{stageOrder.map((stage) => <option key={stage}>{stage}</option>)}</select></label></header>
      <div className="promotion-show-table"><div className="promotion-show-table-head"><span>Date</span><span>Show</span><span>Series</span><span>Card</span><span>Creative</span><span>TEW Entry</span><span>Stage</span><span>Action</span></div>{visibleShows.map((show) => { const summary = summaries.get(show.id); const link = linkForShow(show.id, schedule); const series = seriesForShow(show.id, schedule); const stage = stageByShow.get(show.id) ?? "Scheduled"; return <article key={show.id}><span>{show.date || "—"}</span><strong>{show.name}</strong><span>{seriesLabel(series, link?.episodeNumber)}</span><span>{show.segments.length}</span><span>{summary?.outputsComplete ?? 0}/{summary?.segmentCount ?? 0}</span><span>{summary?.entryComplete ?? 0}/{summary?.segmentCount ?? 0}</span><b className={`stage--${statusClass(stage)}`}>{stage}</b><button className="secondary-button" type="button" onClick={() => openShowSession(show.id)}>Open Session</button></article>; })}</div>
    </section>}

    {activeView === "series" && <div className="promotion-series-layout">
      <aside className="promotion-series-list"><header><div><p className="eyebrow">SHOW SERIES</p><h3>Recurring and one-off series</h3></div><span>{schedule.series.length}</span></header><button className="primary-button" type="button" onClick={() => createSeries(true)}>Create Weekly 60-Minute Series</button><button className="secondary-button" type="button" onClick={() => createSeries(false)}>Create Blank Series</button>{schedule.series.map((series) => <button key={series.id} type="button" className={selectedSeries?.id === series.id ? "selected" : ""} onClick={() => updateSettings({ selectedSeriesId: series.id })}><strong>{series.name}</strong><span>{series.category} · {series.recurrence}</span><small>{series.status} · {schedule.links.filter((link) => link.seriesId === series.id).length} generated shows</small></button>)}</aside>
      <main className="promotion-series-editor">{selectedSeries ? <>
        <header><div><p className="eyebrow">SERIES DEFINITION</p><h3>{selectedSeries.name}</h3><p>Generate new episodes safely. Existing edited shows are never overwritten.</p></div><button className="danger-button" type="button" onClick={() => { setSchedule((current) => deleteSeriesKeepShows(current, selectedSeries.id)); setPreview([]); setNotice("Series deleted. Its shows remain as one-off events."); }}>Delete Series, Keep Shows</button></header>
        <div className="promotion-form-grid"><label className="field field--wide"><span>Series name</span><input aria-label="Show series name" value={selectedSeries.name} onChange={(event) => updateSeries({ name: event.target.value })} /></label><label className="field"><span>Company</span><input aria-label="Show series company" value={selectedSeries.company} onChange={(event) => updateSeries({ company: event.target.value })} /></label><label className="field"><span>Brand</span><input value={selectedSeries.brand} onChange={(event) => updateSeries({ brand: event.target.value })} /></label><label className="field"><span>Category</span><select aria-label="Show series category" value={selectedSeries.category} onChange={(event) => updateSeries({ category: event.target.value as ShowSeries["category"] })}>{["Weekly Television", "Biweekly Television", "Monthly Event", "Premium Event", "Competition Event", "Special", "One-Off", "Custom"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field"><span>Status</span><select aria-label="Show series status" value={selectedSeries.status} onChange={(event) => updateSeries({ status: event.target.value as ShowSeries["status"] })}><option>Active</option><option>Paused</option><option>Completed</option><option>Inactive</option></select></label><label className="field"><span>Default runtime</span><input aria-label="Show series runtime" type="number" min={15} value={selectedSeries.defaultMinutes} onChange={(event) => updateSeries({ defaultMinutes: Math.max(15, Number(event.target.value) || 15) })} /></label><label className="field"><span>Recurrence</span><select aria-label="Show series recurrence" value={selectedSeries.recurrence} onChange={(event) => updateSeries({ recurrence: event.target.value as ShowSeries["recurrence"] })}><option>Weekly</option><option>Biweekly</option><option>Monthly</option><option>Interval Days</option><option>One-Off</option></select></label><label className="field"><span>Interval days</span><input type="number" min={1} disabled={selectedSeries.recurrence !== "Interval Days"} value={selectedSeries.intervalDays} onChange={(event) => updateSeries({ intervalDays: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="field"><span>Default weekday</span><select aria-label="Show series weekday" value={selectedSeries.defaultDayOfWeek} disabled={!['Weekly', 'Biweekly'].includes(selectedSeries.recurrence)} onChange={(event) => updateSeries({ defaultDayOfWeek: Number(event.target.value) })}>{dayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label className="field"><span>Start date</span><input aria-label="Show series start date" type="date" value={selectedSeries.startDate} onChange={(event) => updateSeries({ startDate: event.target.value })} /></label><label className="field"><span>End date</span><input type="date" value={selectedSeries.endDate} onChange={(event) => updateSeries({ endDate: event.target.value })} /></label><label className="field"><span>Starting episode</span><input type="number" min={1} value={selectedSeries.startingEpisodeNumber} onChange={(event) => updateSeries({ startingEpisodeNumber: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="field field--wide"><span>Naming pattern</span><input aria-label="Show series naming pattern" value={selectedSeries.namingPattern} onChange={(event) => updateSeries({ namingPattern: event.target.value })} /><small>Tokens: {'{series}'}, {'{episode}'}, {'{date}'}. Preview: {formatSeriesShowName(selectedSeries, selectedSeries.startingEpisodeNumber, selectedSeries.startDate)}</small></label><label className="field"><span>Venue behavior</span><select value={selectedSeries.venueMode} onChange={(event) => updateSeries({ venueMode: event.target.value as ShowSeries["venueMode"] })}><option>Manual Per Show</option><option>Fixed</option></select></label><label className="field"><span>Default venue</span><input disabled={selectedSeries.venueMode !== "Fixed"} value={selectedSeries.defaultVenue} onChange={(event) => updateSeries({ defaultVenue: event.target.value })} /></label><label className="field"><span>Show template</span><select aria-label="Show series template" value={selectedSeries.templateId} onChange={(event) => updateSeries({ templateId: event.target.value })}><option value="">No structural template</option>{schedule.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="field"><span>Competition association</span><select value={selectedSeries.competitionId} onChange={(event) => updateSeries({ competitionId: event.target.value })}><option value="">No competition association</option>{competitions.competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label><label className="field field--full"><span>Production notes</span><textarea rows={3} value={selectedSeries.productionNotes} onChange={(event) => updateSeries({ productionNotes: event.target.value })} /></label></div>
        <section className="promotion-generation-panel"><header><div><h4>Schedule Generator</h4><p>Preview every proposed episode before creating a show.</p></div><span>{schedule.links.filter((link) => link.seriesId === selectedSeries.id).length} existing episodes</span></header><div className="promotion-generation-controls"><label className="field"><span>Generation mode</span><select aria-label="Schedule generation mode" value={generationMode} onChange={(event) => setGenerationMode(event.target.value as ScheduleGenerationOptions["mode"])}><option value="count">Generate next episode count</option><option value="through-date">Generate through date</option></select></label>{generationMode === "count" ? <label className="field"><span>Episode count</span><input aria-label="Schedule generation count" type="number" min={1} max={260} value={generationCount} onChange={(event) => setGenerationCount(Math.max(1, Number(event.target.value) || 1))} /></label> : <label className="field"><span>Through date</span><input aria-label="Schedule generation through date" type="date" value={throughDate} onChange={(event) => setThroughDate(event.target.value)} /></label>}<button className="primary-button" type="button" onClick={buildPreview}>Preview New Episodes</button><button className="secondary-button" type="button" onClick={buildRegenerationPreview}>Inspect Existing Episodes</button></div>{preview.length > 0 && <div className="promotion-preview-list"><header><span>Date</span><span>Episode</span><span>Proposed show</span><span>Status</span><span>Reason</span></header>{preview.map((item) => <article key={item.id} className={`preview--${statusClass(item.status)}`}><span>{item.date}</span><span>{item.episodeNumber || "—"}</span><strong>{item.showName}</strong><b>{item.status}</b><span>{item.reason}</span></article>)}<footer><button className="primary-button" type="button" disabled={!preview.some((item) => item.status === "New")} onClick={applyPreview}>Create {preview.filter((item) => item.status === "New").length} New Show{preview.filter((item) => item.status === "New").length === 1 ? "" : "s"}</button><span>{preview.filter((item) => item.status === "Conflict").length} conflicts and {preview.filter((item) => item.status === "Excluded").length} exclusions will remain untouched.</span></footer></div>}</section>
        <section className="promotion-exclusion-panel"><header><h4>Excluded and skipped dates</h4><span>{schedule.exclusions.filter((item) => item.seriesId === selectedSeries.id).length}</span></header><div className="promotion-exclusion-form"><input aria-label="Show series exclusion date" type="date" value={exclusionDate} onChange={(event) => setExclusionDate(event.target.value)} /><input aria-label="Show series exclusion reason" placeholder="Reason, holiday, special replacement…" value={exclusionReason} onChange={(event) => setExclusionReason(event.target.value)} /><button className="secondary-button" type="button" disabled={!exclusionDate} onClick={addExclusion}>Exclude Date</button></div>{schedule.exclusions.filter((item) => item.seriesId === selectedSeries.id).map((item) => <article key={item.id}><div><strong>{item.date}</strong><span>{item.reason || "No reason recorded"}</span></div><button className="danger-button" type="button" onClick={() => setSchedule((current) => removeSeriesExclusion(current, item.id))}>Remove</button></article>)}</section>
      </> : <div className="empty-state"><h3>No show series yet</h3><p>Create a weekly series for PWL Power Hour or another recurring programme.</p><button className="primary-button" type="button" onClick={() => createSeries(true)}>Create Weekly 60-Minute Series</button></div>}</main>
    </div>}

    {activeView === "templates" && <div className="promotion-template-layout">
      <aside className="promotion-template-list"><header><div><p className="eyebrow">SHOW TEMPLATES</p><h3>Reusable structural cards</h3></div><span>{schedule.templates.length}</span></header><button className="primary-button" type="button" onClick={() => createTemplate(true)}>Create 60-Minute TV Template</button><button className="secondary-button" type="button" onClick={() => createTemplate(false)}>Create Blank Template</button>{schedule.templates.map((template) => <button key={template.id} type="button" className={selectedTemplate?.id === template.id ? "selected" : ""} onClick={() => updateSettings({ selectedTemplateId: template.id })}><strong>{template.name}</strong><span>{template.expectedMinutes} minutes · {template.slots.length} slots</span><small>{templateSlotTotal(template)} minutes currently allocated</small></button>)}</aside>
      <main className="promotion-template-editor">{selectedTemplate ? <><header><div><p className="eyebrow">STRUCTURAL TEMPLATE</p><h3>{selectedTemplate.name}</h3><p>Templates supply blank segment structure only. They never select wrestlers, winners, finishes, dialogue, or outcomes.</p></div><button className="danger-button" type="button" onClick={deleteTemplate}>Delete Template, Keep Shows</button></header><div className="promotion-form-grid"><label className="field field--wide"><span>Template name</span><input aria-label="Show template name" value={selectedTemplate.name} onChange={(event) => updateTemplate({ name: event.target.value })} /></label><label className="field"><span>Expected minutes</span><input aria-label="Show template minutes" type="number" min={15} value={selectedTemplate.expectedMinutes} onChange={(event) => updateTemplate({ expectedMinutes: Math.max(15, Number(event.target.value) || 15) })} /></label><label className="field"><span>Pre-show allowance</span><input type="number" min={0} value={selectedTemplate.preShowMinutes} onChange={(event) => updateTemplate({ preShowMinutes: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="field"><span>Main-show allowance</span><input type="number" min={0} value={selectedTemplate.mainShowMinutes} onChange={(event) => updateTemplate({ mainShowMinutes: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="field"><span>Post-show allowance</span><input type="number" min={0} value={selectedTemplate.postShowMinutes} onChange={(event) => updateTemplate({ postShowMinutes: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="field field--full"><span>Recurring production notes</span><textarea rows={3} value={selectedTemplate.productionNotes} onChange={(event) => updateTemplate({ productionNotes: event.target.value })} /></label></div><section className="promotion-template-slots"><header><div><h4>Segment placeholders</h4><p>{templateSlotTotal(selectedTemplate)} of {selectedTemplate.expectedMinutes} minutes allocated</p></div><div><button className="secondary-button" type="button" onClick={() => updateTemplate({ slots: [...selectedTemplate.slots, createTemplateSlot("match", selectedTemplate.slots.filter((slot) => slot.type === "match").length + 1)] })}>Add Match Slot</button><button className="secondary-button" type="button" onClick={() => updateTemplate({ slots: [...selectedTemplate.slots, createTemplateSlot("angle", selectedTemplate.slots.filter((slot) => slot.type === "angle").length + 1)] })}>Add Angle Slot</button></div></header>{selectedTemplate.slots.map((slot, index) => <article key={slot.id}><b>{index + 1}</b><select aria-label={`Template slot ${index + 1} type`} value={slot.type} onChange={(event) => updateTemplateSlot(slot.id, { type: event.target.value as PlannedSegment["type"] })}><option value="match">Match</option><option value="angle">Angle</option></select><select value={slot.section} onChange={(event) => updateTemplateSlot(slot.id, { section: event.target.value as PlannedSegment["section"] })}><option>Pre-Show</option><option>Main Show</option><option>Post-Show</option></select><input aria-label={`Template slot ${index + 1} title`} value={slot.title} onChange={(event) => updateTemplateSlot(slot.id, { title: event.target.value })} /><input aria-label={`Template slot ${index + 1} minutes`} type="number" min={1} value={slot.durationMinutes} onChange={(event) => updateTemplateSlot(slot.id, { durationMinutes: Math.max(1, Number(event.target.value) || 1) })} /><textarea rows={2} value={slot.notes} onChange={(event) => updateTemplateSlot(slot.id, { notes: event.target.value })} /><div><button className="secondary-button" type="button" disabled={index === 0} onClick={() => moveTemplateSlot(slot.id, -1)}>Up</button><button className="secondary-button" type="button" disabled={index === selectedTemplate.slots.length - 1} onClick={() => moveTemplateSlot(slot.id, 1)}>Down</button><button className="danger-button" type="button" onClick={() => updateTemplate({ slots: selectedTemplate.slots.filter((item) => item.id !== slot.id) })}>Remove</button></div></article>)}</section></> : <div className="empty-state"><h3>No template selected</h3><p>Create a structural template for weekly television or premium events.</p></div>}</main>
    </div>}

    {activeView === "obligations" && <div className="promotion-obligations-layout">
      <aside className="promotion-obligation-show-list"><header><div><p className="eyebrow">TARGET SHOW</p><h3>Choose the next booking card</h3></div><span>{shows.length}</span></header>{shows.filter((show) => show.status !== "Reconciled").sort((left, right) => left.date.localeCompare(right.date)).map((show) => <button key={show.id} type="button" className={selectedShow?.id === show.id ? "selected" : ""} onClick={() => selectShow(show.id)}><strong>{show.name}</strong><span>{show.date}</span><small>{stageByShow.get(show.id)} · {show.segments.length} segments</small></button>)}</aside>
      <main className="promotion-obligation-main"><header><div><p className="eyebrow">CONTINUITY AND FOLLOW-UP INBOX</p><h3>{selectedShow?.name ?? "No target show selected"}</h3><p>Only obligations grounded in existing follow-ups, milestones, ideas, arcs, championships, competitions, or TEW-entry changes are shown.</p></div><span>{obligations.length}</span></header>{selectedShow && obligations.length === 0 ? <div className="empty-state compact"><h3>No open booking obligations</h3><p>The tracker found no grounded follow-up that must be placed on this card.</p></div> : obligations.map((obligation) => <article key={obligation.key} className={`promotion-obligation-card obligation--${obligation.priority.toLowerCase()} ${selectedObligationKey === obligation.key ? "selected" : ""}`}><header><div><span>{obligation.kind} · {obligation.priority}</span><h4>{obligation.title}</h4><p>{obligation.detail || "No additional source detail was stored."}</p></div><button className="secondary-button" type="button" onClick={() => setSelectedObligationKey(selectedObligationKey === obligation.key ? "" : obligation.key)}>{selectedObligationKey === obligation.key ? "Close Actions" : "Resolve"}</button></header>{selectedObligationKey === obligation.key && <div className="promotion-obligation-actions"><div className="promotion-obligation-primary-actions"><button className="primary-button" type="button" onClick={() => addObligation(obligation, "match")}>Add as Match</button><button className="primary-button" type="button" onClick={() => addObligation(obligation, "angle")}>Add as Angle</button><button className="secondary-button" type="button" onClick={() => openObligationSource(obligation)}>{sourceActionLabel(obligation)}</button></div><label className="field"><span>Attach to existing segment</span><select aria-label={`${obligation.title} target segment`} value={obligationTargetSegmentId} onChange={(event) => setObligationTargetSegmentId(event.target.value)}><option value="">Choose a segment…</option>{selectedShow?.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label><button className="secondary-button" type="button" disabled={!obligationTargetSegmentId} onClick={() => attachObligation(obligation)}>Attach to Existing Segment</button><label className="field"><span>Assign to a later show</span><select aria-label={`${obligation.title} later show`} value={deferShowId} onChange={(event) => setDeferShowId(event.target.value)}><option value="">Choose a later show…</option>{shows.filter((show) => selectedShow && show.date > selectedShow.date && show.status !== "Reconciled").map((show) => <option key={show.id} value={show.id}>{show.date} · {show.name}</option>)}</select></label><label className="field field--wide"><span>Decision or dismissal reason</span><input aria-label={`${obligation.title} decision reason`} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label><div className="promotion-obligation-secondary-actions"><button className="secondary-button" type="button" disabled={!deferShowId} onClick={() => deferObligation(obligation)}>Assign to Later Show</button><button className="secondary-button" type="button" onClick={() => recordDecision(obligation, "Addressed", selectedShow?.id ?? "", "", decisionReason)}>Mark Addressed</button><button className="danger-button" type="button" disabled={!decisionReason.trim()} onClick={() => recordDecision(obligation, "Dismissed", "", "", decisionReason)}>Dismiss with Reason</button></div></div>}</article>)}</main>
      <aside className="promotion-obligation-context"><section><h4>Target card</h4>{selectedShow ? <><strong>{selectedShow.name}</strong><span>{selectedShow.date}</span><span>{selectedShow.segments.length} segments · {selectedSummary?.plannedMinutes ?? 0}/{selectedShow.expectedMinutes} minutes</span><button className="primary-button" type="button" onClick={() => openShowSession(selectedShow.id)}>Open Show Session</button></> : <p>No target show selected.</p>}</section><section><h4>Recent decisions</h4>{schedule.continuityDecisions.filter((decision) => decision.showId === selectedShow?.id || decision.targetShowId === selectedShow?.id).slice(0, 12).map((decision) => <article key={decision.id}><strong>{decision.status}</strong><span>{decision.obligationKey}</span><small>{decision.reason || "No reason recorded"}</small></article>)}</section></aside>
    </div>}
  </section>;
}
