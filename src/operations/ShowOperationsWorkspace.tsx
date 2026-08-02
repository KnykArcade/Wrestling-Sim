import { useEffect, useMemo, useState } from "react";
import { loadHandoffUniverse } from "../handoff/storage";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import { loadTransferUniverse } from "../transfer/storage";
import type { TransferPackage, TransferRecord } from "../transfer/types";
import {
  applyConfirmedResultLinks,
  buildResultIntakeSession,
  buildShowOperationsSummary,
  buildShowPreflight,
  createOperationsChangeNote,
  createShowOperationsRecord,
} from "./model";
import { loadShowOperationsUniverse, saveShowOperationsUniverse } from "./storage";
import type {
  PreflightActionTarget,
  ResultMatchSuggestion,
  ShowOperationsRecord,
  ShowOperationsUniverse,
  ShowPreflightIssue,
} from "./types";

type OperationsTab = ShowOperationsRecord["lastViewedTab"];

const stageOrder = [
  "Draft",
  "Creative Ready",
  "Handoff Ready",
  "Entering in TEW",
  "Entered",
  "Awaiting Results",
  "Reconciliation Needed",
  "Reconciled",
] as const;

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function dateLabel(value: string): string {
  if (!value) return "Date not set";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function activeTransfer(record: TransferRecord | null): TransferPackage | null {
  if (!record) return null;
  return record.packageHistory.find((pkg) => pkg.id === record.activePackageId) ?? record.packageHistory.at(-1) ?? null;
}

function localStorageBytes(): number {
  try {
    return Object.keys(window.localStorage).reduce((sum, key) => sum + key.length + (window.localStorage.getItem(key)?.length ?? 0), 0) * 2;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function issueAction(issue: ShowPreflightIssue, onAction: (target: PreflightActionTarget, segmentId: string) => void) {
  return <button className="secondary-button" type="button" onClick={() => onAction(issue.actionTarget, issue.segmentId)}>{issue.actionLabel}</button>;
}

export default function ShowOperationsWorkspace({
  snapshot,
  onOpenShow,
  onOpenHandoff,
  onOpenTransfer,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
  onOpenHandoff: (showId: string) => void;
  onOpenTransfer: (showId: string) => void;
}) {
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [handoff] = useState(() => loadHandoffUniverse(window.localStorage));
  const [transfer] = useState(() => loadTransferUniverse(window.localStorage));
  const [operations, setOperations] = useState<ShowOperationsUniverse>(() => loadShowOperationsUniverse(window.localStorage));
  const [selectedShowId, setSelectedShowId] = useState(() => shows[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [changeForm, setChangeForm] = useState({ segmentId: "", field: "", originalValue: "", enteredValue: "", reason: "", updateCreativePlan: false, requiresNewVersion: false });

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const record = selectedShow
    ? operations.records.find((item) => item.showId === selectedShow.id) ?? createShowOperationsRecord(selectedShow.id)
    : null;
  const preflight = useMemo(() => selectedShow ? buildShowPreflight(selectedShow, handoff, transfer, record?.acknowledgedIssueIds ?? []) : null, [handoff, record?.acknowledgedIssueIds, selectedShow, transfer]);
  const summary = useMemo(() => selectedShow && preflight ? buildShowOperationsSummary(selectedShow, handoff, transfer, preflight, snapshot) : null, [handoff, preflight, selectedShow, snapshot, transfer]);
  const transferRecord = selectedShow ? transfer.records.find((item) => item.showId === selectedShow.id) ?? null : null;
  const transferPackage = activeTransfer(transferRecord);
  const latestSession = record?.resultSessions[0] ?? null;
  const handoffRecord = selectedShow ? handoff.records.find((item) => item.showId === selectedShow.id) ?? null : null;
  const handoffVersion = handoffRecord?.versions.find((version) => version.id === handoffRecord.activeVersionId) ?? handoffRecord?.versions.at(-1) ?? null;
  const storageBytes = localStorageBytes();

  useEffect(() => {
    saveShowOperationsUniverse(window.localStorage, operations);
    setSavedAt(new Date().toISOString());
  }, [operations]);

  useEffect(() => {
    savePlannedShows(window.localStorage, shows);
  }, [shows]);

  function updateRecord(updater: (current: ShowOperationsRecord) => ShowOperationsRecord): void {
    if (!selectedShow) return;
    setOperations((current) => {
      const existing = current.records.find((item) => item.showId === selectedShow.id) ?? createShowOperationsRecord(selectedShow.id);
      const updated = { ...updater(existing), updatedAt: new Date().toISOString() };
      return {
        records: current.records.some((item) => item.showId === selectedShow.id)
          ? current.records.map((item) => item.showId === selectedShow.id ? updated : item)
          : [...current.records, updated],
      };
    });
  }

  function setTab(tab: OperationsTab): void {
    updateRecord((current) => ({ ...current, lastViewedTab: tab }));
  }

  function openAction(target: PreflightActionTarget, segmentId = ""): void {
    if (!selectedShow) return;
    if (target === "handoff") onOpenHandoff(selectedShow.id);
    else if (target === "transfer") onOpenTransfer(selectedShow.id);
    else if (target === "results") setTab("results");
    else onOpenShow(selectedShow.id, segmentId || selectedShow.segments[0]?.id || "");
  }

  function toggleAcknowledgement(issueId: string, acknowledged: boolean): void {
    updateRecord((current) => ({
      ...current,
      acknowledgedIssueIds: acknowledged
        ? [...new Set([...current.acknowledgedIssueIds, issueId])]
        : current.acknowledgedIssueIds.filter((id) => id !== issueId),
    }));
  }

  function analyzeSnapshot(): void {
    if (!selectedShow || !snapshot) return;
    const session = buildResultIntakeSession(selectedShow, snapshot);
    if (!session) { setNotice("No plausible actual TEW show was found in the loaded snapshot."); return; }
    updateRecord((current) => ({ ...current, resultSessions: [session, ...current.resultSessions].slice(0, 20), lastViewedTab: "results" }));
    setNotice(`${session.actualShowName} was selected as the strongest post-show candidate at ${session.showConfidence}% confidence.`);
  }

  function updateSuggestion(plannedSegmentId: string, status: ResultMatchSuggestion["status"]): void {
    if (!latestSession) return;
    updateRecord((current) => ({
      ...current,
      resultSessions: current.resultSessions.map((session) => session.id === latestSession.id
        ? { ...session, suggestions: session.suggestions.map((suggestion) => suggestion.plannedSegmentId === plannedSegmentId ? { ...suggestion, status } : suggestion) }
        : session),
    }));
  }

  function applyResults(): void {
    if (!selectedShow || !snapshot || !latestSession) return;
    const confirmed = latestSession.suggestions.filter((suggestion) => suggestion.status === "Confirmed").length;
    if (confirmed === 0) { setNotice("Confirm at least one suggested match link before applying result intake."); return; }
    try {
      const updatedShow = applyConfirmedResultLinks(selectedShow, latestSession, snapshot);
      setShows((current) => current.map((show) => show.id === selectedShow.id ? updatedShow : show));
      updateRecord((current) => ({
        ...current,
        resultSessions: current.resultSessions.map((session) => session.id === latestSession.id ? { ...session, appliedAt: new Date().toISOString() } : session),
      }));
      setNotice(`${confirmed} confirmed TEW match link${confirmed === 1 ? " was" : "s were"} applied. Review angles and downstream championship or competition actions before marking the show fully Reconciled.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The confirmed links could not be applied.");
    }
  }

  function addChangeNote(): void {
    if (!selectedShow || !changeForm.field.trim() || !changeForm.reason.trim()) {
      setNotice("A changed field and reason are required.");
      return;
    }
    const note = createOperationsChangeNote({ showId: selectedShow.id, ...changeForm });
    updateRecord((current) => ({ ...current, changeNotes: [note, ...current.changeNotes] }));
    setChangeForm({ segmentId: "", field: "", originalValue: "", enteredValue: "", reason: "", updateCreativePlan: false, requiresNewVersion: false });
    setNotice("The TEW-entry change was recorded without overwriting the original plan.");
  }

  const tab = record?.lastViewedTab ?? "overview";
  const stageIndex = summary ? stageOrder.indexOf(summary.stage) : 0;
  const activeIssues = preflight?.issues.filter((issue) => !issue.acknowledged) ?? [];
  const integrityIssues = selectedShow ? [
    new Set(selectedShow.segments.map((segment) => segment.id)).size !== selectedShow.segments.length ? "Duplicate segment identifiers detected." : "",
    handoffRecord && !selectedShow ? "Handoff record references a missing show." : "",
    transferRecord && transferPackage && transferPackage.showId !== selectedShow.id ? "Transfer package show reference is inconsistent." : "",
  ].filter(Boolean) : [];

  return <section className="operations-workspace">
    <header className="operations-hero">
      <div><p className="eyebrow">UNIFIED TEW SHOW OPERATIONS</p><h2>One show. One operational path. TEW remains the game.</h2><p>Review creative readiness, finalize the handoff, enter the card, intake actual TEW results, and preserve every controlled revision from one workspace.</p></div>
      <div className="operations-autosave"><span>Browser autosave</span><strong>{savedAt ? "Saved" : "Ready"}</strong><small>{savedAt ? dateLabel(savedAt) : "No operations changes yet"}</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="operations-selector">
      <label className="field"><span>Planned show</span><select aria-label="Operations planned show" value={selectedShow?.id ?? ""} disabled={shows.length === 0} onChange={(event) => setSelectedShowId(event.target.value)}><option value="">{shows.length ? "Select a show" : "No planned shows"}</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {dateLabel(show.date)}</option>)}</select></label>
      {selectedShow && <div className="operations-selector-actions"><button className="secondary-button" type="button" onClick={() => onOpenShow(selectedShow.id, selectedShow.segments[0]?.id ?? "")}>Open Card</button><button className="secondary-button" type="button" onClick={() => onOpenHandoff(selectedShow.id)}>Open Handoff</button><button className="secondary-button" type="button" onClick={() => onOpenTransfer(selectedShow.id)}>Open TEW Transfer</button></div>}
    </section>

    {!selectedShow || !summary || !preflight ? <div className="empty-state operations-empty"><h3>Create a planned show to begin operations</h3><p>The operational dashboard will connect card planning, approaches, outputs, handoff, TEW entry, and results.</p></div> : <>
      <section className="operations-stage-card">
        <div><span>Current stage</span><strong>{summary.stage}</strong><p>{summary.stageDetail}</p></div>
        <div className="operations-next-action"><span>Next required action</span><strong>{summary.nextAction}</strong><button className="primary-button" type="button" onClick={() => openAction(summary.nextActionTarget, summary.nextSegmentId)}>Continue Workflow</button></div>
      </section>

      <div className="operations-stage-track" aria-label="Show operations stage">
        {stageOrder.map((stage, index) => <div key={stage} className={`${index < stageIndex ? "complete" : ""} ${index === stageIndex ? "current" : ""}`}><span>{index + 1}</span><small>{stage}</small></div>)}
      </div>

      <nav className="operations-tabs" aria-label="Show operations sections">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Operations Overview</button>
        <button type="button" className={tab === "preflight" ? "active" : ""} onClick={() => setTab("preflight")}>Card Preflight</button>
        <button type="button" className={tab === "entry" ? "active" : ""} onClick={() => setTab("entry")}>Show-Day Entry</button>
        <button type="button" className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>Result Intake</button>
        <button type="button" className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>Entry Changes</button>
      </nav>

      {tab === "overview" && <div className="operations-overview">
        <section className="operations-metrics">
          <article><span>Preflight score</span><strong>{preflight.score}</strong><small>{preflight.blockingCount} blocking · {preflight.importantCount} important</small></article>
          <article><span>Card</span><strong>{summary.matchCount}M / {summary.angleCount}A</strong><small>{summary.plannedMinutes} of {summary.expectedMinutes} minutes</small></article>
          <article><span>Approaches</span><strong>{summary.approachesComplete}/{summary.approachesTotal}</strong><small>Matches fully configured</small></article>
          <article><span>Outputs</span><strong>{summary.narrativesComplete}/{summary.narrativesTotal}</strong><small>Match Stories and Angle Outputs</small></article>
          <article><span>Handoff</span><strong>{summary.handoffVersion ? `V${summary.handoffVersion}` : "None"}</strong><small>{summary.staleHandoff ? "Revision required" : "Current version"}</small></article>
          <article><span>TEW entry</span><strong>{summary.transferCompleted}/{summary.transferTotal}</strong><small>{summary.staleTransfer ? "Package is stale" : "Segments entered"}</small></article>
        </section>

        <section className="operations-panel operations-priority-panel"><header><div><p className="eyebrow">PRIORITY QUEUE</p><h3>What needs attention now</h3></div><span>{activeIssues.length}</span></header>{activeIssues.length === 0 ? <div className="operations-success"><strong>Creative preflight is clear.</strong><span>Proceed to the next operational stage.</span></div> : <div className="operations-priority-list">{activeIssues.slice(0, 6).map((issue) => <article key={issue.id}><div><span className={`operations-severity operations-severity--${statusClass(issue.severity)}`}>{issue.severity}</span><strong>{issue.message}</strong><small>{issue.detail}</small></div>{issueAction(issue, openAction)}</article>)}</div>}</section>

        <section className="operations-two-column">
          <article className="operations-panel"><header><div><p className="eyebrow">VERSION CONTROL</p><h3>Finalized card state</h3></div></header>{handoffVersion ? <><strong>Handoff Version {handoffVersion.versionNumber}</strong><p>{handoffVersion.changesFromPrevious.length ? handoffVersion.changesFromPrevious.join(" · ") : "Initial frozen version."}</p><small>Source card updated {dateLabel(handoffVersion.show.sourceUpdatedAt)}</small>{summary.staleHandoff && <button className="primary-button" type="button" onClick={() => onOpenHandoff(selectedShow.id)}>Create Current Version</button>}</> : <><p>No frozen handoff version exists.</p><button className="primary-button" type="button" onClick={() => onOpenHandoff(selectedShow.id)}>Finalize Handoff</button></>}</article>
          <article className="operations-panel"><header><div><p className="eyebrow">DATA INTEGRITY</p><h3>Recovery and storage</h3></div></header><dl className="operations-integrity-list"><div><dt>Browser storage</dt><dd>{formatBytes(storageBytes)}</dd></div><div><dt>Integrity issues</dt><dd>{integrityIssues.length}</dd></div><div><dt>Transfer recovery</dt><dd>{transferRecord ? `Segment ${Math.min((transferRecord.currentSegmentIndex ?? 0) + 1, Math.max(1, summary.transferTotal))}` : "Not started"}</dd></div><div><dt>Result sessions</dt><dd>{record?.resultSessions.length ?? 0}</dd></div></dl>{storageBytes > 4 * 1024 * 1024 && <p className="operations-warning">Browser storage is becoming large. Export a full backup before clearing site data or deleting the Codespace.</p>}</article>
        </section>
      </div>}

      {tab === "preflight" && <section className="operations-panel operations-preflight-panel">
        <header><div><p className="eyebrow">FULL CARD PREFLIGHT</p><h3>{selectedShow.name}</h3><p>Blocking issues should be fixed. Important or advisory issues may be explicitly acknowledged when the booking is intentional.</p></div><div className="operations-score"><span>Score</span><strong>{preflight.score}</strong></div></header>
        <section className="operations-preflight-summary"><div><span>Blocking</span><strong>{preflight.blockingCount}</strong></div><div><span>Important</span><strong>{preflight.importantCount}</strong></div><div><span>Advisory</span><strong>{preflight.advisoryCount}</strong></div><div><span>Acknowledged</span><strong>{preflight.acknowledgedCount}</strong></div></section>
        <div className="operations-issue-list">{preflight.issues.map((issue) => <article key={issue.id} className={issue.acknowledged ? "acknowledged" : ""}><header><div><span className={`operations-severity operations-severity--${statusClass(issue.severity)}`}>{issue.severity}</span><small>{issue.category}</small></div><label><input type="checkbox" checked={issue.acknowledged} onChange={(event) => toggleAcknowledgement(issue.id, event.target.checked)} /> Acknowledge</label></header><strong>{issue.message}</strong><p>{issue.detail}</p><footer>{issueAction(issue, openAction)}</footer></article>)}</div>
      </section>}

      {tab === "entry" && <section className="operations-panel operations-entry-panel">
        <header><div><p className="eyebrow">SHOW-DAY TEW ENTRY</p><h3>{selectedShow.name}</h3><p>This operational view summarizes saved transfer position and card drift. The focused field-by-field tools remain in TEW Transfer.</p></div><button className="primary-button" type="button" onClick={() => onOpenTransfer(selectedShow.id)}>Open Focused Entry Mode</button></header>
        {!transferPackage || !transferRecord ? <div className="empty-state"><h3>No transfer package exists</h3><p>Finalize the card and generate its assisted TEW transfer package.</p><button className="primary-button" type="button" onClick={() => onOpenTransfer(selectedShow.id)}>Generate Transfer Package</button></div> : <>
          <section className="operations-entry-progress"><div><span>Event fields</span><strong>{transferRecord.eventProgress.filter((field) => field.status === "Entered" || field.status === "Not Applicable").length}/{transferRecord.eventProgress.length}</strong></div><div><span>Segments entered</span><strong>{transferRecord.segmentProgress.filter((segment) => segment.completed).length}/{transferPackage.segments.length}</strong></div><div><span>Resume position</span><strong>{transferPackage.segments[transferRecord.currentSegmentIndex]?.title ?? "Final review"}</strong></div><div><span>Package generated</span><strong>{dateLabel(transferPackage.generatedAt)}</strong></div></section>
          {summary.staleTransfer && <div className="operations-stale-warning"><strong>The transfer package is stale.</strong><span>The planned card changed after this package was generated. Regenerate before entering more fields.</span><button className="secondary-button" type="button" onClick={() => onOpenTransfer(selectedShow.id)}>Review Package</button></div>}
          <div className="operations-running-order">{transferPackage.segments.map((segment, index) => { const progress = transferRecord.segmentProgress.find((item) => item.segmentId === segment.segmentId); return <article key={segment.segmentId} className={`${progress?.completed ? "complete" : ""} ${index === transferRecord.currentSegmentIndex ? "current" : ""}`}><span>{index + 1}</span><div><strong>{segment.title}</strong><small>{segment.section} · {segment.type === "match" ? "Match" : "Angle"}</small></div><b>{progress?.completed ? "Entered" : index === transferRecord.currentSegmentIndex ? "Resume here" : "Pending"}</b></article>; })}</div>
        </>}
      </section>}

      {tab === "results" && <section className="operations-panel operations-results-panel">
        <header><div><p className="eyebrow">POST-SHOW RESULT INTAKE</p><h3>Match the planned card to actual TEW history</h3><p>Suggestions use show identity, participant overlap, description, duration, running-order section, and winner. TEW remains authoritative.</p></div><button className="primary-button" type="button" disabled={!snapshot} onClick={analyzeSnapshot}>{snapshot ? "Analyze Loaded Snapshot" : "Load TEW Snapshot First"}</button></header>
        {snapshot && <p className="operations-snapshot-label">Loaded read-only snapshot: <strong>{snapshot.fileName}</strong> · {snapshot.shows.length} shows</p>}
        {!latestSession ? <div className="empty-state"><h3>No result-intake session exists</h3><p>After running the show in TEW, load the updated database through Planned Shows or TEW Show History, then return here.</p></div> : <>
          <section className="operations-result-show"><div><span>Suggested actual show</span><strong>{latestSession.actualShowName}</strong><small>{latestSession.sourceFile}</small></div><div><span>Confidence</span><strong>{latestSession.showConfidence}%</strong><small>{latestSession.showReasons.join(" · ") || "Limited show-level evidence"}</small></div><div><span>Applied</span><strong>{latestSession.appliedAt ? "Yes" : "No"}</strong><small>{latestSession.appliedAt ? dateLabel(latestSession.appliedAt) : "Review every match link"}</small></div></section>
          <div className="operations-result-list">{latestSession.suggestions.map((suggestion) => <article key={suggestion.plannedSegmentId}><header><div><span>Planned match</span><strong>{suggestion.plannedTitle}</strong></div><b className={`operations-confidence operations-confidence--${suggestion.confidence >= 70 ? "high" : suggestion.confidence >= 45 ? "medium" : "low"}`}>{suggestion.confidence}%</b></header><div className="operations-result-arrow">→</div><div><span>Actual TEW match</span><strong>{suggestion.actualDescription}</strong><small>{suggestion.reasons.join(" · ") || "No strong matching evidence"}</small></div><label className="field"><span>Decision</span><select aria-label={`${suggestion.plannedTitle} result decision`} value={suggestion.status} onChange={(event) => updateSuggestion(suggestion.plannedSegmentId, event.target.value as ResultMatchSuggestion["status"])}><option>Suggested</option><option>Confirmed</option><option>Rejected</option></select></label></article>)}</div>
          <footer className="operations-result-actions"><span>Confirmed links update tracker reconciliation only after this explicit action. Championships and competitions retain their own confirmation steps.</span><button className="primary-button" type="button" disabled={latestSession.suggestions.every((suggestion) => suggestion.status !== "Confirmed") || Boolean(latestSession.appliedAt)} onClick={applyResults}>{latestSession.appliedAt ? "Results Applied" : "Apply Confirmed Links"}</button></footer>
        </>}
      </section>}

      {tab === "changes" && <section className="operations-panel operations-changes-panel">
        <header><div><p className="eyebrow">CONTROLLED TEW-ENTRY CHANGES</p><h3>Record deviations without overwriting the plan</h3><p>Use this when an injury, availability issue, TEW limitation, or last-minute booking decision changes what is entered.</p></div></header>
        <div className="operations-change-form">
          <label className="field"><span>Segment</span><select value={changeForm.segmentId} onChange={(event) => setChangeForm((current) => ({ ...current, segmentId: event.target.value }))}><option value="">Show-level change</option>{selectedShow.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label>
          <label className="field"><span>Changed field</span><input aria-label="Changed field" value={changeForm.field} onChange={(event) => setChangeForm((current) => ({ ...current, field: event.target.value }))} placeholder="Winner, duration, participant, finish..." /></label>
          <label className="field"><span>Original tracker value</span><input value={changeForm.originalValue} onChange={(event) => setChangeForm((current) => ({ ...current, originalValue: event.target.value }))} /></label>
          <label className="field"><span>Value entered in TEW</span><input value={changeForm.enteredValue} onChange={(event) => setChangeForm((current) => ({ ...current, enteredValue: event.target.value }))} /></label>
          <label className="field operations-change-reason"><span>Reason</span><textarea aria-label="TEW entry change reason" rows={3} value={changeForm.reason} onChange={(event) => setChangeForm((current) => ({ ...current, reason: event.target.value }))} /></label>
          <label className="operations-check"><input type="checkbox" checked={changeForm.updateCreativePlan} onChange={(event) => setChangeForm((current) => ({ ...current, updateCreativePlan: event.target.checked }))} /> Update the creative plan separately</label>
          <label className="operations-check"><input type="checkbox" checked={changeForm.requiresNewVersion} onChange={(event) => setChangeForm((current) => ({ ...current, requiresNewVersion: event.target.checked }))} /> A new handoff version is required</label>
          <button className="primary-button" type="button" onClick={addChangeNote}>Record Entry Change</button>
        </div>
        <div className="operations-change-list">{record?.changeNotes.length ? record.changeNotes.map((note) => <article key={note.id}><header><div><span>{note.segmentId ? selectedShow.segments.find((segment) => segment.id === note.segmentId)?.title ?? "Segment" : "Show-level"}</span><strong>{note.field}</strong></div><small>{dateLabel(note.createdAt)}</small></header><dl><div><dt>Planned</dt><dd>{note.originalValue || "Not recorded"}</dd></div><div><dt>Entered in TEW</dt><dd>{note.enteredValue || "Not recorded"}</dd></div><div><dt>Reason</dt><dd>{note.reason}</dd></div></dl><footer>{note.updateCreativePlan && <span>Creative-plan update requested</span>}{note.requiresNewVersion && <span>New handoff version required</span>}</footer></article>) : <div className="empty-state compact">No show-day deviations have been recorded.</div>}</div>
      </section>}
    </>}
  </section>;
}
