import { useEffect, useMemo, useState } from "react";
import {
  loadChampionshipUniverse,
  saveChampionshipUniverse,
} from "../championships/storage";
import type { ChampionshipUniverse } from "../championships/types";
import {
  loadCreativeControlData,
  saveCreativeControlData,
} from "../control/storage";
import type { CreativeControlData } from "../control/types";
import {
  loadCompetitionUniverse,
  saveCompetitionUniverse,
} from "../competitions/storage";
import type { CompetitionUniverse } from "../competitions/types";
import { saveSegmentToOutputLibrary } from "../outputLibrary/model";
import type { OutputLibraryUniverse, OutputSegmentSnapshot } from "../outputLibrary/types";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import {
  loadPromotionScheduleUniverse,
  savePromotionScheduleUniverse,
} from "../schedule/storage";
import type { PromotionScheduleUniverse } from "../schedule/types";
import {
  loadTrackerStorylines,
  saveTrackerStorylines,
} from "../storylines/storage";
import type { TrackerStoryline } from "../storylines/types";
import {
  loadWorkerUniverse,
  saveWorkerUniverse,
} from "../workers/storage";
import type { WorkerUniverse } from "../workers/types";
import {
  applyArcConsequence,
  applyBookingIdeaConsequence,
  applyChampionshipConsequence,
  applyCompetitionConsequence,
  applyFollowUpConsequence,
  applyMilestoneConsequence,
  applySegmentReview,
  beginWrapUpSession,
  buildShowClosureReport,
  buildWrapUpProgress,
  capturePreWrapSnapshot,
  championshipPreviewLabel,
  closeWrapUpSession,
  createWrapUpAudit,
  createWrapUpSession,
  markReviewCheckpoint,
  openWrapUpAmendment,
  parsePreWrapSnapshot,
  synchronizeWrapUpSession,
  updateArcDecision,
  updateBookingIdeaDecision,
  updateChampionshipDecision,
  updateCompetitionDecision,
  updateFollowUpDecision,
  updateMilestoneDecision,
  updateWrapUpSegmentReview,
  upsertWrapUpSession,
  wrapUpSessionForShow,
} from "./model";
import {
  loadWrapUpUniverse,
  saveWrapUpUniverse,
} from "./storage";
import type {
  ShowClosureReport,
  WrapUpArcDecision,
  WrapUpAuditRecord,
  WrapUpBookingIdeaDecision,
  WrapUpChampionshipDecision,
  WrapUpCompetitionDecision,
  WrapUpFollowUpDecision,
  WrapUpMilestoneDecision,
  WrapUpSegmentReview,
  WrapUpSession,
  WrapUpUniverse,
} from "./types";

interface PostShowWrapUpPanelProps {
  show: PlannedShow;
  shows: PlannedShow[];
  onShowsChange: (shows: PlannedShow[]) => void;
  outputLibrary: OutputLibraryUniverse;
  onOutputLibraryChange: (universe: OutputLibraryUniverse) => void;
  onOpenCalendar: () => void;
  onOpenNextShow: (showId: string) => void;
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextShowAfter(show: PlannedShow, shows: PlannedShow[]): PlannedShow | null {
  return [...shows]
    .filter((candidate) => candidate.id !== show.id && candidate.date >= show.date)
    .sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name))[0] ?? null;
}

