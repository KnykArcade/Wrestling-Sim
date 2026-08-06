import { useEffect, useMemo, useState } from "react";
import { loadChampionshipUniverse } from "../championships/storage";
import { loadCompetitionUniverse } from "../competitions/storage";
import { applyCoreResultConsequences, synchronizeWorkerRecordsFromProfiles } from "../consequences/model";
import { loadResultConsequenceUniverse, saveResultConsequenceUniverse } from "../consequences/storage";
import type { ResultConsequenceUniverse } from "../consequences/types";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import { activeResolutionAttempt } from "../matchResolution/engine";
import { loadMatchResolutionUniverse, saveMatchResolutionUniverse } from "../matchResolution/storage";
import type { MatchResolutionRecord, MatchResolutionUniverse } from "../matchResolution/types";
import { touchShow } from "../planner/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import { applyAngleEvaluation, calculateAngleEvaluation, evaluateCompletedShow, finalizeAngleEvaluation } from "../showEvaluation/model";
import { loadShowEvaluationUniverse, saveShowEvaluationUniverse } from "../showEvaluation/storage";
import type { AngleEvaluation, ShowEvaluationUniverse } from "../showEvaluation/types";
import { loadActiveStartingUniverse, loadStartingUniverseState } from "../startingUniverse/storage";
import {
  canCompleteLiveCard,
  completeAngleCorrection,
  completeAngleSegment,
  completeLiveCard,
  createLiveCardSession,
  insertGroundedAngle,
  lockMatchResult,
  liveCardReadiness,
  nextUnfinishedMatchId,
  nextUnfinishedSegmentId,
  openSegmentCorrection,
  selectLiveCardSegment,
  skipLiveCardSegment,
  startLiveCardSession,
  synchronizeLiveCardSession,
  upsertLiveCardSession,
} from "./model";
import { loadLiveCardUniverse, saveLiveCardUniverse } from "./storage";
import type { GroundedAngleInput, LiveCardSession, LiveCardUniverse } from "./types";

interface LiveCardRunnerWorkspaceProps {
  onOpenResolution: () => void;
  onOpenConsequences: () => void;
  onOpenPlanner: (showId: string, segmentId: string) => void;
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolutionForSegment(showId: string, segmentId: string, universe: MatchResolutionUniverse): MatchResolutionRecord | null {
  return universe.records.find((record) => record.showId === showId && record.segmentId === segmentId) ?? null;
}

function finalized(record: MatchResolutionRecord | null): boolean {
  const attempt = activeResolutionAttempt(record);
  return Boolean(attempt?.finalResult && (attempt.status === "Accepted" || attempt.status === "Overridden"));
}

function resultFacts(record: MatchResolutionRecord | null): string[] {
  const attempt = activeResolutionAttempt(record);
  if (!attempt?.finalResult) return [];
  return [
    `${attempt.finalResult.winnerName} defeated ${attempt.finalResult.loserName}.`,
    attempt.finalResult.finishDescription,
    ...(attempt.finalResult.fallWinnerName && attempt.finalResult.fallLoserName && attempt.finalResult.winnerMemberKeys && attempt.finalResult.winnerMemberKeys.length > 1
      ? [`Deciding fall: ${attempt.finalResult.fallWinnerName} over ${attempt.finalResult.fallLoserName}.`]
      : []),
    ...(attempt.finalResult.eliminationOrder?.map((elimination) => `Elimination ${elimination.order}: ${elimination.byWorkerName} eliminated ${elimination.eliminatedWorkerName}.`) ?? []),
    `Duration: ${attempt.finalResult.actualDurationMinutes.toFixed(2)} minutes.`,
    `Match score: ${attempt.finalResult.matchScore.toFixed(1)} · ${attempt.finalResult.starRating} stars.`,
    attempt.status === "Overridden" ? `Booker override: ${attempt.finalResult.overrideReason}` : "Engine result accepted.",
  ];
}

function selectedSession(show: PlannedShow | null, resolutions: MatchResolutionUniverse, universe: LiveCardUniverse): LiveCardSession | null {
  if (!show) return null;
  return synchronizeLiveCardSession(show, resolutions, universe.sessions.find((session) => session.showId === show.id) ?? null);
}

export default function LiveCardRunnerWorkspace({ onOpenResolution, onOpenConsequences, onOpenPlanner }: LiveCardRunnerWorkspaceProps) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [resolutions, setResolutions] = useState<MatchResolutionUniverse>(() => loadMatchResolutionUniverse(window.localStorage));
  const [universe, setUniverse] = useState<LiveCardUniverse>(() => loadLiveCardUniverse(window.localStorage));
  const [consequences, setConsequences] = useState<ResultConsequenceUniverse>(() => loadResultConsequenceUniverse(window.localStorage));
  const [evaluations, setEvaluations] = useState<ShowEvaluationUniverse>(() => loadShowEvaluationUniverse(window.localStorage));
  const initialShowId = universe.settings.selectedShowId && shows.some((show) => show.id === universe.settings.selectedShowId) ? universe.settings.selectedShowId : shows[0]?.id ?? "";
  const [selectedShowId, setSelectedShowId] = useState(initialShowId);
  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const syncedSession = useMemo(() => selectedSession(selectedShow, resolutions, universe), [selectedShow, resolutions, universe.sessions]);
  const [notice, setNotice] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [angleTitle, setAngleTitle] = useState("");
  const [anglePurpose, setAnglePurpose] = useState("");
  const [angleLocation, setAngleLocation] = useState("In The Ring");
  const [angleContentType, setAngleContentType] = useState("Serious");
  const [angleMode, setAngleMode] = useState<GroundedAngleInput["mode"]>("Follow-Up Angle");
  const [angleOverrideScore, setAngleOverrideScore] = useState(70);
  const [angleOverrideReason, setAngleOverrideReason] = useState("");

