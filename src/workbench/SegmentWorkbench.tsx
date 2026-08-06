import { useEffect, useMemo, useState } from "react";
import MatchApproachSetupEditor from "../matchEngine/MatchApproachSetup";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineUniverse } from "../matchEngine/types";
import NarrativeGenerator from "../narratives/NarrativeGenerator";
import { createPlannerId, touchShow } from "../planner/model";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow, PlannedWorkerReference } from "../planner/types";
import type { TewSnapshot, WorkerReference } from "../tew/types";
import {
  applyWorkbenchTemplate,
  attachQuickSegmentToShow,
  captureWorkbenchDraft,
  createQuickSegmentRecord,
  duplicateWorkbenchDraft,
  primaryOutput,
  restoreWorkbenchDraft,
  saveCustomTemplate,
  synchronizeWorkerRatingSources,
  tewNotesOutput,
  updateRecentSegments,
} from "./model";
import { loadWorkbenchUniverse, saveWorkbenchUniverse } from "./storage";
import type { OutputDetail, OutputTone, QuickSegmentRecord, WorkbenchMode, WorkbenchUniverse } from "./types";

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

function formatDate(value: string): string {
  if (!value) return "Not saved";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function workerKey(worker: PlannedWorkerReference): string {
  return `${worker.source}:${worker.id}`;
}

function workerRole(type: PlannedSegment["type"]): string {
  return type === "match" ? "Competitor" : "Presence";
}

function nextSide(segment: PlannedSegment): string {
  if (segment.type !== "match") return "";
  const sideOne = segment.workers.filter((worker) => worker.side === "Side 1").length;
  const sideTwo = segment.workers.filter((worker) => worker.side === "Side 2").length;
  return sideOne <= sideTwo ? "Side 1" : "Side 2";
}

function segmentLabel(segment: PlannedSegment): string {
  return segment.title || (segment.type === "match" ? "Untitled Match" : "Untitled Angle");
}

function updateShowSegment(shows: PlannedShow[], showId: string, segment: PlannedSegment): PlannedShow[] {
  return shows.map((show) => show.id === showId
    ? touchShow({ ...show, segments: show.segments.map((item) => item.id === segment.id ? segment : item) })
    : show);
}

export default function SegmentWorkbench({ snapshot, onOpenPlannedSegment }: { snapshot: TewSnapshot | null; onOpenPlannedSegment: (showId: string, segmentId: string) => void }) {
  const [universe, setUniverse] = useState<WorkbenchUniverse>(() => {
    const loaded = loadWorkbenchUniverse(window.localStorage);
    if (loaded.quickSegments.length > 0) return loaded;
    const first = createQuickSegmentRecord("match");
    return { ...loaded, quickSegments: [first], recentSegmentIds: [first.id], settings: { ...loaded.settings, lastQuickSegmentId: first.id } };
  });
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [matchEngine, setMatchEngine] = useState<MatchEngineUniverse>(() => loadMatchEngineUniverse(window.localStorage));
  const [mode, setMode] = useState<WorkbenchMode>(() => universe.settings.defaultMode);
  const [selectedQuickId, setSelectedQuickId] = useState(() => universe.settings.lastQuickSegmentId || universe.quickSegments[0]?.id || "");
  const [selectedShowId, setSelectedShowId] = useState(() => universe.settings.lastPlannedShowId || shows[0]?.id || "");
  const [selectedPlannedSegmentId, setSelectedPlannedSegmentId] = useState(() => universe.settings.lastPlannedSegmentId || shows.find((show) => show.id === selectedShowId)?.segments[0]?.id || "");
  const [manualWorker, setManualWorker] = useState("");
  const [snapshotWorkerId, setSnapshotWorkerId] = useState("");
  const [notice, setNotice] = useState("");
  const [historyTone, setHistoryTone] = useState<OutputTone>("sports");
  const [historyDetail, setHistoryDetail] = useState<OutputDetail>("standard");
  const [revisionLabel, setRevisionLabel] = useState("");
  const [attachShowId, setAttachShowId] = useState(() => shows[0]?.id || "");
  const [customTemplateName, setCustomTemplateName] = useState("");

  const selectedQuick = universe.quickSegments.find((record) => record.id === selectedQuickId) ?? universe.quickSegments[0] ?? null;
  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const selectedPlannedSegment = selectedShow?.segments.find((segment) => segment.id === selectedPlannedSegmentId) ?? selectedShow?.segments[0] ?? null;
  const activeRecord = mode === "planned-show" ? null : selectedQuick;
  const activeSegment = mode === "planned-show" ? selectedPlannedSegment : selectedQuick?.segment ?? null;

  const modeQuickType = mode === "quick-angle" ? "angle" : "match";
  const modeTemplates = universe.templates.filter((template) => template.type === modeQuickType);
  const ratingRecords = useMemo(() => activeSegment?.workers.map((worker) => ({
    worker,
    source: universe.ratingSources.find((record) => record.workerKey === workerKey(worker)) ?? null,
  })) ?? [], [activeSegment?.workers, universe.ratingSources]);

  useEffect(() => saveWorkbenchUniverse(window.localStorage, universe), [universe]);
  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveMatchEngineUniverse(window.localStorage, matchEngine), [matchEngine]);

  useEffect(() => {
    setUniverse((current) => ({ ...current, ratingSources: synchronizeWorkerRatingSources(snapshot, matchEngine, current.ratingSources) }));
  }, [snapshot, matchEngine]);

  useEffect(() => {
    setUniverse((current) => ({ ...current, settings: { ...current.settings, defaultMode: mode } }));
    if (mode === "planned-show") return;
    const wantedType = mode === "quick-angle" ? "angle" : "match";
    const current = universe.quickSegments.find((record) => record.id === selectedQuickId && record.type === wantedType)
      ?? universe.quickSegments.find((record) => record.type === wantedType);
    if (current) {
      setSelectedQuickId(current.id);
      return;
    }
    const created = createQuickSegmentRecord(wantedType);
    setUniverse((value) => updateRecentSegments({ ...value, quickSegments: [created, ...value.quickSegments] }, created.id));
    setSelectedQuickId(created.id);
  }, [mode]);

  function updateQuick(record: QuickSegmentRecord): void {
    setUniverse((current) => ({
      ...updateRecentSegments(current, record.id),
      quickSegments: current.quickSegments.map((item) => item.id === record.id ? { ...record, updatedAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString() } : item),
    }));
  }

  function updateSegment(segment: PlannedSegment): void {
    if (mode === "planned-show" && selectedShow) {
      setShows((current) => updateShowSegment(current, selectedShow.id, segment));
      setUniverse((current) => ({ ...current, settings: { ...current.settings, lastPlannedShowId: selectedShow.id, lastPlannedSegmentId: segment.id } }));
    } else if (activeRecord) {
      updateQuick({ ...activeRecord, segment });
    }
  }

  function createQuick(type: "match" | "angle", templateId = ""): void {
    const template = universe.templates.find((item) => item.id === templateId && item.type === type);
    const created = createQuickSegmentRecord(type, template);
    setUniverse((current) => updateRecentSegments({ ...current, quickSegments: [created, ...current.quickSegments] }, created.id));
    setSelectedQuickId(created.id);
    setMode(type === "match" ? "quick-match" : "quick-angle");
    setNotice(`${template?.name ?? (type === "match" ? "Quick Match" : "Quick Angle")} created.`);
  }

  function applyTemplate(templateId: string): void {
    if (!activeRecord) return;
    const template = universe.templates.find((item) => item.id === templateId && item.type === activeRecord.type);
    if (!template) return;
    updateQuick({ ...activeRecord, segment: applyWorkbenchTemplate(activeRecord.segment, template), templateId: template.id });
    setNotice(`${template.name} structure applied. Wrestlers, winners, and dialogue were not invented.`);
  }

  function addWorker(worker: WorkerReference | null, manualName = ""): void {
    if (!activeSegment) return;
    const name = worker?.name ?? manualName.trim();
    if (!name) return;
    const source = worker ? "tew" as const : "manual" as const;
    const id = worker?.id ?? createPlannerId();
    if (activeSegment.workers.some((existing) => existing.source === source && existing.id === id)) return;
    updateSegment({
      ...activeSegment,
      workers: [...activeSegment.workers, { id, name, source, role: workerRole(activeSegment.type), side: nextSide(activeSegment) }],
    });
    setManualWorker("");
    setSnapshotWorkerId("");
  }

  function updateWorker(index: number, patch: Partial<PlannedWorkerReference>): void {
    if (!activeSegment) return;
    updateSegment({ ...activeSegment, workers: activeSegment.workers.map((worker, workerIndex) => workerIndex === index ? { ...worker, ...patch } : worker) });
  }

  function removeWorker(index: number): void {
    if (!activeSegment) return;
    const worker = activeSegment.workers[index];
    updateSegment({
      ...activeSegment,
      workers: activeSegment.workers.filter((_, workerIndex) => workerIndex !== index),
      matchApproachSetup: {
        ...activeSegment.matchApproachSetup,
        workerPlans: activeSegment.matchApproachSetup.workerPlans.filter((plan) => plan.workerKey !== workerKey(worker)),
        performancePreview: null,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  async function copyOutput(kind: "full" | "tew" | "key-moments"): Promise<void> {
    if (!activeSegment) return;
    const value = kind === "tew" ? tewNotesOutput(activeSegment) : kind === "key-moments" ? activeSegment.keyMoments : primaryOutput(activeSegment);
    setNotice(await copyText(value) ? `${kind === "tew" ? "TEW notes" : kind === "key-moments" ? "Key moments" : "Full creative output"} copied.` : "There is no output to copy yet.");
  }

  function saveRevision(): void {
    if (!activeRecord) return;
    if (!primaryOutput(activeRecord.segment).trim()) { setNotice("Write or generate an output before saving a revision."); return; }
    updateQuick(captureWorkbenchDraft(activeRecord, historyTone, historyDetail, revisionLabel));
    setRevisionLabel("");
    setNotice("Output revision saved without replacing earlier drafts.");
  }

  function attachToShow(): void {
    if (!activeRecord || !attachShowId) return;
    try {
      const result = attachQuickSegmentToShow(activeRecord, attachShowId, shows);
      setShows(result.shows);
      updateQuick(result.record);
      setNotice(`A linked copy was added to ${shows.find((show) => show.id === attachShowId)?.name ?? "the planned show"}. The Quick Segment remains unchanged.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The segment could not be attached.");
    }
  }

  function saveTemplate(): void {
    if (!activeRecord) return;
    const template = saveCustomTemplate(activeRecord, customTemplateName);
    setUniverse((current) => ({ ...current, templates: [...current.templates, template] }));
    setCustomTemplateName("");
    setNotice(`${template.name} saved as a reusable structure.`);
  }

  function selectShow(showId: string): void {
    const show = shows.find((item) => item.id === showId);
    setSelectedShowId(showId);
    setSelectedPlannedSegmentId(show?.segments[0]?.id ?? "");
    setUniverse((current) => ({ ...current, settings: { ...current.settings, lastPlannedShowId: showId, lastPlannedSegmentId: show?.segments[0]?.id ?? "" } }));
  }

  const selectedSnapshotWorker = snapshot?.workers.find((worker) => worker.id === snapshotWorkerId) ?? null;

  return <section className="workbench-workspace">
    <header className="workbench-hero">
      <div><p className="eyebrow">TEW COMPANION CORE MODE</p><h2>Match approaches and segment outputs without rebuilding the whole game</h2><p>Create a standalone match or angle, or work through an existing planned show. Copy the finished direction into TEW, run the real show there, and reconcile the result afterward.</p></div>
      <div className="workbench-safety"><span>TEW database</span><strong>Read-only</strong><small>Outputs and approach strategy stay in the companion.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <nav className="workbench-mode-tabs" aria-label="Match and Angle Workbench modes">
      <button type="button" className={mode === "quick-match" ? "active" : ""} onClick={() => setMode("quick-match")}>Quick Match</button>
      <button type="button" className={mode === "quick-angle" ? "active" : ""} onClick={() => setMode("quick-angle")}>Quick Angle</button>
      <button type="button" className={mode === "planned-show" ? "active" : ""} onClick={() => setMode("planned-show")}>Planned Show Workbench</button>
    </nav>

    <div className="workbench-layout">
      <aside className="workbench-sidebar">
        {mode === "planned-show" ? <>
          <label className="field"><span>Planned show</span><select aria-label="Workbench planned show" value={selectedShow?.id ?? ""} onChange={(event) => selectShow(event.target.value)}><option value="">No planned show selected</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label>
          <div className="workbench-list-heading"><strong>Running order</strong><span>{selectedShow?.segments.length ?? 0}</span></div>
          <div className="workbench-segment-list">{selectedShow?.segments.map((segment, index) => <button key={segment.id} type="button" className={activeSegment?.id === segment.id ? "active" : ""} onClick={() => { setSelectedPlannedSegmentId(segment.id); setUniverse((current) => ({ ...current, settings: { ...current.settings, lastPlannedSegmentId: segment.id } })); }}><span>{index + 1}</span><div><strong>{segmentLabel(segment)}</strong><small>{segment.type === "match" ? "Match" : "Angle"} · {segment.durationMinutes} min</small></div></button>)}</div>
          {selectedShow && <button className="secondary-button" type="button" onClick={() => onOpenPlannedSegment(selectedShow.id, activeSegment?.id ?? "")}>Open Full Planned Show Editor</button>}
        </> : <>
          <div className="workbench-template-panel"><strong>{modeQuickType === "match" ? "Match" : "Angle"} templates</strong><select aria-label="Workbench template" defaultValue="" onChange={(event) => { if (event.target.value) applyTemplate(event.target.value); event.currentTarget.value = ""; }}><option value="">Apply a structure…</option>{modeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button className="primary-button" type="button" onClick={() => createQuick(modeQuickType)}>New {modeQuickType === "match" ? "Quick Match" : "Quick Angle"}</button></div>
          <div className="workbench-list-heading"><strong>Recent drafts</strong><span>{universe.quickSegments.filter((record) => record.type === modeQuickType).length}</span></div>
          <div className="workbench-segment-list">{universe.quickSegments.filter((record) => record.type === modeQuickType).map((record) => <button key={record.id} type="button" className={activeRecord?.id === record.id ? "active" : ""} onClick={() => { setSelectedQuickId(record.id); setUniverse((current) => updateRecentSegments(current, record.id)); }}><span>{record.type === "match" ? "M" : "A"}</span><div><strong>{segmentLabel(record.segment)}</strong><small>{record.draftHistory.length} saved revision{record.draftHistory.length === 1 ? "" : "s"} · {formatDate(record.updatedAt)}</small></div></button>)}</div>
        </>}
      </aside>

      {!activeSegment ? <div className="empty-state workbench-empty"><h3>No segment selected</h3><p>Create a Quick Match or Quick Angle, or choose a segment from a planned show.</p></div> : <>
        <main className="workbench-setup-column">
          <section className="workbench-panel">
            <header><div><p className="eyebrow">SEGMENT SETUP</p><h3>{segmentLabel(activeSegment)}</h3></div><span className={`workbench-kind workbench-kind--${activeSegment.type}`}>{activeSegment.type === "match" ? "MATCH" : "ANGLE"}</span></header>
            <div className="workbench-basic-grid">
              <label className="field field--wide"><span>Segment name</span><input aria-label="Workbench segment name" value={activeSegment.title} onChange={(event) => updateSegment({ ...activeSegment, title: event.target.value })} /></label>
              <label className="field"><span>Length</span><input aria-label="Workbench duration" type="number" min={1} max={180} value={activeSegment.durationMinutes} onChange={(event) => updateSegment({ ...activeSegment, durationMinutes: Math.max(1, Number(event.target.value) || 1) })} /></label>
              <label className="field field--full"><span>Quick planning outline</span><textarea rows={3} value={activeSegment.notes} onChange={(event) => updateSegment({ ...activeSegment, notes: event.target.value })} /></label>
            </div>

            <div className="workbench-people-editor">
              <div className="workbench-list-heading"><strong>Participants and roles</strong><span>{activeSegment.workers.length}</span></div>
              <div className="workbench-add-worker">
                {snapshot && <><select aria-label="TEW snapshot worker" value={snapshotWorkerId} onChange={(event) => setSnapshotWorkerId(event.target.value)}><option value="">Choose a TEW worker…</option>{snapshot.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><button type="button" disabled={!selectedSnapshotWorker} onClick={() => addWorker(selectedSnapshotWorker)}>Add TEW Worker</button></>}
                <input aria-label="Quick manual worker name" placeholder="Manual worker name" value={manualWorker} onChange={(event) => setManualWorker(event.target.value)} />
                <button type="button" disabled={!manualWorker.trim()} onClick={() => addWorker(null, manualWorker)}>Add Manual Worker</button>
              </div>
              {activeSegment.workers.map((worker, index) => <article className="workbench-worker-row" key={`${workerKey(worker)}-${index}`}><div><strong>{worker.name}</strong><small>{worker.source === "tew" ? "Linked to read-only TEW identity" : "Manual tracker worker"}</small></div>{activeSegment.type === "angle" ? <select aria-label={`${worker.name} workbench role`} value={["Speaking", "Physical", "Reaction", "Presence"].includes(worker.role) ? worker.role : "Presence"} onChange={(event) => updateWorker(index, { role: event.target.value })}><option>Speaking</option><option>Physical</option><option>Reaction</option><option>Presence</option></select> : <input aria-label={`${worker.name} workbench role`} value={worker.role} onChange={(event) => updateWorker(index, { role: event.target.value })} />}{activeSegment.type === "match" && <select aria-label={`${worker.name} workbench side`} value={worker.side} onChange={(event) => updateWorker(index, { side: event.target.value })}><option>Side 1</option><option>Side 2</option><option>Other</option></select>}<button className="danger-button" type="button" onClick={() => removeWorker(index)}>Remove</button></article>)}
            </div>

            {activeSegment.type === "match" ? <div className="workbench-match-fields">
              <label className="field"><span>Match type</span><input aria-label="Workbench match type" value={activeSegment.matchType} onChange={(event) => updateSegment({ ...activeSegment, matchType: event.target.value })} /></label>
              <label className="field"><span>Planned winner</span><input aria-label="Workbench planned winner" value={activeSegment.plannedWinner} onChange={(event) => updateSegment({ ...activeSegment, plannedWinner: event.target.value })} /></label>
              <label className="field"><span>Planned finish</span><input aria-label="Workbench planned finish" value={activeSegment.plannedFinish} onChange={(event) => updateSegment({ ...activeSegment, plannedFinish: event.target.value })} /></label>
              <label className="field field--full"><span>Championship stakes</span><textarea rows={2} value={activeSegment.championshipStakes} onChange={(event) => updateSegment({ ...activeSegment, championshipStakes: event.target.value })} /></label>
            </div> : <div className="workbench-angle-fields">
              <label className="field"><span>Location</span><input aria-label="Workbench angle location" value={activeSegment.angleLocation} onChange={(event) => updateSegment({ ...activeSegment, angleLocation: event.target.value })} /></label>
              <label className="field"><span>Content type</span><input aria-label="Workbench angle content type" value={activeSegment.angleContentType} onChange={(event) => updateSegment({ ...activeSegment, angleContentType: event.target.value })} /></label>
            </div>}

            <div className="workbench-story-grid">
              <label className="field"><span>Story purpose</span><textarea rows={3} value={activeSegment.purpose} onChange={(event) => updateSegment({ ...activeSegment, purpose: event.target.value })} /></label>
              <label className="field"><span>Consequences</span><textarea rows={3} value={activeSegment.consequences} onChange={(event) => updateSegment({ ...activeSegment, consequences: event.target.value })} /></label>
              <label className="field"><span>Follow-up</span><textarea rows={3} value={activeSegment.followUp} onChange={(event) => updateSegment({ ...activeSegment, followUp: event.target.value })} /></label>
              {activeSegment.type === "angle" && <label className="field"><span>Audience takeaway</span><textarea rows={3} value={activeSegment.audienceTakeaway} onChange={(event) => updateSegment({ ...activeSegment, audienceTakeaway: event.target.value })} /></label>}
            </div>
          </section>

          {activeSegment.type === "match" && <MatchApproachSetupEditor segment={activeSegment} universe={matchEngine} onUniverseChange={setMatchEngine} onChange={updateSegment} />}

          <section className="workbench-panel workbench-rating-sources">
            <header><div><p className="eyebrow">RATING SOURCE CHECK</p><h3>TEW identity and match-profile provenance</h3></div></header>
            {ratingRecords.length === 0 ? <p>Add participants to review whether their match-profile ratings are imported, mapped, derived, overridden, or missing.</p> : ratingRecords.map(({ worker, source }) => <details key={workerKey(worker)}><summary><strong>{worker.name}</strong><span>{source?.identitySource ?? "Manual tracker worker"}</span></summary>{source ? <div className="workbench-source-grid">{[source.overall, source.health, source.popularity, source.experience].map((field) => <div key={field.field}><span>{field.field}</span><strong>{field.overrideValue ?? field.importedValue ?? "Missing"}</strong><small>{field.source}</small><p>{field.note}</p></div>)}</div> : <p>This participant is manual. Create or edit the tracker-side Match Profile above; no TEW value will be assumed.</p>}</details>)}
            {snapshot && <p className="workbench-truth-note">The current normalized TEW reader exposes worker identities but does not yet expose verified rating columns. Values remain labeled Missing or Manual Override rather than being guessed.</p>}
          </section>
        </main>

        <aside className="workbench-output-column">
          <NarrativeGenerator segment={activeSegment} universe={matchEngine} onChange={updateSegment} />

          <section className="workbench-panel workbench-current-output">
            <header><div><p className="eyebrow">CURRENT OUTPUT</p><h3>{activeSegment.type === "match" ? "Match Story" : "Angle Segment Output"}</h3></div></header>
            <textarea aria-label="Workbench current output" rows={16} value={primaryOutput(activeSegment)} onChange={(event) => updateSegment(activeSegment.type === "match" ? { ...activeSegment, matchStory: event.target.value } : { ...activeSegment, segmentOutput: event.target.value })} />
            {activeSegment.type === "match" && <label className="field"><span>Key moments / phase map</span><textarea aria-label="Workbench key moments" rows={6} value={activeSegment.keyMoments} onChange={(event) => updateSegment({ ...activeSegment, keyMoments: event.target.value })} /></label>}
            <div className="workbench-copy-actions"><button className="primary-button" type="button" onClick={() => void copyOutput("tew")}>Copy TEW Notes</button><button className="secondary-button" type="button" onClick={() => void copyOutput("full")}>Copy Full Creative Output</button>{activeSegment.type === "match" && <button className="secondary-button" type="button" onClick={() => void copyOutput("key-moments")}>Copy Key Moments</button>}</div>
            <details><summary>TEW-notes preview</summary><pre>{tewNotesOutput(activeSegment) || "Complete the segment setup and output to build TEW notes."}</pre></details>
          </section>

          {activeRecord && <section className="workbench-panel workbench-history">
            <header><div><p className="eyebrow">DRAFT HISTORY</p><h3>Save, restore, and duplicate outputs</h3></div><span>{activeRecord.draftHistory.length}</span></header>
            <div className="workbench-history-controls"><input aria-label="Revision label" placeholder="Optional revision label" value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} /><select aria-label="Revision tone" value={historyTone} onChange={(event) => setHistoryTone(event.target.value as OutputTone)}><option value="sports">Sports</option><option value="dramatic">Dramatic</option><option value="road-agent">Road-agent</option></select><select aria-label="Revision detail" value={historyDetail} onChange={(event) => setHistoryDetail(event.target.value as OutputDetail)}><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select><button className="primary-button" type="button" onClick={saveRevision}>Save Output Revision</button></div>
            <div className="workbench-revision-list">{activeRecord.draftHistory.map((revision) => <article key={revision.id}><div><strong>{revision.label}</strong><span>{revision.tone} · {revision.detail}</span><small>{formatDate(revision.createdAt)}</small></div><p>{revision.fullOutput.slice(0, 180) || "No output text saved."}</p><div><button type="button" onClick={() => updateQuick(restoreWorkbenchDraft(activeRecord, revision))}>Restore</button><button type="button" onClick={() => { const duplicate = duplicateWorkbenchDraft(activeRecord, revision); setUniverse((current) => updateRecentSegments({ ...current, quickSegments: [duplicate, ...current.quickSegments] }, duplicate.id)); setSelectedQuickId(duplicate.id); }}>Duplicate Draft</button><button type="button" onClick={() => void copyText(revision.tewNotes)}>Copy Saved TEW Notes</button></div></article>)}</div>
          </section>}

          {activeRecord && <section className="workbench-panel workbench-linking">
            <header><div><p className="eyebrow">REUSE AND LINK</p><h3>Keep the standalone draft, attach a copy later</h3></div></header>
            <label className="field"><span>Add a linked copy to planned show</span><select aria-label="Attach quick segment to show" value={attachShowId} onChange={(event) => setAttachShowId(event.target.value)}><option value="">Choose a planned show…</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label><button className="primary-button" type="button" disabled={!attachShowId} onClick={attachToShow}>Add Copy to Planned Show</button>
            <div className="workbench-custom-template"><input aria-label="Custom template name" placeholder="Template name" value={customTemplateName} onChange={(event) => setCustomTemplateName(event.target.value)} /><button className="secondary-button" type="button" onClick={saveTemplate}>Save Structure as Template</button></div>
            {activeRecord.attachedShowIds.length > 0 && <p>Linked show copies: {activeRecord.attachedShowIds.length}. The standalone draft remains independent.</p>}
          </section>}
        </aside>
      </>}
    </div>
  </section>;
}