function outcomeBoolean(value: WrapUpSegmentReview["happenedAsPlanned"]): boolean | null {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

function actualSnapshotForReview(segment: PlannedSegment, review: WrapUpSegmentReview): NonNullable<OutputSegmentSnapshot["actual"]> {
  const actual = segment.reconciliation.actualMatch;
  return {
    linkedMatchId: segment.reconciliation.linkedMatchId,
    description: actual?.description || segment.title,
    winner: actual?.winner || "",
    matchTime: actual?.matchTime || "",
    rating: segment.type === "angle" ? review.actualAngleRating : segment.reconciliation.actualRating ?? actual?.rating ?? null,
    notes: actual?.notes || review.privateCorrectionNotes,
    happenedAsPlanned: outcomeBoolean(review.happenedAsPlanned),
    reviewOutcome: review.happenedAsPlanned,
    finalNarrative: review.finalNarrative,
    changes: review.changes,
    actualConsequences: review.actualConsequences,
    finalFollowUp: review.finalFollowUp,
    reconciledAt: segment.reconciliation.reconciledAt || new Date().toISOString(),
  };
}

function enrichOutputActual(
  universe: OutputLibraryUniverse,
  itemId: string,
  versionId: string,
  segment: PlannedSegment,
  review: WrapUpSegmentReview,
): OutputLibraryUniverse {
  return {
    ...universe,
    items: universe.items.map((item) => item.id !== itemId ? item : {
      ...item,
      versions: item.versions.map((version) => version.id !== versionId ? version : {
        ...version,
        snapshot: {
          ...version.snapshot,
          actual: actualSnapshotForReview(segment, review),
        },
      }),
    }),
  };
}

async function copyText(value: string): Promise<boolean> {
  if (!value.trim()) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function downloadJson(filename: string, value: string): void {
  const blob = new Blob([value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function DecisionStatus({ status }: { status: string }) {
  return <span className={`wrap-up-decision-status status--${statusClass(status)}`}>{status}</span>;
}

function ClosureReportCard({ report, onNotice }: { report: ShowClosureReport; onNotice: (notice: string) => void }) {
  return <article className="wrap-up-report-card">
    <header><div><strong>{report.showName}</strong><span>Amendment {report.amendmentNumber} · {formatDate(report.generatedAt)}</span></div><b>{report.outstandingCount} outstanding</b></header>
    <pre>{report.text}</pre>
    <footer><button className="secondary-button" type="button" onClick={() => void copyText(report.text).then((copied) => onNotice(copied ? "Show Closure Report copied." : "The report could not be copied."))}>Copy Report</button><button className="secondary-button" type="button" onClick={() => downloadJson(`show-closure-${report.showId}-${report.amendmentNumber}.json`, report.json)}>Export JSON</button></footer>
  </article>;
}

export default function PostShowWrapUpPanel({
  show,
  shows,
  onShowsChange,
  outputLibrary,
  onOutputLibraryChange,
  onOpenCalendar,
  onOpenNextShow,
}: PostShowWrapUpPanelProps) {
  const [wrapUp, setWrapUp] = useState<WrapUpUniverse>(() => loadWrapUpUniverse(window.localStorage));
  const [championships, setChampionships] = useState<ChampionshipUniverse>(() => loadChampionshipUniverse(window.localStorage));
  const [competitions, setCompetitions] = useState<CompetitionUniverse>(() => loadCompetitionUniverse(window.localStorage));
  const [storylines, setStorylines] = useState<TrackerStoryline[]>(() => loadTrackerStorylines(window.localStorage));
  const [control, setControl] = useState<CreativeControlData>(() => loadCreativeControlData(window.localStorage));
  const [workers, setWorkers] = useState<WorkerUniverse>(() => loadWorkerUniverse(window.localStorage));
  const [schedule, setSchedule] = useState<PromotionScheduleUniverse>(() => loadPromotionScheduleUniverse(window.localStorage));
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState<"review" | "championships" | "competitions" | "continuity" | "follow-ups" | "closure">("review");

  useEffect(() => saveWrapUpUniverse(window.localStorage, wrapUp), [wrapUp]);
  useEffect(() => saveChampionshipUniverse(window.localStorage, championships), [championships]);
  useEffect(() => saveCompetitionUniverse(window.localStorage, competitions), [competitions]);
  useEffect(() => saveTrackerStorylines(window.localStorage, storylines), [storylines]);
  useEffect(() => saveCreativeControlData(window.localStorage, control), [control]);
  useEffect(() => saveWorkerUniverse(window.localStorage, workers), [workers]);
  useEffect(() => savePromotionScheduleUniverse(window.localStorage, schedule), [schedule]);

  const rawSession = wrapUpSessionForShow(show, wrapUp);
  const session = useMemo(() => synchronizeWrapUpSession({
    session: rawSession,
    show,
    championships,
    competitions,
    storylines,
    control,
    workers,
  }), [rawSession, show, championships, competitions, storylines, control, workers]);
  const progress = useMemo(() => buildWrapUpProgress(session, show), [session, show]);
  const nextScheduled = nextShowAfter(show, shows);
  const latestAudit = session.auditIds
    .map((id) => wrapUp.audits.find((audit) => audit.id === id))
    .find((audit): audit is WrapUpAuditRecord => Boolean(audit && !audit.reversedAt && !["Closure", "Rollback"].includes(audit.kind))) ?? null;

  function snapshotJson(): string {
    return capturePreWrapSnapshot({
      shows,
      championships,
      competitions,
      storylines,
      control,
      workers,
      promotionSchedule: schedule,
      outputLibrary,
    });
  }

  function started(current = session): WrapUpSession {
    return beginWrapUpSession(current, snapshotJson());
  }

  function persistSession(next: WrapUpSession): void {
    setWrapUp((current) => upsertWrapUpSession(current, next));
  }

  function persistWithAudit(next: WrapUpSession, audit: WrapUpAuditRecord): void {
    const sessionWithAudit = { ...next, auditIds: [audit.id, ...next.auditIds], updatedAt: new Date().toISOString() };
    setWrapUp((current) => {
      const withSession = upsertWrapUpSession(current, sessionWithAudit);
      return { ...withSession, audits: [audit, ...withSession.audits].slice(0, 1000) };
    });
  }

  function updateReview(review: WrapUpSegmentReview): void {
    persistSession(updateWrapUpSegmentReview(started(), review));
  }

  function completeReview(review: WrapUpSegmentReview): void {
    try {
      const previous = { show: clone(show), review: clone(review) };
      const result = applySegmentReview(show, review);
      const nextShows = shows.map((item) => item.id === show.id ? result.show : item);
      onShowsChange(nextShows);
      let next = updateWrapUpSegmentReview(started(), result.review);
      const audit = createWrapUpAudit({
        session: next,
        kind: "Segment Review",
        segmentId: review.segmentId,
        entityId: review.id,
        action: `Reviewed ${review.segmentType} final record`,
        reason: review.privateCorrectionNotes,
        previousState: previous,
        nextState: { show: result.show, review: result.review },
      });
      next = updateWrapUpSegmentReview(next, { ...result.review, updatedAt: new Date().toISOString() });
      persistWithAudit(next, audit);
      setNotice(`${show.segments.find((segment) => segment.id === review.segmentId)?.title ?? "Segment"} final record reviewed.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The final segment record could not be saved.");
    }
  }

  function createActualCheckpoint(review: WrapUpSegmentReview): void {
    const segment = show.segments.find((item) => item.id === review.segmentId);
    if (!segment || review.status !== "Reviewed") {
      setNotice("Complete the final segment review before creating its Reconciled Actual Version.");
      return;
    }
    const previous = { outputLibrary: clone(outputLibrary), review: clone(review) };
    const saved = saveSegmentToOutputLibrary(outputLibrary, {
      segment,
      show,
      sourceKind: "Planned Show",
      stage: "Reconciled Actual Version",
      label: session.status === "Amendment Open" ? `Reconciled correction ${session.amendmentCount}` : "Post-show Wrap-Up actual version",
    });
    const versionId = saved.item.currentVersionId;
    const enriched = enrichOutputActual(saved.universe, saved.item.id, versionId, segment, review);
    onOutputLibraryChange(enriched);
    let next = markReviewCheckpoint(started(), segment.id, saved.item.id, versionId);
    const audit = createWrapUpAudit({
      session: next,
      kind: "Output Checkpoint",
      segmentId: segment.id,
      entityId: saved.item.id,
      action: saved.createdVersion ? "Created Reconciled Actual Version" : "Confirmed existing Reconciled Actual Version",
      previousState: previous,
      nextState: { outputLibrary: enriched, review: next.segmentReviews.find((item) => item.segmentId === segment.id) },
    });
    persistWithAudit(next, audit);
    setNotice(saved.createdVersion ? "Reconciled Actual Version created without replacing earlier history." : "An identical Reconciled Actual Version already existed and was linked to Wrap-Up.");
  }

  function updateChampionship(decision: WrapUpChampionshipDecision): void {
    persistSession(updateChampionshipDecision(started(), decision));
  }

  function confirmChampionship(decision: WrapUpChampionshipDecision): void {
    try {
      const result = applyChampionshipConsequence({
        universe: championships,
        show,
        decision,
        knownWorkers: workers.profiles.map((worker) => ({ id: worker.id, name: worker.displayName })),
      });
      setChampionships(result.universe);
      onShowsChange(shows.map((item) => item.id === show.id ? result.show : item));
      const audit = createWrapUpAudit({
        session: started(),
        kind: "Championship",
        segmentId: decision.segmentId,
        entityId: decision.id,
        action: `${decision.championshipName}: ${decision.decision}`,
        reason: decision.reason,
        previousState: result.previousState,
        nextState: result.nextState,
        amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "",
      });
      const updatedDecision = { ...result.decision, auditId: audit.id };
      const next = updateChampionshipDecision(started(), updatedDecision);
      persistWithAudit(next, audit);
      setNotice(result.decision.preview);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The championship decision could not be confirmed.");
    }
  }

  function updateCompetition(decision: WrapUpCompetitionDecision): void {
    persistSession(updateCompetitionDecision(started(), decision));
  }

  function confirmCompetition(decision: WrapUpCompetitionDecision): void {
    try {
      const result = applyCompetitionConsequence({ universe: competitions, decision });
      setCompetitions(result.universe);
      const audit = createWrapUpAudit({
        session: started(),
        kind: "Competition",
        segmentId: decision.segmentId,
        entityId: decision.id,
        action: `${decision.competitionName} ${decision.roundLabel}: ${decision.resultType}`,
        reason: decision.reason,
        previousState: result.previousState,
        nextState: result.nextState,
        amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "",
      });
      const next = updateCompetitionDecision(started(), { ...result.decision, auditId: audit.id });
      persistWithAudit(next, audit);
      setNotice(result.decision.preview);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The competition result could not be confirmed.");
    }
  }

  function updateMilestone(decision: WrapUpMilestoneDecision): void {
    persistSession(updateMilestoneDecision(started(), decision));
  }

  function confirmMilestone(decision: WrapUpMilestoneDecision): void {
    try {
      const result = applyMilestoneConsequence({ storylines, decision });
      setStorylines(result.storylines);
      const audit = createWrapUpAudit({ session: started(), kind: "Storyline Milestone", entityId: decision.id, action: `${decision.storylineName}: ${decision.decision}`, reason: decision.note, previousState: result.previousState, nextState: result.nextState, amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "" });
      persistWithAudit(updateMilestoneDecision(started(), { ...result.decision, auditId: audit.id }), audit);
      setNotice(`${decision.milestoneTitle} recorded as ${decision.decision}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The storyline milestone could not be updated.");
    }
  }

  function updateIdea(decision: WrapUpBookingIdeaDecision): void {
    persistSession(updateBookingIdeaDecision(started(), decision));
  }

  function confirmIdea(decision: WrapUpBookingIdeaDecision): void {
    try {
      const result = applyBookingIdeaConsequence({ control, decision });
      setControl(result.control);
      const audit = createWrapUpAudit({ session: started(), kind: "Booking Idea", entityId: decision.id, action: `${decision.ideaTitle}: ${decision.decision}`, reason: decision.note, previousState: result.previousState, nextState: result.nextState, amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "" });
      persistWithAudit(updateBookingIdeaDecision(started(), { ...result.decision, auditId: audit.id }), audit);
      setNotice(`${decision.ideaTitle} recorded as ${decision.decision}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The booking idea could not be updated.");
    }
  }

  function updateArc(decision: WrapUpArcDecision): void {
    persistSession(updateArcDecision(started(), decision));
  }

  function confirmArc(decision: WrapUpArcDecision): void {
    try {
      const result = applyArcConsequence({ workers, decision });
      setWorkers(result.workers);
      const audit = createWrapUpAudit({ session: started(), kind: "Character Arc", entityId: decision.id, action: `${decision.workerName} · ${decision.arcName}: ${decision.decision}`, reason: decision.progressNote, previousState: result.previousState, nextState: result.nextState, amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "" });
      persistWithAudit(updateArcDecision(started(), { ...result.decision, auditId: audit.id }), audit);
      setNotice(`${decision.arcName} progress recorded.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The character arc could not be updated.");
    }
  }

  function updateFollowUp(decision: WrapUpFollowUpDecision): void {
    persistSession(updateFollowUpDecision(started(), decision));
  }

  function confirmFollowUp(decision: WrapUpFollowUpDecision): void {
    try {
      const result = applyFollowUpConsequence({ shows, schedule, sourceShow: show, decision });
      onShowsChange(result.shows);
      setSchedule(result.schedule);
      const audit = createWrapUpAudit({ session: started(), kind: "Follow-Up", segmentId: decision.sourceSegmentId, entityId: decision.id, action: `${decision.sourceSegmentTitle}: ${decision.destination}`, reason: decision.reason, previousState: result.previousState, nextState: result.nextState, amendmentOfAuditId: session.status === "Amendment Open" ? decision.auditId : "" });
      persistWithAudit(updateFollowUpDecision(started(), { ...result.decision, auditId: audit.id }), audit);
      setNotice(`${decision.sourceSegmentTitle} follow-up recorded as ${decision.destination}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The follow-up could not be rolled forward.");
    }
  }

  function closeSession(): void {
    const current = started();
    const currentProgress = buildWrapUpProgress(current, show);
    if (!currentProgress.canClose) {
      setNotice("Complete or explicitly defer every Wrap-Up item and create every Reconciled Actual Version before closing the show.");
      return;
    }
    const report = buildShowClosureReport({ show, session: current, progress: currentProgress });
    const closed = closeWrapUpSession(current, report);
    const audit = createWrapUpAudit({ session: closed, kind: "Closure", action: "Closed post-show Wrap-Up", previousState: current, nextState: closed });
    persistWithAudit(closed, audit);
    setActiveSection("closure");
    setNotice("Post-show Wrap-Up closed. The report and all consequence decisions remain auditable.");
  }

  function openAmendment(): void {
    const amended = beginWrapUpSession(openWrapUpAmendment(session), snapshotJson());
    const audit = createWrapUpAudit({ session: amended, kind: "Amendment", action: `Opened amendment ${amended.amendmentCount}`, previousState: session, nextState: amended });
    persistWithAudit(amended, audit);
    setNotice(`Amendment ${amended.amendmentCount} opened. Existing history remains preserved.`);
  }

  function rollbackEntireSession(): void {
    if (session.status === "Closed") {
      setNotice("Open an amendment before correcting a closed Wrap-Up.");
      return;
    }
    const payload = parsePreWrapSnapshot(session.preWrapSnapshotJson);
    if (!payload) {
      setNotice("No pre-Wrap-Up recovery snapshot is available.");
      return;
    }
    const previous = {
      shows: clone(shows), championships: clone(championships), competitions: clone(competitions), storylines: clone(storylines),
      control: clone(control), workers: clone(workers), promotionSchedule: clone(schedule), outputLibrary: clone(outputLibrary),
    };
    const restoredShows = payload.shows as PlannedShow[];
    onShowsChange(restoredShows);
    setChampionships(payload.championships as ChampionshipUniverse);
    setCompetitions(payload.competitions as CompetitionUniverse);
    setStorylines(payload.storylines as TrackerStoryline[]);
    setControl(payload.control as CreativeControlData);
    setWorkers(payload.workers as WorkerUniverse);
    setSchedule(payload.promotionSchedule as PromotionScheduleUniverse);
    onOutputLibraryChange(payload.outputLibrary as OutputLibraryUniverse);
    const restoredShow = restoredShows.find((item) => item.id === show.id) ?? show;
    const reset = createWrapUpSession(restoredShow);
    const audit = createWrapUpAudit({ session: reset, kind: "Rollback", action: "Restored complete pre-Wrap-Up snapshot", previousState: previous, nextState: payload });
    persistWithAudit(reset, audit);
    setNotice("The complete pre-Wrap-Up snapshot was restored. The rollback remains in the audit history.");
  }

  function undoLatestChange(): void {
    if (!latestAudit) return;
    try {
      const previous = JSON.parse(latestAudit.previousStateJson) as Record<string, unknown>;
      let next = started();
      if (latestAudit.kind === "Segment Review") {
        const previousShow = previous.show as PlannedShow | undefined;
        const previousReview = previous.review as WrapUpSegmentReview | undefined;
        if (previousShow) onShowsChange(shows.map((item) => item.id === show.id ? previousShow : item));
        if (previousReview) next = updateWrapUpSegmentReview(next, { ...previousReview, status: "Pending" });
      } else if (latestAudit.kind === "Output Checkpoint") {
        const previousLibrary = previous.outputLibrary as OutputLibraryUniverse | undefined;
        const previousReview = previous.review as WrapUpSegmentReview | undefined;
        if (previousLibrary) onOutputLibraryChange(previousLibrary);
        if (previousReview) next = updateWrapUpSegmentReview(next, { ...previousReview, outputItemId: "", outputVersionId: "" });
      } else if (latestAudit.kind === "Championship") {
        const priorChampionship = previous.championship as ChampionshipUniverse["championships"][number] | undefined;
        const priorShow = previous.show as PlannedShow | undefined;
        if (priorChampionship) setChampionships((current) => ({ ...current, championships: current.championships.map((item) => item.id === priorChampionship.id ? priorChampionship : item) }));
        if (priorShow) onShowsChange(shows.map((item) => item.id === show.id ? priorShow : item));
        next = { ...next, championshipDecisions: next.championshipDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending", appliedAt: "" } : item) };
      } else if (latestAudit.kind === "Competition") {
        const competition = previous as unknown as CompetitionUniverse["competitions"][number];
        if (competition?.id) setCompetitions((current) => ({ ...current, competitions: current.competitions.map((item) => item.id === competition.id ? competition : item) }));
        next = { ...next, competitionDecisions: next.competitionDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending", appliedAt: "" } : item) };
      } else if (latestAudit.kind === "Storyline Milestone") {
        const storyline = previous as unknown as TrackerStoryline;
        if (storyline?.id) setStorylines((current) => current.map((item) => item.id === storyline.id ? storyline : item));
        next = { ...next, milestoneDecisions: next.milestoneDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending", appliedAt: "" } : item) };
      } else if (latestAudit.kind === "Booking Idea") {
        const idea = previous as unknown as CreativeControlData["ideas"][number];
        if (idea?.id) setControl((current) => ({ ...current, ideas: current.ideas.map((item) => item.id === idea.id ? idea : item) }));
        next = { ...next, bookingIdeaDecisions: next.bookingIdeaDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending", appliedAt: "" } : item) };
      } else if (latestAudit.kind === "Character Arc") {
        const worker = previous as unknown as WorkerUniverse["profiles"][number];
        if (worker?.id) setWorkers((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === worker.id ? worker : item) }));
        next = { ...next, arcDecisions: next.arcDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending", appliedAt: "" } : item) };
      } else if (latestAudit.kind === "Follow-Up") {
        const previousShows = previous.shows as PlannedShow[] | undefined;
        const previousSchedule = previous.schedule as PromotionScheduleUniverse | undefined;
        if (previousShows) onShowsChange(previousShows);
        if (previousSchedule) setSchedule(previousSchedule);
        next = { ...next, followUpDecisions: next.followUpDecisions.map((item) => item.id === latestAudit.entityId ? { ...item, status: "Pending" } : item) };
      }
      const reversed = wrapUp.audits.map((audit) => audit.id === latestAudit.id ? { ...audit, reversedAt: new Date().toISOString() } : audit);
      const rollbackAudit = createWrapUpAudit({ session: next, kind: "Rollback", action: `Undid ${latestAudit.action}`, previousState: JSON.parse(latestAudit.nextStateJson || "null") as unknown, nextState: previous, amendmentOfAuditId: latestAudit.id });
      const sessionWithAudit = { ...next, auditIds: [rollbackAudit.id, ...next.auditIds] };
      setWrapUp((current) => ({ ...upsertWrapUpSession(current, sessionWithAudit), audits: [rollbackAudit, ...reversed].slice(0, 1000) }));
      setNotice(`${latestAudit.action} was undone. The reversal remains in the audit history.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The most recent Wrap-Up change could not be undone.");
    }
  }

  function closeAndContinue(): void {
    if (session.status !== "Closed") {
      setNotice("Close the current Wrap-Up before continuing to the next show.");
      return;
    }
    if (nextScheduled) onOpenNextShow(nextScheduled.id);
    else onOpenCalendar();
  }

  const currentReport = session.closureReports[0] ?? null;

  return <section className="post-show-wrap-up">
    <header className="wrap-up-hero">
      <div><p className="eyebrow">PHASE 5I · POST-SHOW CONSEQUENCE CENTER</p><h3>Close the creative loop after TEW has supplied the actual result</h3><p>Review final segment history, confirm only the championship and competition changes you approve, update continuity, and roll grounded follow-ups into the next scheduled card.</p></div>
      <div className="wrap-up-authority"><span>TEW authority</span><strong>{show.reconciliation?.actualShow.name || show.name}</strong><small>Winners and ratings remain sourced from the reconciled TEW show. No consequence is applied automatically.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="wrap-up-status-strip" aria-label="Post-show Wrap-Up progress">
      <div><span>Status</span><strong>{session.status}</strong></div>
      <div><span>Final Records</span><strong>{progress.segmentReviewsComplete}/{progress.segmentReviewsTotal}</strong></div>
      <div><span>Actual Versions</span><strong>{progress.outputCheckpointsComplete}/{progress.outputCheckpointsTotal}</strong></div>
      <div><span>Pending Decisions</span><strong>{progress.pendingDecisions}</strong></div>
      <div><span>Unresolved Matches</span><strong>{progress.unresolvedMatchResults}</strong></div>
      <div><span>Amendments</span><strong>{session.amendmentCount}</strong></div>
    </section>

    <nav className="wrap-up-tabs" aria-label="Post-show Wrap-Up sections">
      <button type="button" className={activeSection === "review" ? "active" : ""} onClick={() => setActiveSection("review")}>Final Segment Records</button>
      <button type="button" className={activeSection === "championships" ? "active" : ""} onClick={() => setActiveSection("championships")}>Championships ({progress.championshipPending})</button>
      <button type="button" className={activeSection === "competitions" ? "active" : ""} onClick={() => setActiveSection("competitions")}>Competitions ({progress.competitionPending})</button>
      <button type="button" className={activeSection === "continuity" ? "active" : ""} onClick={() => setActiveSection("continuity")}>Continuity ({progress.milestonePending + progress.bookingIdeaPending + progress.arcPending})</button>
      <button type="button" className={activeSection === "follow-ups" ? "active" : ""} onClick={() => setActiveSection("follow-ups")}>Follow-Ups ({progress.followUpPending})</button>
      <button type="button" className={activeSection === "closure" ? "active" : ""} onClick={() => setActiveSection("closure")}>Show Closure</button>
    </nav>

    {activeSection === "review" && <section className="wrap-up-section">
      <header><div><h4>Final segment records</h4><p>The original plan remains unchanged beside this post-show record. Matches use the linked TEW result; angles require a manual final record because TEW history does not retain the companion’s full Angle Output.</p></div></header>
      <div className="wrap-up-review-list">{session.segmentReviews.map((review, index) => {
        const segment = show.segments.find((item) => item.id === review.segmentId);
        if (!segment) return null;
        const actual = segment.reconciliation.actualMatch;
        return <article className={`wrap-up-review-card review--${statusClass(review.status)}`} key={review.id}>
          <header><div><span>#{index + 1} · {segment.type.toUpperCase()} · {segment.section}</span><h5>{segment.title}</h5></div><DecisionStatus status={review.status} /></header>
          <div className="wrap-up-planned-actual"><section><span>Planned</span><strong>{segment.plannedWinner || (segment.type === "angle" ? "Angle plan" : "Winner not set")}</strong><p>{segment.type === "match" ? segment.matchStory || "No Match Story entered." : segment.segmentOutput || "No Angle Output entered."}</p></section><section><span>TEW / Actual</span><strong>{actual?.winner || (segment.type === "angle" ? "Manual final record" : "Unmatched")}</strong><p>{actual ? `${actual.description} · ${actual.matchTime || "Time unavailable"} · Rating ${actual.rating ?? "—"}` : segment.type === "angle" ? "Record what actually aired below." : "Link the TEW match or deliberately leave unresolved."}</p></section></div>
          {segment.type === "match" && !actual && <label className="wrap-up-checkbox"><input type="checkbox" checked={review.deliberatelyUnresolved} onChange={(event) => updateReview({ ...review, deliberatelyUnresolved: event.target.checked })} /> Deliberately leave this planned match unresolved</label>}
          <div className="wrap-up-form-grid">
            <label className="field"><span>Happened as planned?</span><select aria-label={`${segment.title} happened as planned`} value={review.happenedAsPlanned} onChange={(event) => updateReview({ ...review, happenedAsPlanned: event.target.value as WrapUpSegmentReview["happenedAsPlanned"] })}><option>Unresolved</option><option>Yes</option><option>Partially</option><option>No</option><option>No Contest</option></select></label>
            {segment.type === "angle" && <label className="field"><span>Actual angle rating</span><input aria-label={`${segment.title} actual angle rating`} type="number" min={0} max={100} value={review.actualAngleRating ?? ""} onChange={(event) => updateReview({ ...review, actualAngleRating: event.target.value === "" ? null : Number(event.target.value) })} /></label>}
            <label className="field field--full"><span>Final {segment.type === "match" ? "Match Story" : "Angle Segment Output"}</span><textarea aria-label={`${segment.title} final narrative`} rows={7} value={review.finalNarrative} onChange={(event) => updateReview({ ...review, finalNarrative: event.target.value })} /></label>
            <label className="field field--full"><span>Changes from the original plan</span><textarea rows={3} value={review.changes} onChange={(event) => updateReview({ ...review, changes: event.target.value })} /></label>
            <label className="field"><span>Actual consequences</span><textarea rows={3} value={review.actualConsequences} onChange={(event) => updateReview({ ...review, actualConsequences: event.target.value })} /></label>
            <label className="field"><span>Final follow-up</span><textarea aria-label={`${segment.title} final follow-up`} rows={3} value={review.finalFollowUp} onChange={(event) => updateReview({ ...review, finalFollowUp: event.target.value })} /></label>
            <label className="field field--full"><span>Private correction notes</span><textarea rows={2} value={review.privateCorrectionNotes} onChange={(event) => updateReview({ ...review, privateCorrectionNotes: event.target.value })} /></label>
          </div>
          <footer><button className="primary-button" type="button" onClick={() => completeReview(review)}>{review.status === "Reviewed" ? "Save Final Record Correction" : "Complete Final Record Review"}</button><button className="secondary-button" type="button" disabled={review.status !== "Reviewed"} onClick={() => createActualCheckpoint(review)}>{review.outputVersionId ? "Refresh Reconciled Actual Version" : "Create Reconciled Actual Version"}</button>{review.outputVersionId && <span>Output version: {review.outputVersionId}</span>}</footer>
        </article>;
      })}</div>
    </section>}

    {activeSection === "championships" && <section className="wrap-up-section">
      <header><div><h4>Championship decision queue</h4><p>Every title-lineage effect requires explicit confirmation. Multi-person outcomes remain blocked until the new champion names are resolved.</p></div></header>
      {session.championshipDecisions.length === 0 ? <div className="empty-state compact">No unconfirmed championship result is linked to this show.</div> : <div className="wrap-up-decision-list">{session.championshipDecisions.map((decision) => {
        const championship = championships.championships.find((item) => item.id === decision.championshipId);
        return <article key={decision.id}><header><div><strong>{decision.championshipName}</strong><span>{decision.championEntering || "Champion unresolved"} vs {decision.challenger || "Challenger unresolved"}</span></div><DecisionStatus status={decision.status} /></header><dl><div><dt>Actual TEW winner</dt><dd>{decision.actualWinner || "Unavailable"}</dd></div><div><dt>Suggested</dt><dd>{decision.suggestedDecision}</dd></div><div><dt>Current champion</dt><dd>{championship?.currentChampions.map((item) => item.name).join(" & ") || "Vacant"}</dd></div></dl><div className="wrap-up-form-grid"><label className="field"><span>Decision</span><select aria-label={`${decision.championshipName} wrap-up decision`} value={decision.decision} disabled={decision.status === "Confirmed" || decision.status === "Deferred"} onChange={(event) => updateChampionship({ ...decision, decision: event.target.value as WrapUpChampionshipDecision["decision"] })}><option>Retained</option><option>Changed Hands</option><option>Vacated</option><option>Unresolved</option><option>Deferred</option></select></label><label className="field"><span>Resolved new champion name(s)</span><input aria-label={`${decision.championshipName} resolved champions`} disabled={decision.decision !== "Changed Hands" || decision.status === "Confirmed"} value={decision.resolvedChampionNames} onChange={(event) => updateChampionship({ ...decision, resolvedChampionNames: event.target.value })} /></label><label className="field field--full"><span>Decision reason / correction note</span><textarea rows={2} disabled={decision.status === "Confirmed" || decision.status === "Deferred"} value={decision.reason} onChange={(event) => updateChampionship({ ...decision, reason: event.target.value })} /></label></div><p className="wrap-up-preview">{championship ? championshipPreviewLabel(championship, decision) : decision.preview}</p><button className="primary-button" type="button" disabled={decision.status === "Confirmed" || decision.status === "Deferred"} onClick={() => confirmChampionship(decision)}>Confirm Championship Decision</button></article>;
      })}</div>}
    </section>}

    {activeSection === "competitions" && <section className="wrap-up-section">
      <header><div><h4>Competition-result queue</h4><p>Preview bracket advancement or league-table changes before confirming the result. Identity ambiguity blocks advancement.</p></div></header>
      {session.competitionDecisions.length === 0 ? <div className="empty-state compact">No unresolved competition fixture is linked to this show.</div> : <div className="wrap-up-decision-list">{session.competitionDecisions.map((decision) => {
        const competition = competitions.competitions.find((item) => item.id === decision.competitionId);
        const fixture = competition?.fixtures.find((item) => item.id === decision.fixtureId);
        const allowedIds = [fixture?.participantAId, fixture?.participantBId].filter(Boolean) as string[];
        return <article key={decision.id}><header><div><strong>{decision.competitionName} · {decision.roundLabel}</strong><span>Actual TEW winner: {decision.actualWinner || "Unavailable"}</span></div><DecisionStatus status={decision.status} /></header><div className="wrap-up-form-grid"><label className="field"><span>Result type</span><select aria-label={`${decision.competitionName} result type`} value={decision.resultType} disabled={decision.status === "Confirmed" || decision.status === "Deferred"} onChange={(event) => updateCompetition({ ...decision, resultType: event.target.value as WrapUpCompetitionDecision["resultType"] })}><option>Decision</option><option>Draw</option><option>No Contest</option><option>Cancelled</option><option>Deferred</option></select></label><label className="field"><span>Confirmed competition participant</span><select aria-label={`${decision.competitionName} winner participant`} value={decision.proposedWinnerParticipantId} disabled={decision.resultType !== "Decision" || decision.status === "Confirmed"} onChange={(event) => { const participant = competition?.participants.find((item) => item.id === event.target.value); updateCompetition({ ...decision, proposedWinnerParticipantId: event.target.value, proposedWinnerName: participant?.name ?? "" }); }}><option value="">Choose participant…</option>{competition?.participants.filter((item) => allowedIds.includes(item.id)).map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label><label className="field field--full"><span>Decision note</span><textarea rows={2} value={decision.reason} disabled={decision.status === "Confirmed" || decision.status === "Deferred"} onChange={(event) => updateCompetition({ ...decision, reason: event.target.value })} /></label></div><pre className="wrap-up-preview">{decision.preview}</pre><button className="primary-button" type="button" disabled={decision.status === "Confirmed" || decision.status === "Deferred"} onClick={() => confirmCompetition(decision)}>Confirm Competition Result</button></article>;
      })}</div>}
    </section>}

    {activeSection === "continuity" && <section className="wrap-up-section">
      <header><div><h4>Storyline, booking-idea, and character-arc review</h4><p>No phase, payoff, turn, betrayal, or arc advancement is inferred. Every update below is an explicit creative decision.</p></div></header>
      <div className="wrap-up-subsection"><h5>Assigned Storyline Milestones</h5>{session.milestoneDecisions.length === 0 ? <p>No active milestone was assigned to this show.</p> : session.milestoneDecisions.map((decision) => <article className="wrap-up-continuity-card" key={decision.id}><header><div><strong>{decision.storylineName}</strong><span>{decision.milestoneTitle}</span></div><DecisionStatus status={decision.status} /></header><div className="wrap-up-form-grid"><label className="field"><span>Milestone decision</span><select aria-label={`${decision.milestoneTitle} milestone decision`} value={decision.decision} disabled={decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, decision: event.target.value as WrapUpMilestoneDecision["decision"] })}><option>Completed</option><option>Delayed</option><option>Cancelled</option><option>Reassigned</option><option>Unchanged</option></select></label><label className="field"><span>Target show</span><select value={decision.targetShowId} disabled={!(["Delayed", "Reassigned"].includes(decision.decision)) || decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, targetShowId: event.target.value })}><option value="">Choose show…</option>{shows.filter((item) => item.id !== show.id).map((item) => <option key={item.id} value={item.id}>{item.date} · {item.name}</option>)}</select></label><label className="field"><span>Storyline status</span><select value={decision.storylineStatus} disabled={decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, storylineStatus: event.target.value as WrapUpMilestoneDecision["storylineStatus"] })}><option value="">Leave unchanged</option><option>Idea</option><option>Planned</option><option>Active</option><option>Paused</option><option>Completed</option><option>Abandoned</option></select></label><label className="field"><span>Current phase</span><input value={decision.currentPhase} disabled={decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, currentPhase: event.target.value })} /></label><label className="field"><span>Aftermath</span><textarea rows={2} value={decision.aftermath} disabled={decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, aftermath: event.target.value })} /></label><label className="field"><span>Review note</span><textarea rows={2} value={decision.note} disabled={decision.status === "Confirmed"} onChange={(event) => updateMilestone({ ...decision, note: event.target.value })} /></label></div><button className="secondary-button" type="button" disabled={decision.status === "Confirmed"} onClick={() => confirmMilestone(decision)}>Confirm Milestone Decision</button></article>)}</div>
      <div className="wrap-up-subsection"><h5>Linked Booking Ideas</h5>{session.bookingIdeaDecisions.length === 0 ? <p>No open booking idea is linked to this show.</p> : session.bookingIdeaDecisions.map((decision) => <article className="wrap-up-continuity-card" key={decision.id}><header><strong>{decision.ideaTitle}</strong><DecisionStatus status={decision.status} /></header><div className="wrap-up-form-grid"><label className="field"><span>Idea decision</span><select aria-label={`${decision.ideaTitle} idea decision`} value={decision.decision} disabled={decision.status === "Confirmed"} onChange={(event) => updateIdea({ ...decision, decision: event.target.value as WrapUpBookingIdeaDecision["decision"] })}><option>Completed</option><option>Delayed</option><option>Keep Active</option><option>Reassigned</option><option>Archived</option></select></label><label className="field"><span>Later show</span><select value={decision.targetShowId} disabled={!(["Delayed", "Reassigned"].includes(decision.decision)) || decision.status === "Confirmed"} onChange={(event) => updateIdea({ ...decision, targetShowId: event.target.value })}><option value="">Choose show…</option>{shows.filter((item) => item.id !== show.id).map((item) => <option key={item.id} value={item.id}>{item.date} · {item.name}</option>)}</select></label><label className="field field--full"><span>Decision note</span><textarea rows={2} value={decision.note} disabled={decision.status === "Confirmed"} onChange={(event) => updateIdea({ ...decision, note: event.target.value })} /></label></div><button className="secondary-button" type="button" disabled={decision.status === "Confirmed"} onClick={() => confirmIdea(decision)}>Confirm Booking-Idea Decision</button></article>)}</div>
      <div className="wrap-up-subsection"><h5>Character Arcs Due on This Show</h5>{session.arcDecisions.length === 0 ? <p>No active character arc targets this show.</p> : session.arcDecisions.map((decision) => <article className="wrap-up-continuity-card" key={decision.id}><header><div><strong>{decision.workerName}</strong><span>{decision.arcName}</span></div><DecisionStatus status={decision.status} /></header><div className="wrap-up-form-grid"><label className="field"><span>Arc decision</span><select aria-label={`${decision.arcName} arc decision`} value={decision.decision} disabled={decision.status === "Confirmed"} onChange={(event) => updateArc({ ...decision, decision: event.target.value as WrapUpArcDecision["decision"] })}><option>Progress</option><option>Turning Point</option><option>Resolution</option><option>Delayed</option><option>Keep Active</option></select></label><label className="field"><span>Later show</span><select value={decision.targetShowId} disabled={decision.decision !== "Delayed" || decision.status === "Confirmed"} onChange={(event) => updateArc({ ...decision, targetShowId: event.target.value })}><option value="">Choose show…</option>{shows.filter((item) => item.id !== show.id).map((item) => <option key={item.id} value={item.id}>{item.date} · {item.name}</option>)}</select></label><label className="field field--full"><span>What occurred?</span><textarea aria-label={`${decision.arcName} progress note`} rows={3} value={decision.progressNote} disabled={decision.status === "Confirmed"} onChange={(event) => updateArc({ ...decision, progressNote: event.target.value })} /></label></div><button className="secondary-button" type="button" disabled={decision.status === "Confirmed"} onClick={() => confirmArc(decision)}>Confirm Character-Arc Decision</button></article>)}</div>
    </section>}

    {activeSection === "follow-ups" && <section className="wrap-up-section">
      <header><div><h4>Continuity rollforward</h4><p>Move final follow-ups into the calendar or a future card while preserving their source. The tracker never chooses wrestlers, dialogue, winner, finish, or exact development.</p></div></header>
      {session.followUpDecisions.length === 0 ? <div className="empty-state compact">No final follow-up is recorded on this show.</div> : <div className="wrap-up-decision-list">{session.followUpDecisions.map((decision) => {
        const targetShow = shows.find((item) => item.id === decision.targetShowId);
        return <article key={decision.id}><header><div><strong>{decision.sourceSegmentTitle}</strong><span>{decision.finalFollowUp || decision.plannedFollowUp}</span></div><DecisionStatus status={decision.status} /></header><div className="wrap-up-form-grid"><label className="field"><span>Destination</span><select aria-label={`${decision.sourceSegmentTitle} follow-up destination`} value={decision.destination} disabled={decision.status === "Confirmed"} onChange={(event) => updateFollowUp({ ...decision, destination: event.target.value as WrapUpFollowUpDecision["destination"] })}><option>Promotion Calendar Inbox</option><option>Existing Segment</option><option>New Match</option><option>New Angle</option><option>Dismissed</option><option>Left Open</option></select></label><label className="field"><span>Target show</span><select aria-label={`${decision.sourceSegmentTitle} follow-up target show`} value={decision.targetShowId} disabled={!["Promotion Calendar Inbox", "Existing Segment", "New Match", "New Angle"].includes(decision.destination) || decision.status === "Confirmed"} onChange={(event) => updateFollowUp({ ...decision, targetShowId: event.target.value, targetSegmentId: "" })}><option value="">Choose show…</option>{shows.filter((item) => item.id !== show.id).sort((a, b) => a.date.localeCompare(b.date)).map((item) => <option key={item.id} value={item.id}>{item.date} · {item.name}</option>)}</select></label>{decision.destination === "Existing Segment" && <label className="field field--full"><span>Target segment</span><select value={decision.targetSegmentId} disabled={decision.status === "Confirmed"} onChange={(event) => updateFollowUp({ ...decision, targetSegmentId: event.target.value })}><option value="">Choose segment…</option>{targetShow?.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label>}<label className="field field--full"><span>Reason / decision note</span><textarea rows={2} value={decision.reason} disabled={decision.status === "Confirmed"} onChange={(event) => updateFollowUp({ ...decision, reason: event.target.value })} /></label></div><button className="primary-button" type="button" disabled={decision.status === "Confirmed"} onClick={() => confirmFollowUp(decision)}>Confirm Follow-Up Decision</button></article>;
      })}</div>}
    </section>}

    {activeSection === "closure" && <section className="wrap-up-section wrap-up-closure">
      <header><div><h4>Show Closure checklist</h4><p>Closure preserves a permanent report but does not prevent later amendments.</p></div><DecisionStatus status={session.status} /></header>
      <div className="wrap-up-closure-grid"><article className={progress.segmentReviewsComplete === progress.segmentReviewsTotal ? "complete" : "pending"}><strong>Final segment records</strong><span>{progress.segmentReviewsComplete}/{progress.segmentReviewsTotal}</span></article><article className={progress.outputCheckpointsComplete === progress.outputCheckpointsTotal ? "complete" : "pending"}><strong>Reconciled Actual Versions</strong><span>{progress.outputCheckpointsComplete}/{progress.outputCheckpointsTotal}</span></article><article className={progress.unresolvedMatchResults === 0 ? "complete" : "pending"}><strong>Match result links</strong><span>{progress.unresolvedMatchResults} unresolved</span></article><article className={progress.championshipPending === 0 ? "complete" : "pending"}><strong>Championship decisions</strong><span>{progress.championshipPending} pending</span></article><article className={progress.competitionPending === 0 ? "complete" : "pending"}><strong>Competition decisions</strong><span>{progress.competitionPending} pending</span></article><article className={progress.milestonePending + progress.bookingIdeaPending + progress.arcPending === 0 ? "complete" : "pending"}><strong>Continuity decisions</strong><span>{progress.milestonePending + progress.bookingIdeaPending + progress.arcPending} pending</span></article><article className={progress.followUpPending === 0 ? "complete" : "pending"}><strong>Follow-ups</strong><span>{progress.followUpPending} pending</span></article></div>
      <div className="wrap-up-closure-actions">{session.status !== "Closed" ? <button className="primary-button" type="button" disabled={!progress.canClose} onClick={closeSession}>Close Wrap-Up and Generate Report</button> : <><button className="primary-button" type="button" onClick={closeAndContinue}>Close Wrap-Up and Open Next Scheduled Show</button><button className="secondary-button" type="button" onClick={openAmendment}>Open Correction Amendment</button></>}<button className="secondary-button" type="button" onClick={onOpenCalendar}>Return to Promotion Calendar</button><button className="danger-button" type="button" disabled={!session.preWrapSnapshotJson || session.status === "Closed"} onClick={rollbackEntireSession}>Restore Pre-Wrap-Up Snapshot</button><button className="secondary-button" type="button" disabled={!latestAudit || session.status === "Closed"} onClick={undoLatestChange}>Undo Latest Applied Change</button></div>
      {currentReport ? <ClosureReportCard report={currentReport} onNotice={setNotice} /> : <div className="empty-state compact">Complete the checklist to generate the permanent Show Closure Report.</div>}
      <section className="wrap-up-audit-list"><header><h5>Audit history</h5><span>{session.auditIds.length}</span></header>{session.auditIds.length === 0 ? <p>No post-show consequence has been applied yet.</p> : session.auditIds.slice(0, 20).map((id) => { const audit = wrapUp.audits.find((item) => item.id === id); return audit ? <article key={audit.id} className={audit.reversedAt ? "reversed" : ""}><div><strong>{audit.kind}: {audit.action}</strong><span>{audit.reason || "No reason entered"}</span></div><small>{formatDate(audit.createdAt)}{audit.reversedAt ? ` · Reversed ${formatDate(audit.reversedAt)}` : ""}</small></article> : null; })}</section>
    </section>}
  </section>;
}
