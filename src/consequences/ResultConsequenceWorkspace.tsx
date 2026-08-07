import { useEffect, useMemo, useState } from "react";
import { loadChampionshipUniverse, saveChampionshipUniverse } from "../championships/storage";
import type { TitleResultDecision } from "../championships/types";
import { loadCompetitionUniverse, saveCompetitionUniverse } from "../competitions/storage";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import { activeResolutionAttempt } from "../matchResolution/engine";
import { loadMatchResolutionUniverse } from "../matchResolution/storage";
import type { MatchResolutionRecord } from "../matchResolution/types";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import {
  applyCoreResultConsequences,
  confirmChampionshipConsequence,
  confirmCompetitionConsequence,
  dismissGroundedPrompt,
  resolveFutureConflict,
  rollbackCoreResultConsequences,
  updateChampionshipProposal,
  updateCompetitionProposal,
  useGroundedPrompt,
} from "./model";
import { loadResultConsequenceUniverse, saveResultConsequenceUniverse } from "./storage";
import type {
  ChampionshipConsequenceProposal,
  CompetitionConsequenceProposal,
  ResultConsequenceUniverse,
} from "./types";

interface ResultConsequenceWorkspaceProps {
  onOpenLiveCard: () => void;
  onOpenPlanner: (showId: string, segmentId: string) => void;
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function eligibleResolution(record: MatchResolutionRecord): boolean {
  const attempt = activeResolutionAttempt(record);
  return Boolean(attempt?.finalResult && (attempt.status === "Accepted" || attempt.status === "Overridden"));
}

function resultHeadline(result: NonNullable<ReturnType<typeof activeResolutionAttempt>>["finalResult"]): string {
  if (!result) return "No official result";
  return result.finishType === "No Contest" ? "Match ended in a No Contest" : `${result.winnerName} defeated ${result.loserName}`;
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export default function ResultConsequenceWorkspace({ onOpenLiveCard, onOpenPlanner }: ResultConsequenceWorkspaceProps) {
  const [universe, setUniverse] = useState<ResultConsequenceUniverse>(() => loadResultConsequenceUniverse(window.localStorage));
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [championships, setChampionships] = useState(() => loadChampionshipUniverse(window.localStorage));
  const [competitions, setCompetitions] = useState(() => loadCompetitionUniverse(window.localStorage));
  const resolutions = useMemo(() => loadMatchResolutionUniverse(window.localStorage), [universe.applications.length]);
  const [profiles, setProfiles] = useState(() => loadMatchEngineUniverse(window.localStorage).profiles);
  const [notice, setNotice] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [conflictNotes, setConflictNotes] = useState<Record<string, string>>({});
  const [promptTargets, setPromptTargets] = useState<Record<string, { showId: string; segmentId: string }>>({});

  const pending = resolutions.records.filter(eligibleResolution).filter((record) => {
    const attempt = activeResolutionAttempt(record)!;
    return !universe.applications.some((application) => application.resolutionAttemptId === attempt.id && application.status === "Applied");
  });
  const selectedApplication = universe.applications.find((application) => application.id === universe.settings.selectedApplicationId) ?? universe.applications[0] ?? null;
  const selectedWorker = universe.workerRecords.find((record) => record.workerKey === universe.settings.selectedWorkerKey) ?? universe.workerRecords.sort((left, right) => left.rankingPosition - right.rankingPosition)[0] ?? null;
  const unresolvedTitles = universe.championshipProposals.filter((proposal) => proposal.status !== "Confirmed");
  const unresolvedCompetitions = universe.competitionProposals.filter((proposal) => proposal.status !== "Confirmed");
  const openConflicts = universe.futureConflicts.filter((conflict) => !conflict.resolved);
  const activePrompts = universe.prompts.filter((prompt) => !prompt.dismissed && !prompt.usedSegmentId);

  useEffect(() => saveResultConsequenceUniverse(window.localStorage, universe), [universe]);
  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveChampionshipUniverse(window.localStorage, championships), [championships]);
  useEffect(() => saveCompetitionUniverse(window.localStorage, competitions), [competitions]);

  function setTab(activeTab: ResultConsequenceUniverse["settings"]["activeTab"]): void {
    setUniverse((current) => ({ ...current, settings: { ...current.settings, activeTab } }));
  }

  function apply(record: MatchResolutionRecord): void {
    try {
      const result = applyCoreResultConsequences({ universe, resolution: record, shows, profiles, championships, competitions });
      setUniverse(result.universe);
      setShows(result.shows);
      setProfiles(result.profiles);
      saveMatchEngineUniverse(window.localStorage, { profiles: result.profiles });
      setNotice("The official result updated standalone records, rankings, momentum, condition, wrestler history, grounded prompts, and future-plan review. Title and competition decisions remain guarded.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The result consequences could not be applied.");
    }
  }

  function rollback(): void {
    if (!selectedApplication) return;
    try {
      const result = rollbackCoreResultConsequences(universe, selectedApplication.id, rollbackReason, profiles);
      setUniverse(result.universe);
      setShows(result.shows);
      setChampionships(result.championships);
      setCompetitions(result.competitions);
      setProfiles(result.profiles);
      saveMatchEngineUniverse(window.localStorage, { profiles: result.profiles });
      setRollbackReason("");
      setNotice("The core consequence snapshot was restored. The original official match calculation remains in Match Resolution history.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The consequence application could not be rolled back.");
    }
  }

  function updateTitleDecision(proposal: ChampionshipConsequenceProposal, decision: TitleResultDecision | "Deferred"): void {
    setUniverse((current) => updateChampionshipProposal(current, proposal.id, decision));
  }

  function confirmTitle(proposal: ChampionshipConsequenceProposal): void {
    try {
      const result = confirmChampionshipConsequence({ universe, proposalId: proposal.id, shows, championships, knownWorkers: profiles.map((profile) => ({ id: profile.workerId, name: profile.workerName })) });
      setUniverse(result.universe);
      setShows(result.shows);
      setChampionships(result.championships);
      setNotice(`${proposal.championshipName} consequence confirmed. The previewed reign or defense change is now official.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The title consequence could not be confirmed.");
    }
  }

  function updateCompetitionDecision(proposal: CompetitionConsequenceProposal, decision: "Decision" | "Draw" | "No Contest" | "Cancelled" | "Deferred"): void {
    setUniverse((current) => updateCompetitionProposal(current, proposal.id, decision));
  }

  function confirmCompetition(proposal: CompetitionConsequenceProposal): void {
    try {
      const result = confirmCompetitionConsequence({ universe, proposalId: proposal.id, competitions });
      setUniverse(result.universe);
      setCompetitions(result.competitions);
      setNotice(`${proposal.competitionName} consequence confirmed. Bracket or standings changes are now official.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The competition consequence could not be confirmed.");
    }
  }

  function resolveConflict(conflictId: string): void {
    try {
      setUniverse((current) => resolveFutureConflict(current, conflictId, conflictNotes[conflictId] ?? ""));
      setConflictNotes((current) => ({ ...current, [conflictId]: "" }));
      setNotice("The future booking review was resolved without automatically changing the future card.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The future booking review could not be resolved.");
    }
  }

  function markPromptUsed(promptId: string): void {
    const target = promptTargets[promptId];
    if (!target?.showId || !target.segmentId) {
      setNotice("Choose the future show and segment where the grounded prompt was used.");
      return;
    }
    setUniverse((current) => useGroundedPrompt(current, promptId, target.showId, target.segmentId));
    setNotice("The grounded prompt was linked to an existing future segment. No creative action was generated automatically.");
  }

  return <section className="consequence-workspace">
    <header className="consequence-hero"><div><p className="eyebrow">RESULT CONSEQUENCES</p><h2>Make the official result matter without letting the game invent what you book next</h2><p>Accepted or Overridden results apply once. Records update immediately while championships, competitions, and future booking changes remain explicit decisions.</p></div><div className="consequence-principle"><span>Authority chain</span><strong>Result → Consequence → Creative Response</strong><small>Automatic records are idempotent. Permanent title and competition changes require confirmation.</small></div></header>
    <div className="consequence-return"><button className="primary-button" type="button" onClick={onOpenLiveCard}>Return to Running Show</button></div>
    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <nav className="consequence-tabs"><button className={universe.settings.activeTab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={universe.settings.activeTab === "records" ? "active" : ""} onClick={() => setTab("records")}>Records &amp; Rankings</button><button className={universe.settings.activeTab === "decisions" ? "active" : ""} onClick={() => setTab("decisions")}>Guarded Decisions</button><button className={universe.settings.activeTab === "future" ? "active" : ""} onClick={() => setTab("future")}>Reactive Booking</button><button className={universe.settings.activeTab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Audit &amp; Rollback</button></nav>

    <section className="consequence-metrics"><article><span>Results ready</span><strong>{pending.length}</strong></article><article><span>Applied</span><strong>{universe.applications.filter((application) => application.status === "Applied").length}</strong></article><article><span>Worker records</span><strong>{universe.workerRecords.length}</strong></article><article><span>Team records</span><strong>{universe.teamRecords.length}</strong></article><article><span>Title decisions</span><strong>{unresolvedTitles.length}</strong></article><article><span>Competition decisions</span><strong>{unresolvedCompetitions.length}</strong></article><article><span>Future reviews</span><strong>{openConflicts.length}</strong></article></section>

    {universe.settings.activeTab === "overview" && <div className="consequence-overview">
      <section className="consequence-pending"><header><div><p className="eyebrow">UNAPPLIED OFFICIAL RESULTS</p><h3>Apply each result exactly once</h3></div><span>{pending.length}</span></header>{pending.length === 0 ? <div className="empty-state compact">No Accepted or Overridden result is waiting for consequences.</div> : pending.map((record) => { const attempt = activeResolutionAttempt(record)!; return <article key={record.id}><div><strong>{record.segmentTitle}</strong><span>{record.showName}</span><small>{resultHeadline(attempt.finalResult)} · {attempt.finalResult?.matchScore.toFixed(1)} rating</small></div><button className="primary-button" type="button" onClick={() => apply(record)}>Apply Official Consequences</button></article>; })}</section>
      <section className="consequence-applications"><header><div><p className="eyebrow">APPLICATION HISTORY</p><h3>Official standalone result records</h3></div><span>{universe.applications.length}</span></header>{universe.applications.length === 0 ? <div className="empty-state compact">No standalone result has been applied yet.</div> : universe.applications.map((application) => <button key={application.id} type="button" className={`${selectedApplication?.id === application.id ? "active" : ""} consequence-status--${statusClass(application.status)}`} onClick={() => setUniverse((current) => ({ ...current, settings: { ...current.settings, selectedApplicationId: application.id } }))}><strong>{resultHeadline(application.finalResult)}</strong><span>{application.showName} · {application.segmentTitle}</span><small>{application.status} · {formatDate(application.appliedAt)}</small></button>)}</section>
      {selectedApplication && <section className="consequence-detail"><header><div><p className="eyebrow">SELECTED RESULT</p><h3>{resultHeadline(selectedApplication.finalResult)}</h3><p>{selectedApplication.finalResult.finishDescription}</p></div><span>{selectedApplication.status}</span></header><div className="consequence-change-grid">{selectedApplication.conditionChanges.map((change) => <article key={change.workerKey}><header><strong>{change.workerName}</strong><span>{change.injuryStatus}</span></header><dl><div><dt>Health</dt><dd>{change.healthBefore.toFixed(1)} → {change.healthAfter.toFixed(1)}</dd></div><div><dt>Fatigue</dt><dd>{change.fatigueBefore.toFixed(1)} → {change.fatigueAfter.toFixed(1)}</dd></div><div><dt>Momentum</dt><dd>{change.momentumBefore.toFixed(1)} → {change.momentumAfter.toFixed(1)}</dd></div><div><dt>Ranking points</dt><dd>{change.rankingPointsBefore.toFixed(1)} → {change.rankingPointsAfter.toFixed(1)}</dd></div></dl>{change.explanation.map((item) => <p key={item}>{item}</p>)}</article>)}</div><button className="secondary-button" type="button" onClick={() => onOpenPlanner(selectedApplication.showId, selectedApplication.segmentId)}>Open Permanent Match Record</button></section>}
    </div>}

    {universe.settings.activeTab === "records" && <div className="consequence-records"><aside><h3>Standalone rankings</h3>{[...universe.workerRecords].sort((left, right) => left.rankingPosition - right.rankingPosition).map((record) => <button type="button" key={record.workerKey} className={selectedWorker?.workerKey === record.workerKey ? "active" : ""} onClick={() => setUniverse((current) => ({ ...current, settings: { ...current.settings, selectedWorkerKey: record.workerKey } }))}><b>#{record.rankingPosition || "—"}</b><span><strong>{record.workerName}</strong><small>{record.wins}-{record.losses}-{record.draws} · {record.rankingPoints.toFixed(1)} pts</small></span></button>)}</aside>{selectedWorker ? <main><header><div><p className="eyebrow">WORKER RECORD</p><h3>{selectedWorker.workerName}</h3></div><span>Rank #{selectedWorker.rankingPosition || "—"}</span></header><section className="record-scorecard"><article><span>Record</span><strong>{selectedWorker.wins}-{selectedWorker.losses}-{selectedWorker.draws}</strong></article><article><span>Streak</span><strong>{selectedWorker.currentStreakCount ? `${selectedWorker.currentStreakCount}${selectedWorker.currentStreakType}` : "—"}</strong></article><article><span>Momentum</span><strong>{selectedWorker.momentum.toFixed(1)}</strong></article><article><span>Health</span><strong>{selectedWorker.health.toFixed(1)}</strong></article><article><span>Fatigue</span><strong>{selectedWorker.fatigue.toFixed(1)}</strong></article><article><span>Condition</span><strong>{selectedWorker.injuryStatus}</strong></article></section><section className="record-history"><h4>Match history</h4>{selectedWorker.matchHistory.length === 0 ? <p>No applied matches.</p> : selectedWorker.matchHistory.map((entry) => <article key={entry.id}><b>{entry.result}</b><div><strong>{entry.segmentTitle}</strong><span>vs. {entry.opponentNames.join(" & ")} · {entry.showName}</span><small>{entry.finishDescription}</small></div><em>{entry.matchScore.toFixed(1)} · {entry.starRating}★</em></article>)}</section></main> : <main className="empty-state">Apply a result to create standalone records and rankings.</main>}</div>}
    {universe.settings.activeTab === "records" && universe.teamRecords.length > 0 && <section className="consequence-applications"><header><div><p className="eyebrow">TEAM RECORDS</p><h3>Tag and trios rankings</h3></div><span>{universe.teamRecords.length}</span></header>{[...universe.teamRecords].sort((left, right) => left.rankingPosition - right.rankingPosition).map((record) => <article key={record.teamKey}><strong>#{record.rankingPosition || "—"} · {record.teamName}</strong><span>{record.memberNames.join(" & ")}</span><small>{record.wins}-{record.losses}-{record.draws} · {record.rankingPoints.toFixed(1)} pts · momentum {record.momentum.toFixed(1)}</small></article>)}</section>}

    {universe.settings.activeTab === "decisions" && <div className="consequence-decisions"><section><header><div><p className="eyebrow">CHAMPIONSHIP QUEUE</p><h3>Explicit title decisions</h3></div><span>{universe.championshipProposals.length}</span></header>{universe.championshipProposals.length === 0 ? <div className="empty-state compact">No applied result is linked to a championship.</div> : universe.championshipProposals.map((proposal) => <article key={proposal.id} className={`decision-status--${statusClass(proposal.status)}`}><header><div><strong>{proposal.championshipName}</strong><span>{proposal.finalWinner} won the match</span></div><b>{proposal.status}</b></header><p>{proposal.reason}</p>{proposal.preview.map((item) => <small key={item}>{item}</small>)}<label className="field"><span>Title decision</span><select aria-label={`${proposal.championshipName} consequence decision`} value={proposal.status === "Deferred" ? "Deferred" : proposal.selectedDecision} disabled={proposal.status === "Confirmed"} onChange={(event) => updateTitleDecision(proposal, event.target.value as TitleResultDecision | "Deferred")}><option value="Unresolved">Unresolved</option><option value="Retained">Retained</option><option value="Changed Hands">Changed Hands</option><option value="Vacated">Vacated</option><option value="Deferred">Defer</option></select></label><button className="primary-button" type="button" disabled={proposal.status === "Confirmed" || proposal.status === "Deferred" || proposal.selectedDecision === "Unresolved"} onClick={() => confirmTitle(proposal)}>Confirm Championship Consequence</button></article>)}</section><section><header><div><p className="eyebrow">COMPETITION QUEUE</p><h3>Explicit bracket and standings decisions</h3></div><span>{universe.competitionProposals.length}</span></header>{universe.competitionProposals.length === 0 ? <div className="empty-state compact">No applied result is linked to a competition fixture.</div> : universe.competitionProposals.map((proposal) => <article key={proposal.id} className={`decision-status--${statusClass(proposal.status)}`}><header><div><strong>{proposal.competitionName} · {proposal.roundLabel}</strong><span>{proposal.finalWinner} → {proposal.proposedWinnerParticipantName || "Unresolved participant"}</span></div><b>{proposal.status}</b></header><p>{proposal.reason}</p>{proposal.preview.map((item) => <small key={item}>{item}</small>)}<label className="field"><span>Competition result</span><select aria-label={`${proposal.competitionName} consequence decision`} value={proposal.status === "Deferred" ? "Deferred" : proposal.resultType} disabled={proposal.status === "Confirmed"} onChange={(event) => updateCompetitionDecision(proposal, event.target.value as "Decision" | "Draw" | "No Contest" | "Cancelled" | "Deferred")}><option>Decision</option><option>Draw</option><option>No Contest</option><option>Cancelled</option><option value="Deferred">Defer</option></select></label><button className="primary-button" type="button" disabled={proposal.status === "Confirmed" || proposal.status === "Deferred" || proposal.status === "Blocked"} onClick={() => confirmCompetition(proposal)}>Confirm Competition Consequence</button></article>)}</section></div>}

    {universe.settings.activeTab === "future" && <div className="consequence-future"><section><header><div><p className="eyebrow">FUTURE BOOKING REVIEW</p><h3>Plans affected by actual results</h3></div><span>{openConflicts.length}</span></header>{universe.futureConflicts.length === 0 ? <div className="empty-state compact">No future booking conflict has been detected.</div> : universe.futureConflicts.map((conflict) => <article key={conflict.id} className={conflict.resolved ? "resolved" : ""}><header><div><strong>{conflict.futureShowName} · {conflict.futureSegmentTitle}</strong><span>{conflict.futureShowDate}</span></div><b>{conflict.resolved ? "Resolved" : conflict.severity}</b></header><p>{conflict.reason}</p>{conflict.resolved ? <small>{conflict.resolutionNote}</small> : <><label className="field"><span>Booker decision</span><textarea aria-label={`${conflict.futureSegmentTitle} conflict resolution`} rows={3} value={conflictNotes[conflict.id] ?? ""} onChange={(event) => setConflictNotes((current) => ({ ...current, [conflict.id]: event.target.value }))} /></label><div><button className="secondary-button" type="button" onClick={() => onOpenPlanner(conflict.futureShowId, conflict.futureSegmentId)}>Review Future Segment</button><button className="primary-button" type="button" onClick={() => resolveConflict(conflict.id)}>Record Resolution</button></div></>}</article>)}</section><section><header><div><p className="eyebrow">GROUNDED CREATIVE OPTIONS</p><h3>Possible reactions, never automatic booking</h3></div><span>{activePrompts.length}</span></header>{universe.prompts.length === 0 ? <div className="empty-state compact">Apply a result to create grounded reaction options.</div> : universe.prompts.map((prompt) => <article key={prompt.id} className={prompt.dismissed || prompt.usedSegmentId ? "resolved" : ""}><header><div><strong>{prompt.kind}</strong><span>{prompt.title}</span></div><b>{prompt.usedSegmentId ? "Used" : prompt.dismissed ? "Dismissed" : "Available"}</b></header><p>{prompt.suggestedPurpose}</p>{prompt.factualBasis.map((fact) => <small key={fact}>{fact}</small>)}{!prompt.dismissed && !prompt.usedSegmentId && <><div className="prompt-target"><label className="field"><span>Future show</span><select aria-label={`${prompt.title} target show`} value={promptTargets[prompt.id]?.showId ?? ""} onChange={(event) => setPromptTargets((current) => ({ ...current, [prompt.id]: { showId: event.target.value, segmentId: "" } }))}><option value="">Choose show…</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label><label className="field"><span>Existing segment</span><select aria-label={`${prompt.title} target segment`} value={promptTargets[prompt.id]?.segmentId ?? ""} onChange={(event) => setPromptTargets((current) => ({ ...current, [prompt.id]: { showId: current[prompt.id]?.showId ?? "", segmentId: event.target.value } }))}><option value="">Choose segment…</option>{shows.find((show) => show.id === promptTargets[prompt.id]?.showId)?.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label></div><div><button className="secondary-button" type="button" onClick={onOpenLiveCard}>Open Live Card Runner</button><button className="primary-button" type="button" onClick={() => markPromptUsed(prompt.id)}>Mark Linked to Segment</button><button className="secondary-button" type="button" onClick={() => setUniverse((current) => dismissGroundedPrompt(current, prompt.id))}>Dismiss</button></div></>}</article>)}</section></div>}

    {universe.settings.activeTab === "audit" && <div className="consequence-audit"><section><header><div><p className="eyebrow">ROLLBACK</p><h3>Restore the pre-application snapshot</h3></div><span>{selectedApplication?.status ?? "None"}</span></header>{selectedApplication ? <><p>Rollback restores worker records, the planned-show reconciliation, championship state, and competition state captured immediately before this application. Confirmed title or competition decisions must be corrected explicitly first.</p><label className="field"><span>Rollback reason</span><textarea aria-label="Consequence rollback reason" rows={3} value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} /></label><button className="secondary-button" type="button" disabled={selectedApplication.status !== "Applied"} onClick={rollback}>Rollback Core Consequences</button></> : <p>Select an applied result from Overview.</p>}</section><section><header><div><p className="eyebrow">PERMANENT AUDIT</p><h3>Consequence decisions and corrections</h3></div><span>{universe.audit.length}</span></header>{universe.audit.map((entry) => <article key={entry.id}><strong>{entry.action}</strong><span>{entry.detail}</span><small>{formatDate(entry.createdAt)}</small></article>)}</section></div>}
  </section>;
}
