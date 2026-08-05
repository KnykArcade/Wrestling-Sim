import { useEffect, useMemo, useState } from "react";
import { activeResolutionAttempt } from "../matchResolution/engine";
import { loadMatchResolutionUniverse, saveMatchResolutionUniverse } from "../matchResolution/storage";
import type { MatchResolutionRecord, MatchResolutionUniverse } from "../matchResolution/types";
import { touchShow } from "../planner/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import {
  canCompleteLiveCard,
  completeAngleCorrection,
  completeAngleSegment,
  completeLiveCard,
  createLiveCardSession,
  insertGroundedAngle,
  lockMatchResult,
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

export default function LiveCardRunnerWorkspace({ onOpenResolution, onOpenPlanner }: LiveCardRunnerWorkspaceProps) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [resolutions, setResolutions] = useState<MatchResolutionUniverse>(() => loadMatchResolutionUniverse(window.localStorage));
  const [universe, setUniverse] = useState<LiveCardUniverse>(() => loadLiveCardUniverse(window.localStorage));
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

  const session = selectedShow ? universe.sessions.find((item) => item.showId === selectedShow.id) ?? syncedSession : null;
  const currentSegment = selectedShow?.segments.find((segment) => segment.id === session?.currentSegmentId) ?? selectedShow?.segments[0] ?? null;
  const currentProgress = session?.progress.find((progress) => progress.segmentId === currentSegment?.id) ?? null;
  const currentResolution = selectedShow && currentSegment?.type === "match" ? resolutionForSegment(selectedShow.id, currentSegment.id, resolutions) : null;
  const currentAttempt = activeResolutionAttempt(currentResolution);
  const resultReady = finalized(currentResolution);
  const remainingSegments = session?.progress.filter((progress) => !["Completed", "Skipped"].includes(progress.status)).length ?? 0;
  const completedSegments = session?.progress.filter((progress) => progress.status === "Completed").length ?? 0;
  const insertedSegments = session?.progress.filter((progress) => progress.insertedDuringShow).length ?? 0;

  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveLiveCardUniverse(window.localStorage, universe), [universe]);

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
  }, [currentSegment?.id, currentProgress?.status, currentAttempt?.id]);

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
    if (!session || !currentResolution) return;
    try {
      updateSession((value) => lockMatchResult(value, currentResolution));
      setNotice("The official result is locked into the live card. Create a grounded follow-up angle or continue through the running order.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The match result could not be locked.");
    }
  }

  function updateAngleField(patch: Partial<PlannedSegment>): void {
    if (!selectedShow || !currentSegment || currentSegment.type !== "angle") return;
    setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, segments: show.segments.map((segment) => segment.id === currentSegment.id ? { ...segment, ...patch } : segment) }) : show));
  }

  function completeAngle(): void {
    if (!session || !currentSegment || currentSegment.type !== "angle") return;
    try {
      const next = currentProgress?.status === "Correction"
        ? completeAngleCorrection(session, currentSegment.id, currentSegment.segmentOutput)
        : completeAngleSegment(session, currentSegment.id, currentSegment.segmentOutput, currentSegment.consequences, currentSegment.followUp);
      setUniverse((current) => upsertLiveCardSession(current, next));
      setNotice("The angle is finalized for this live show. Earlier output remains in the correction audit when applicable.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The angle could not be completed.");
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

  function completeShow(): void {
    if (!session || !selectedShow) return;
    try {
      const next = completeLiveCard(session);
      setUniverse((current) => upsertLiveCardSession(current, next));
      setShows((current) => current.map((show) => show.id === selectedShow.id ? touchShow({ ...show, status: "Completed" }) : show));
      setNotice("The live card is complete. Official result consequences have been applied.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The show could not be completed.");
    }
  }

  return <section className="live-card-workspace">
    <header className="live-card-hero"><div><p className="eyebrow">PHASE 6B2 · REACTIVE LIVE CARD RUNNER</p><h2>Run the show one segment at a time and let completed results reshape everything that follows</h2><p>The planned card is a starting order, not a finished script. A match must receive one official result before it can be locked. You can then insert a grounded angle, change later creative work, or move directly to the next match.</p></div><div className="live-card-principle"><span>Live booking loop</span><strong>Result → Reaction → Next Decision</strong><small>Completed results are locked. Corrections create audit history instead of invisible recalculation.</small></div></header>
    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="live-card-toolbar"><label className="field"><span>Show to run</span><select aria-label="Live card planned show" value={selectedShow?.id ?? ""} onChange={(event) => selectShow(event.target.value)}><option value="">No planned show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.date || "Unscheduled"}</option>)}</select></label><button className="primary-button" type="button" disabled={!session || session.status !== "Planned"} onClick={startShow}>Start Live Show</button><button className="secondary-button" type="button" disabled={!currentSegment} onClick={() => currentSegment && onOpenPlanner(selectedShow?.id ?? "", currentSegment.id)}>Open Full Segment Editor</button><button className="secondary-button" type="button" onClick={refreshResult}>Refresh Official Results</button></section>

    {!selectedShow || !session ? <div className="empty-state live-card-empty"><h3>No planned show is available</h3><p>Create the card first. Participants and context may be booked, but match winners can remain unresolved.</p></div> : <>
      <section className="live-card-summary"><article><span>Show status</span><strong>{session.status}</strong></article><article><span>Completed</span><strong>{completedSegments}/{session.progress.length}</strong></article><article><span>Remaining</span><strong>{remainingSegments}</strong></article><article><span>Inserted live</span><strong>{insertedSegments}</strong></article><article><span>Current segment</span><strong>{currentSegment ? session.segmentOrder.indexOf(currentSegment.id) + 1 : 0}</strong></article></section>

      <div className="live-card-layout"><aside className="live-card-running-order"><header><div><p className="eyebrow">RUNNING ORDER</p><h3>{selectedShow.name}</h3><span>{selectedShow.date || "Unscheduled"}</span></div><b>{session.progress.length}</b></header><div>{session.segmentOrder.map((segmentId, index) => { const progress = session.progress.find((item) => item.segmentId === segmentId); const segment = selectedShow.segments.find((item) => item.id === segmentId); if (!progress || !segment) return null; return <button type="button" key={segmentId} className={`${currentSegment?.id === segmentId ? "active" : ""} live-card-status--${statusClass(progress.status)}`} onClick={() => selectSegment(segmentId)}><strong>{index + 1}</strong><span><b>{segment.title}</b><small>{segment.type === "match" ? "Match" : "Angle"} · {segment.durationMinutes} min</small><em>{progress.status}{progress.insertedDuringShow ? " · Inserted live" : ""}</em></span></button>; })}</div><footer><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Next Unfinished Segment</button><button className="secondary-button" type="button" onClick={() => moveNext("match")}>Next Match</button></footer></aside>

        <main className="live-card-current">{!currentSegment || !currentProgress ? <div className="empty-state"><h3>No current segment</h3></div> : <>
          <section className="live-card-current-header"><div><p className="eyebrow">SEGMENT {session.segmentOrder.indexOf(currentSegment.id) + 1}</p><h2>{currentSegment.title}</h2><p>{currentSegment.type === "match" ? currentSegment.workers.map((worker) => worker.name).join(" vs. ") : currentSegment.angleLocation} · {currentSegment.durationMinutes} minutes</p></div><span className={`live-card-status-badge live-card-status--${statusClass(currentProgress.status)}`}>{currentProgress.status}</span></section>

          {currentSegment.type === "match" ? <section className="live-card-match-panel"><header><div><p className="eyebrow">OFFICIAL MATCH RESULT</p><h3>{resultReady ? `${currentAttempt?.finalResult?.winnerName} defeated ${currentAttempt?.finalResult?.loserName}` : currentResolution ? "Engine result awaiting acceptance or override" : "No official result yet"}</h3></div><span>{currentResolution?.status ?? "Unresolved"}</span></header>{currentAttempt ? <div className="live-card-result-facts">{resultFacts(currentResolution).map((fact) => <p key={fact}>{fact}</p>)}</div> : <p>Open Run Matches. The wrestlers choose approaches and the engine produces one official result for the current setup.</p>}<div className="live-card-actions"><button className="primary-button" type="button" onClick={openResolution}>{currentResolution ? "Open Official Match Result" : "Run This Match"}</button><button className="secondary-button" type="button" disabled={!resultReady || currentProgress.status === "Completed"} onClick={lockCurrentMatch}>Lock Result Into Live Card</button></div>
            {currentProgress.status === "Completed" && currentProgress.result && <section className="live-card-post-result"><header><div><p className="eyebrow">REACTIVE BOOKING</p><h3>What happens because of this result?</h3></div><span>{currentProgress.result.status}</span></header><div className="live-card-grounded-facts">{currentProgress.groundedFacts.length ? currentProgress.groundedFacts.map((fact) => <p key={fact}>{fact}</p>) : resultFacts(currentResolution).map((fact) => <p key={fact}>{fact}</p>)}</div><div className="live-card-angle-form"><label className="field"><span>New segment type</span><select aria-label="Live card inserted segment mode" value={angleMode} onChange={(event) => setAngleMode(event.target.value as GroundedAngleInput["mode"])}><option>Follow-Up Angle</option><option>Post-Match Segment</option></select></label><label className="field"><span>Segment name</span><input aria-label="Live card inserted angle title" value={angleTitle} onChange={(event) => setAngleTitle(event.target.value)} /></label><label className="field"><span>Purpose</span><textarea aria-label="Live card inserted angle purpose" rows={3} value={anglePurpose} onChange={(event) => setAnglePurpose(event.target.value)} /></label><label className="field"><span>Location</span><input aria-label="Live card inserted angle location" value={angleLocation} onChange={(event) => setAngleLocation(event.target.value)} /></label><label className="field"><span>Content type</span><input aria-label="Live card inserted angle content type" value={angleContentType} onChange={(event) => setAngleContentType(event.target.value)} /></label></div><div className="live-card-actions"><button className="primary-button" type="button" onClick={insertAngle}>Insert After This Match</button><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Move to Next Segment</button><button className="secondary-button" type="button" onClick={() => moveNext("match")}>Move to Next Match</button></div></section>}
          </section> : <section className="live-card-angle-panel"><header><div><p className="eyebrow">ANGLE OUTPUT</p><h3>{currentProgress.insertedDuringShow ? "Write the reaction to the actual result" : "Complete the planned angle in the context of the live show"}</h3></div><span>{currentProgress.corrections.length ? `${currentProgress.corrections.length} correction${currentProgress.corrections.length === 1 ? "" : "s"}` : "Original record"}</span></header>{currentProgress.groundedFacts.length > 0 && <div className="live-card-grounded-facts"><strong>Fixed result facts</strong>{currentProgress.groundedFacts.map((fact) => <p key={fact}>{fact}</p>)}<small>No dialogue, attack, challenge, turn, or new action was generated.</small></div>}<label className="field"><span>Final Angle Output</span><textarea aria-label="Live card final angle output" rows={12} value={currentSegment.segmentOutput} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ segmentOutput: event.target.value })} /></label><div className="live-card-angle-form"><label className="field"><span>Actual consequences</span><textarea aria-label="Live card angle consequences" rows={4} value={currentSegment.consequences} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ consequences: event.target.value })} /></label><label className="field"><span>Final follow-up</span><textarea aria-label="Live card angle follow up" rows={4} value={currentSegment.followUp} disabled={currentProgress.status === "Completed"} onChange={(event) => updateAngleField({ followUp: event.target.value })} /></label></div><div className="live-card-actions"><button className="primary-button" type="button" disabled={currentProgress.status === "Completed"} onClick={completeAngle}>{currentProgress.status === "Correction" ? "Complete Angle Correction" : "Complete Angle"}</button><button className="secondary-button" type="button" onClick={() => moveNext("segment")}>Move to Next Segment</button></div>{currentProgress.status === "Completed" && <div className="live-card-correction"><label className="field"><span>Correction reason</span><textarea aria-label="Live card correction reason" rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={openCorrection}>Open Explicit Correction</button></div>}{currentProgress.corrections.length > 0 && <details className="live-card-correction-history"><summary>Correction history</summary>{currentProgress.corrections.map((entry) => <article key={entry.id}><strong>{entry.reason}</strong><span>{entry.beforeOutput || "No prior output"}</span><b>→</b><span>{entry.afterOutput || "Correction still open"}</span><small>{formatDate(entry.openedAt)}{entry.completedAt ? ` · completed ${formatDate(entry.completedAt)}` : ""}</small></article>)}</details>}</section>}

          {!['Completed', 'Skipped'].includes(currentProgress.status) && <section className="live-card-skip"><label className="field"><span>Skip reason</span><input aria-label="Live card skip reason" value={skipReason} onChange={(event) => setSkipReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={skipCurrent}>Skip This Segment Deliberately</button></section>}
        </>}</main>
      </div>
      <section className="live-card-footer"><div><strong>{canCompleteLiveCard(session) ? "Every segment is finalized." : `${remainingSegments} segment${remainingSegments === 1 ? " remains" : "s remain"}.`}</strong><span>Completing the show locks the running order as played and applies official records and consequences.</span></div><button className="primary-button" type="button" disabled={!canCompleteLiveCard(session) || session.status === "Completed"} onClick={completeShow}>{session.status === "Completed" ? "Show Completed" : "Complete Live Show"}</button></section>
      <details className="live-card-audit"><summary>Live show audit history · {session.audit.length}</summary>{session.audit.map((entry) => <article key={entry.id}><strong>{entry.action}</strong><span>{entry.detail}</span><small>{formatDate(entry.createdAt)}</small></article>)}</details>
    </>}
  </section>;
}