  const session = selectedShow ? universe.sessions.find((item) => item.showId === selectedShow.id) ?? syncedSession : null;
  const currentSegment = selectedShow?.segments.find((segment) => segment.id === session?.currentSegmentId) ?? selectedShow?.segments[0] ?? null;
  const currentProgress = session?.progress.find((progress) => progress.segmentId === currentSegment?.id) ?? null;
  const currentResolution = selectedShow && currentSegment?.type === "match" ? resolutionForSegment(selectedShow.id, currentSegment.id, resolutions) : null;
  const currentAttempt = activeResolutionAttempt(currentResolution);
  const resultReady = finalized(currentResolution);
  const remainingSegments = session?.progress.filter((progress) => !["Completed", "Skipped"].includes(progress.status)).length ?? 0;
  const completedSegments = session?.progress.filter((progress) => progress.status === "Completed").length ?? 0;
  const insertedSegments = session?.progress.filter((progress) => progress.insertedDuringShow).length ?? 0;
  const readiness = useMemo(() => selectedShow ? liveCardReadiness(selectedShow) : { ready: false, blockers: ["Create a show before starting the live card."] }, [selectedShow]);
  const currentApplication = consequences.applications.find((application) => application.resolutionAttemptId === currentAttempt?.id && application.status === "Applied") ?? null;
  const guardedDecisions = currentApplication ? [
    ...consequences.championshipProposals.filter((proposal) => proposal.applicationId === currentApplication.id && proposal.status !== "Confirmed"),
    ...consequences.competitionProposals.filter((proposal) => proposal.applicationId === currentApplication.id && proposal.status !== "Confirmed"),
  ].length : 0;
  const currentAngleEvaluation = currentSegment?.type === "angle" ? evaluations.angleEvaluations.find((item) => item.showId === selectedShow?.id && item.segmentId === currentSegment.id) ?? null : null;
  const showReport = evaluations.showReports.find((report) => report.showId === selectedShow?.id) ?? null;

  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveLiveCardUniverse(window.localStorage, universe), [universe]);
  useEffect(() => saveShowEvaluationUniverse(window.localStorage, evaluations), [evaluations]);

  useEffect(() => {
    if (!selectedShow || !syncedSession) return;
    const existing = universe.sessions.find((item) => item.showId === selectedShow.id);
    if (!existing || JSON.stringify(existing.segmentOrder) !== JSON.stringify(syncedSession.segmentOrder) || existing.progress.length !== syncedSession.progress.length) {
      setUniverse((current) => upsertLiveCardSession(current, syncedSession));
    }
  }, [selectedShow?.id, selectedShow?.updatedAt, resolutions.records.length]);

  useEffect(() => {
    if (!currentSegment || !currentProgress) return;
    if (currentSegment.type === "angle") {
      setAngleTitle(currentSegment.title);
      setAnglePurpose(currentSegment.purpose);
      setAngleLocation(currentSegment.angleLocation || "In The Ring");
      setAngleContentType(currentSegment.angleContentType || "Serious");
    } else {
      const winner = currentAttempt?.finalResult?.winnerName ?? "Winner";
      setAngleTitle(`${winner} Post-Match Reaction`);
      setAnglePurpose("React to the official match result without inventing dialogue or a new action.");
    }
    setSkipReason("");
    setCorrectionReason("");
    setAngleOverrideReason("");
    setAngleOverrideScore(currentAngleEvaluation?.calculatedScore ?? 70);
  }, [currentSegment?.id, currentProgress?.status, currentAttempt?.id, currentAngleEvaluation?.id]);

  function updateSession(updater: (value: LiveCardSession) => LiveCardSession): void {
    if (!session) return;
    setUniverse((current) => upsertLiveCardSession(current, updater(current.sessions.find((item) => item.showId === session.showId) ?? session)));
  }

  function selectShow(showId: string): void {
    const show = shows.find((item) => item.id === showId);
    if (!show) return;
    setSelectedShowId(showId);
    const next = synchronizeLiveCardSession(show, resolutions, universe.sessions.find((item) => item.showId === show.id) ?? null);
    setUniverse((current) => upsertLiveCardSession(current, next));
  }

  function startShow(): void {
    if (!selectedShow || !session) return;
    if (!readiness.ready) {
      setNotice("The card is not ready. Fix the requirements shown below before starting the show.");
      return;
    }
    updateSession(startLiveCardSession);
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, status: show.status === "Draft" ? "Ready" : show.status }) : show));
    setNotice("The live show is now in progress. Resolve each match once, then react to what actually happened.");
  }

  function selectSegment(segmentId: string): void {
    updateSession((value) => selectLiveCardSegment(value, segmentId));
  }

  function openResolution(): void {
    if (!selectedShow || !currentSegment) return;
    const current = loadMatchResolutionUniverse(window.localStorage);
    saveMatchResolutionUniverse(window.localStorage, { ...current, settings: { ...current.settings, selectedShowId: selectedShow.id, selectedSegmentId: currentSegment.id } });
    onOpenResolution();
  }

  function refreshResult(): void {
    const current = loadMatchResolutionUniverse(window.localStorage);
    setResolutions(current);
    if (!selectedShow || !session) return;
    setUniverse((value) => upsertLiveCardSession(value, synchronizeLiveCardSession(selectedShow, current, value.sessions.find((item) => item.showId === selectedShow.id) ?? session)));
    setNotice("Match Resolution data refreshed from the official result workspace.");
  }

  function lockCurrentMatch(): void {
    if (!session || !currentResolution || !selectedShow) return;
    try {
      const nextSession = lockMatchResult(session, currentResolution);
      setUniverse((current) => upsertLiveCardSession(current, nextSession));
      const currentConsequences = loadResultConsequenceUniverse(window.localStorage);
      const attempt = activeResolutionAttempt(currentResolution);
      const alreadyApplied = currentConsequences.applications.some((application) => application.resolutionAttemptId === attempt?.id && application.status === "Applied");
      if (alreadyApplied) {
        setConsequences(currentConsequences);
        setNotice("The official result is locked. Its consequences were already applied, so no duplicate records were created.");
        return;
      }
      const consequenceResult = applyCoreResultConsequences({
        universe: currentConsequences,
        resolution: currentResolution,
        shows: loadPlannedShows(window.localStorage),
        profiles: loadMatchEngineUniverse(window.localStorage).profiles,
        championships: loadChampionshipUniverse(window.localStorage),
        competitions: loadCompetitionUniverse(window.localStorage),
      });
      saveResultConsequenceUniverse(window.localStorage, consequenceResult.universe);
      saveMatchEngineUniverse(window.localStorage, { profiles: consequenceResult.profiles });
      savePlannedShows(window.localStorage, consequenceResult.shows);
      setConsequences(consequenceResult.universe);
      setShows(consequenceResult.shows);
      const application = consequenceResult.universe.applications.find((item) => item.resolutionAttemptId === attempt?.id);
      const decisionCount = application ? consequenceResult.universe.championshipProposals.filter((item) => item.applicationId === application.id).length + consequenceResult.universe.competitionProposals.filter((item) => item.applicationId === application.id).length : 0;
      setNotice(decisionCount ? `The result is locked and core consequences are applied. ${decisionCount} permanent decision${decisionCount === 1 ? " is" : "s are"} ready for your confirmation.` : "The result is locked and its records, rankings, momentum, condition, and history are updated exactly once.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The match result could not be locked.");
    }
  }

  function reviewConsequences(): void {
    if (!currentApplication) return;
    const next = { ...consequences, settings: { ...consequences.settings, selectedApplicationId: currentApplication.id, activeTab: guardedDecisions ? "decisions" as const : "overview" as const } };
    saveResultConsequenceUniverse(window.localStorage, next);
    onOpenConsequences();
  }

  function updateAngleField(patch: Partial<PlannedSegment>): void {
    if (!selectedShow || !currentSegment || currentSegment.type !== "angle") return;
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, segments: show.segments.map((segment) => segment.id === currentSegment.id ? { ...segment, ...patch } : segment) }) : show));
  }

  function completeAngle(): void {
    if (!session || !currentSegment || currentSegment.type !== "angle") return;
    try {
      if (currentProgress?.status === "Correction") {
        const next = completeAngleCorrection(session, currentSegment.id, currentSegment.segmentOutput);
        setUniverse((current) => upsertLiveCardSession(current, next));
        setNotice("The angle correction is complete. Its original evaluation and one-time consequences remain preserved.");
        return;
      }
      const calculated = calculateAngleEvaluation(selectedShow!, currentSegment, loadMatchEngineUniverse(window.localStorage).profiles);
      setEvaluations((current) => ({ ...current, angleEvaluations: [calculated, ...current.angleEvaluations.filter((item) => !(item.showId === calculated.showId && item.segmentId === calculated.segmentId && !item.appliedAt))] }));
      setAngleOverrideScore(calculated.calculatedScore);
      setNotice("The angle result is calculated. Accept it or enter an explained override before the segment is completed.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The angle result could not be calculated.");
    }
  }

  function finalizeCurrentAngle(mode: "accept" | "override"): void {
    if (!session || !currentSegment || currentSegment.type !== "angle" || !currentAngleEvaluation) return;
    try {
      const finalized = finalizeAngleEvaluation(currentAngleEvaluation, mode === "override" ? angleOverrideScore : undefined, mode === "override" ? angleOverrideReason : "");
      const matchEngine = loadMatchEngineUniverse(window.localStorage);
      const applied = applyAngleEvaluation(evaluations, finalized, matchEngine.profiles);
      saveMatchEngineUniverse(window.localStorage, { profiles: applied.profiles });
      const synchronizedConsequences = synchronizeWorkerRecordsFromProfiles(loadResultConsequenceUniverse(window.localStorage), applied.profiles);
      saveResultConsequenceUniverse(window.localStorage, synchronizedConsequences);
      const next = completeAngleSegment(session, currentSegment.id, currentSegment.segmentOutput, currentSegment.consequences, currentSegment.followUp);
      setEvaluations(applied.universe);
      setConsequences(synchronizedConsequences);
      setUniverse((current) => upsertLiveCardSession(current, next));
      setNotice(mode === "override" ? "The explained angle override is official. Participant effects were applied exactly once." : "The calculated angle result is accepted. Participant effects were applied exactly once.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The angle result could not be finalized.");
    }
  }

  function skipCurrent(): void {
    if (!session || !currentSegment) return;
    try {
      updateSession((value) => skipLiveCardSegment(value, currentSegment.id, skipReason));
      setSkipReason("");
      setNotice("The segment was deliberately skipped with its reason preserved.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The segment could not be skipped.");
    }
  }

  function openCorrection(): void {
    if (!session || !currentSegment) return;
    try {
      updateSession((value) => openSegmentCorrection(value, currentSegment.id, correctionReason));
      setCorrectionReason("");
      setNotice(currentSegment.type === "match" ? "Match-result correction history is open. Use Match Resolution for an explicit corrected booking; the completed result cannot be silently rerolled." : "Angle correction opened. The completed output remains preserved.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Correction mode could not be opened.");
    }
  }

  function insertAngle(): void {
    if (!selectedShow || !session || !currentSegment || currentSegment.type !== "match") return;
    try {
      const result = insertGroundedAngle(selectedShow, session, currentSegment.id, { title: angleTitle, purpose: anglePurpose, location: angleLocation, contentType: angleContentType, mode: angleMode });
      setShows((current) => current.map((show) => show.id === selectedShow.id ? result.show : show));
      setUniverse((current) => upsertLiveCardSession(current, result.session));
      setNotice(`${angleMode} inserted directly after the result. Only fixed match facts and existing participants were carried forward.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The grounded angle could not be inserted.");
    }
  }

  function moveNext(mode: "segment" | "match"): void {
    if (!session) return;
    const nextId = mode === "match" ? nextUnfinishedMatchId(session) : nextUnfinishedSegmentId(session);
    if (!nextId) {
      setNotice("There are no additional unfinished segments in that category.");
      return;
    }
    updateSession((value) => selectLiveCardSegment(value, nextId));
  }

  async function completeShow(): Promise<void> {
    if (!session || !selectedShow) return;
    try {
      const next = completeLiveCard(session);
      const startingUniverse = await loadActiveStartingUniverse(loadStartingUniverseState(window.localStorage));
      const company = startingUniverse?.companies.find((item) => item.id === startingUniverse.playableCompanyId) ?? null;
      const evaluated = evaluateCompletedShow(evaluations, selectedShow, next, { company, profiles: loadMatchEngineUniverse(window.localStorage).profiles });
      setUniverse((current) => upsertLiveCardSession(current, next));
      setEvaluations(evaluated);
      setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, status: "Completed" }) : show));
      setNotice("The show is complete. Its final rating, crowd path, attendance, popularity effect, and all one-time segment consequences are preserved below.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The show could not be completed.");
    }
  }

  return <section className="live-card-workspace">
    <header className="live-card-hero"><div><p className="eyebrow">RUN LIVE SHOW</p><h2>Run the show one segment at a time and let completed results reshape everything that follows</h2><p>The selected show and segment stay with you from the booked card through the official result, consequences, and final show summary.</p></div><div className="live-card-principle"><span>Live booking loop</span><strong>Result → Consequence → Next Segment</strong><small>Completed results are locked. Corrections create audit history instead of invisible recalculation.</small></div></header>
    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="live-card-toolbar"><label className="field"><span>Show to run</span><select aria-label="Live card planned show" value={selectedShow?.id ?? ""} onChange={(event) => selectShow(event.target.value)}><option value="">No planned show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.date || "Unscheduled"}</option>)}</select></label><button className="primary-button" type="button" disabled={!session || session.status !== "Planned" || !readiness.ready} onClick={startShow}>Start Live Show</button><button className="secondary-button" type="button" disabled={!currentSegment} onClick={() => currentSegment && onOpenPlanner(selectedShow?.id ?? "", currentSegment.id)}>Edit Current Segment</button><button className="secondary-button" type="button" onClick={refreshResult}>Refresh Official Results</button></section>

    {!selectedShow || !session ? <div className="empty-state live-card-empty"><h3>No planned show is available</h3><p>Create the card first. Participants and context may be booked, but match winners can remain unresolved.</p></div> : <>
      {!readiness.ready && session.status === "Planned" && <section className="live-card-readiness" role="alert"><header><div><p className="eyebrow">CARD NOT READY</p><h3>Fix these requirements before starting</h3></div><span>{readiness.blockers.length}</span></header>{readiness.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}<button className="primary-button" type="button" onClick={() => onOpenPlanner(selectedShow.id, "")}>Return to Card Editor</button></section>}
      <section className="live-card-summary"><article><span>Show status</span><strong>{session.status}</strong></article><article><span>Card progress</span><strong>{completedSegments}/{session.progress.length}</strong></article><article><span>Remaining</span><strong>{remainingSegments}</strong></article><article><span>Inserted live</span><strong>{insertedSegments}</strong></article><article><span>Current segment</span><strong>{currentSegment ? session.segmentOrder.indexOf(currentSegment.id) + 1 : 0}</strong></article></section>

      <div className="live-card-layout"><aside className="live-card-running-order"><header><div><p className="eyebrow">RUNNING ORDER</p><h3>{selectedShow.name}</h3><span>{selectedShow.date || "Unscheduled"}</span></div><b>{session.progress.length}</b></header><div>{session.segmentOrder.map((segmentId, index) => { const progress = session.progress.find((item) => item.segmentId === segmentId); const segment = selectedShow.segments.find((item) => item.id === segmentId); if (!progress || !segment) return null; return <button type="button" key={segmentId} className={`${currentSegment?.id === segmentId ? "active" : ""} live-card-status--${statusClass(progress.status)}`} onClick={() => selectSegment(segmentId)}><strong>{index + 1}</strong><span><b>{segment.title}</b><small>{segment.type === "match" ? "Match" : "Angle"} · {segment.durationMinutes} min</small><em>{progress.status}{progress.insertedDuringShow ? " · Inserted live" : ""}</em></span></button>; })}</div><footer><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Next Unfinished Segment</button><button className="secondary-button" type="button" onClick={() => moveNext("match")}>Next Match</button></footer></aside>

        <main className="live-card-current">{!currentSegment || !currentProgress ? <div className="empty-state"><h3>No current segment</h3></div> : <>
          <section className="live-card-current-header"><div><p className="eyebrow">SEGMENT {session.segmentOrder.indexOf(currentSegment.id) + 1}</p><h2>{currentSegment.title}</h2><p>{currentSegment.type === "match" ? currentSegment.workers.map((worker) => worker.name).join(" vs. ") : currentSegment.angleLocation} · {currentSegment.durationMinutes} minutes</p></div><span className={`live-card-status-badge live-card-status--${statusClass(currentProgress.status)}`}>{currentProgress.status}</span></section>

          {currentSegment.type === "match" ? <section className="live-card-match-panel"><header><div><p className="eyebrow">OFFICIAL MATCH RESULT</p><h3>{resultReady ? `${currentAttempt?.finalResult?.winnerName} defeated ${currentAttempt?.finalResult?.loserName}` : currentResolution ? "Engine result awaiting acceptance or override" : "No official result yet"}</h3></div><span>{currentResolution?.status ?? "Unresolved"}</span></header>{currentAttempt ? <div className="live-card-result-facts">{resultFacts(currentResolution).map((fact) => <p key={fact}>{fact}</p>)}</div> : <p>Open Run Matches. The wrestlers choose approaches and the engine produces one official result for the current setup.</p>}<div className="live-card-actions"><button className="primary-button" type="button" onClick={openResolution}>{currentResolution ? "Open Official Match Result" : "Run This Match"}</button><button className="secondary-button" type="button" disabled={!resultReady || currentProgress.status === "Completed"} onClick={lockCurrentMatch}>Lock Result Into Live Card</button></div>
            {currentProgress.status === "Completed" && currentProgress.result && <section className="live-card-post-result"><header><div><p className="eyebrow">REACTIVE BOOKING</p><h3>What happens because of this result?</h3></div><span>{currentProgress.result.status}</span></header><div className="live-card-grounded-facts">{currentProgress.groundedFacts.length ? currentProgress.groundedFacts.map((fact) => <p key={fact}>{fact}</p>) : resultFacts(currentResolution).map((fact) => <p key={fact}>{fact}</p>)}</div><div className="live-card-angle-form"><label className="field"><span>New segment type</span><select aria-label="Live card inserted segment mode" value={angleMode} onChange={(event) => setAngleMode(event.target.value as GroundedAngleInput["mode"])}><option>Follow-Up Angle</option><option>Post-Match Segment</option></select></label><label className="field"><span>Segment name</span><input aria-label="Live card inserted angle title" value={angleTitle} onChange={(event) => setAngleTitle(event.target.value)} /></label><label className="field"><span>Purpose</span><textarea aria-label="Live card inserted angle purpose" rows={3} value={anglePurpose} onChange={(event) => setAnglePurpose(event.target.value)} /></label><label className="field"><span>Location</span><input aria-label="Live card inserted angle location" value={angleLocation} onChange={(event) => setAngleLocation(event.target.value)} /></label><label className="field"><span>Content type</span><input aria-label="Live card inserted angle content type" value={angleContentType} onChange={(event) => setAngleContentType(event.target.value)} /></label></div><div className="live-card-actions"><button className="primary-button" type="button" onClick={insertAngle}>Insert After This Match</button><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Move to Next Segment</button><button className="secondary-button" type="button" onClick={() => moveNext("match")}>Move to Next Match</button></div></section>}
          </section> : <section className="live-card-angle-panel"><header><div><p className="eyebrow">ANGLE RESULT</p><h3>{currentProgress.insertedDuringShow ? "Write and evaluate the reaction to the actual result" : "Complete and evaluate the planned angle"}</h3></div><span>{currentAngleEvaluation?.appliedAt ? `${currentAngleEvaluation.finalScore.toFixed(1)} · ${currentAngleEvaluation.status}` : currentProgress.corrections.length ? `${currentProgress.corrections.length} correction${currentProgress.corrections.length === 1 ? "" : "s"}` : "Awaiting result"}</span></header>{currentProgress.groundedFacts.length > 0 && <div className="live-card-grounded-facts"><strong>Fixed result facts</strong>{currentProgress.groundedFacts.map((fact) => <p key={fact}>{fact}</p>)}<small>No dialogue, attack, challenge, turn, or new action was generated.</small></div>}<label className="field"><span>Final Angle Output</span><textarea aria-label="Live card final angle output" rows={12} value={currentSegment.segmentOutput} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ segmentOutput: event.target.value })} /></label><div className="live-card-angle-form"><label className="field"><span>Actual consequences</span><textarea aria-label="Live card angle consequences" rows={4} value={currentSegment.consequences} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ consequences: event.target.value })} /></label><label className="field"><span>Final follow-up</span><textarea aria-label="Live card angle follow up" rows={4} value={currentSegment.followUp} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ followUp: event.target.value })} /></label></div><div className="live-card-actions"><button className="primary-button" type="button" disabled={currentProgress.status === "Completed"} onClick={completeAngle}>{currentProgress.status === "Correction" ? "Complete Angle Correction" : currentAngleEvaluation && !currentAngleEvaluation.appliedAt ? "Recalculate Angle Result" : "Calculate Angle Result"}</button><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Move to Next Segment</button></div>
            {currentAngleEvaluation && !currentAngleEvaluation.appliedAt && currentProgress.status !== "Correction" && <section className="live-card-angle-result-review" aria-label="Angle result review"><header><div><p className="eyebrow">RESULT REVIEW</p><h3>{currentAngleEvaluation.calculatedScore.toFixed(1)} calculated angle rating</h3><p>Nothing changes permanently until you accept this result or explain an override.</p></div><strong>{currentAngleEvaluation.calculatedScore.toFixed(1)}</strong></header><div className="live-card-evaluation-factors">{currentAngleEvaluation.factors.map((factor) => <article key={factor.label}><span>{factor.label}</span><b>{factor.value > 0 ? "+" : ""}{factor.value.toFixed(1)}</b><small>{factor.detail}</small></article>)}</div><div className="live-card-participant-results">{currentAngleEvaluation.participants.map((participant) => <article key={participant.workerKey}><div><strong>{participant.workerName}</strong><span>{participant.role}</span></div><b>{participant.performanceScore.toFixed(1)}</b><small>Momentum {participant.momentumDelta >= 0 ? "+" : ""}{participant.momentumDelta.toFixed(1)} · Popularity {participant.popularityDelta >= 0 ? "+" : ""}{participant.popularityDelta.toFixed(1)}</small></article>)}</div><div className="live-card-actions"><button className="primary-button" type="button" onClick={() => finalizeCurrentAngle("accept")}>Accept Angle Result</button></div><div className="live-card-angle-override"><label className="field"><span>Override rating</span><input aria-label="Angle override rating" type="number" min="0" max="100" value={angleOverrideScore} onChange={(event) => setAngleOverrideScore(Number(event.target.value))} /></label><label className="field"><span>Override reason</span><textarea aria-label="Angle override reason" rows={3} value={angleOverrideReason} onChange={(event) => setAngleOverrideReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={() => finalizeCurrentAngle("override")}>Use Explained Override</button></div></section>}
            {currentProgress.status === "Completed" && currentAngleEvaluation?.appliedAt && <section className="live-card-next-step"><div><p className="eyebrow">ANGLE CONSEQUENCES APPLIED</p><h3>{currentAngleEvaluation.finalScore.toFixed(1)} · {currentAngleEvaluation.status}</h3><p>Participant momentum and popularity effects were recorded exactly once.</p></div><button className="primary-button" type="button" onClick={() => moveNext("segment")}>Continue to Next Segment</button></section>}{currentProgress.status === "Completed" && <div className="live-card-correction"><label className="field"><span>Correction reason</span><textarea aria-label="Live card correction reason" rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={openCorrection}>Open Explicit Correction</button></div>}{currentProgress.corrections.length > 0 && <details className="live-card-correction-history"><summary>Correction history</summary>{currentProgress.corrections.map((entry) => <article key={entry.id}><strong>{entry.reason}</strong><span>{entry.beforeOutput || "No prior output"}</span><b>→</b><span>{entry.afterOutput || "Correction still open"}</span><small>{formatDate(entry.openedAt)}{entry.completedAt ? ` · completed ${formatDate(entry.completedAt)}` : ""}</small></article>)}</details>}</section>}

          {currentSegment.type === "match" && currentProgress.status === "Completed" && currentApplication && <section className="live-card-next-step"><div><p className="eyebrow">NEXT STEP</p><h3>Result locked and consequences recorded once</h3><p>{guardedDecisions ? `${guardedDecisions} permanent decision${guardedDecisions === 1 ? " needs" : "s need"} your confirmation.` : "Records, rankings, momentum, condition, and history are updated."}</p></div><div className="live-card-actions"><button className="secondary-button" type="button" onClick={reviewConsequences}>{guardedDecisions ? `Review ${guardedDecisions} Guarded Decision${guardedDecisions === 1 ? "" : "s"}` : "View Applied Consequences"}</button><button className="primary-button" type="button" onClick={() => moveNext("segment")}>Continue to Next Segment</button></div></section>}
          {!['Completed', 'Skipped'].includes(currentProgress.status) && <section className="live-card-skip"><label className="field"><span>Skip reason</span><input aria-label="Live card skip reason" value={skipReason} onChange={(event) => setSkipReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={skipCurrent}>Skip This Segment Deliberately</button></section>}
        </>}</main>
      </div>
      <section className="live-card-footer"><div><strong>{canCompleteLiveCard(session) ? "Every segment is finalized." : `${remainingSegments} segment${remainingSegments === 1 ? " remains" : "s remain"}.`}</strong><span>Completing the show locks the running order as played and applies official records and consequences.</span></div><button className="primary-button" type="button" disabled={!canCompleteLiveCard(session) || session.status === "Completed"} onClick={completeShow}>{session.status === "Completed" ? "Show Completed" : "Complete Live Show"}</button></section>
      {session.status === "Completed" && <section className="live-card-complete-summary"><header><div><p className="eyebrow">POST-SHOW REPORT</p><h3>{selectedShow.name} is complete</h3><p>{completedSegments} completed · {session.progress.filter((item) => item.status === "Skipped").length} skipped · {insertedSegments} inserted live</p></div><span>{formatDate(session.completedAt)}</span></header>{showReport && <><div className="live-card-show-score"><article><span>Overall rating</span><strong>{showReport.overallScore.toFixed(1)}</strong><small>{showReport.audienceReaction} · expected {showReport.expectedShowScore.toFixed(1)}</small></article><article><span>Attendance</span><strong>{showReport.estimatedAttendance.toLocaleString()}</strong><small>{showReport.attendanceCalculation.capacityLimited ? `Capacity-limited from ${showReport.attendanceCalculation.unconstrainedDemand.toLocaleString()} demand` : "Estimated ticket demand"}</small></article><article><span>Crowd finish</span><strong>{showReport.crowdFinish.toFixed(1)}</strong><small>Started at {showReport.crowdStart.toFixed(1)}</small></article><article><span>Promotion popularity</span><strong>{showReport.promotionPopularityAfter.toFixed(1)}</strong><small>{showReport.promotionPopularityBefore.toFixed(1)} {showReport.promotionPopularityDelta >= 0 ? "+" : ""}{showReport.promotionPopularityDelta.toFixed(1)}</small></article></div><div className="live-card-crowd-path">{showReport.segments.map((segment, index) => <article key={segment.segmentId}><b>{index + 1}</b><div><strong>{segment.segmentTitle}</strong><span>{segment.segmentType === "match" ? "Match" : "Angle"} · {segment.reaction} · weight {segment.importanceWeight.toFixed(2)}×{segment.mainEvent ? " · Main event" : ""}</span></div><em>{segment.receptionScore.toFixed(1)}</em><small>Base {segment.score.toFixed(1)} · crowd {segment.crowdModifier >= 0 ? "+" : ""}{segment.crowdModifier.toFixed(1)} · level {segment.crowdBefore.toFixed(1)} → {segment.crowdAfter.toFixed(1)}</small></article>)}</div><details className="live-card-report-explanation"><summary>How this show was evaluated</summary>{showReport.explanations.map((explanation) => <p key={explanation}>{explanation}</p>)}</details></>}{session.progress.map((progress, index) => <article key={progress.segmentId}><b>{index + 1}</b><div><strong>{progress.title}</strong><span>{progress.result ? `${progress.result.finalResult.winnerName} defeated ${progress.result.finalResult.loserName}` : progress.finalAngleOutput || progress.skipReason || progress.status}</span></div><em>{progress.status}</em></article>)}</section>}
      <details className="live-card-audit"><summary>Live show audit history · {session.audit.length}</summary>{session.audit.map((entry) => <article key={entry.id}><strong>{entry.action}</strong><span>{entry.detail}</span><small>{formatDate(entry.createdAt)}</small></article>)}</details>
    </>}
  </section>;
}
