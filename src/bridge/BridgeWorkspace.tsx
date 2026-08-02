import { useEffect, useMemo, useRef, useState } from "react";
import { loadHandoffUniverse } from "../handoff/storage";
import { loadPlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { readTewSnapshot } from "../tew/reader";
import type { TewSnapshot } from "../tew/types";
import {
  buildBridgeDryRun,
  buildBridgeReadiness,
  buildCompanionWorkflow,
  compareTewSnapshots,
} from "./model";
import { loadBridgeUniverse, saveBridgeUniverse } from "./storage";
import type {
  BridgeFieldMapping,
  BridgeUniverse,
  CompanionWorkspaceView,
  TewComparisonReport,
} from "./types";

function formatDate(value: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function SnapshotSlot({
  label,
  snapshot,
  loading,
  onSelect,
  onClear,
}: {
  label: string;
  snapshot: TewSnapshot | null;
  loading: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return <article className={`bridge-snapshot-slot ${snapshot ? "is-loaded" : ""}`}>
    <div>
      <span>{label}</span>
      <strong>{snapshot?.fileName || "No database loaded"}</strong>
      <small>{snapshot ? `${snapshot.tables.length} tables · ${snapshot.shows.length} shows · ${snapshot.workers.length} workers` : "Choose a copied MDB/ACCDB file. It is read only."}</small>
    </div>
    <div className="bridge-slot-actions">
      <button className="secondary-button" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>{snapshot ? "Replace" : "Select File"}</button>
      {snapshot && <button className="secondary-button" type="button" onClick={onClear}>Clear</button>}
    </div>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const file = event.target.files?.item(0); if (file) onSelect(file); event.currentTarget.value = ""; }} />
  </article>;
}

function MappingRow({ mapping, onChange }: { mapping: BridgeFieldMapping; onChange: (mapping: BridgeFieldMapping) => void }) {
  function update(patch: Partial<BridgeFieldMapping>): void {
    onChange({ ...mapping, ...patch, updatedAt: new Date().toISOString() });
  }
  return <article className="bridge-mapping-row">
    <header><div><span>{mapping.category}</span><strong>{mapping.trackerLabel}</strong><small>Tracker field: {mapping.trackerField}</small></div><select aria-label={`${mapping.trackerLabel} mapping status`} value={mapping.status} onChange={(event) => update({ status: event.target.value as BridgeFieldMapping["status"] })}><option>Candidate</option><option>Verified</option><option>Unsupported</option></select></header>
    <div className="bridge-mapping-grid">
      <label className="field"><span>TEW table</span><input aria-label={`${mapping.trackerLabel} TEW table`} value={mapping.tewTable} onChange={(event) => update({ tewTable: event.target.value })} /></label>
      <label className="field"><span>TEW field</span><input aria-label={`${mapping.trackerLabel} TEW field`} value={mapping.tewField} onChange={(event) => update({ tewField: event.target.value })} /></label>
      <label className="field"><span>Confidence</span><select aria-label={`${mapping.trackerLabel} confidence`} value={mapping.confidence} onChange={(event) => update({ confidence: event.target.value as BridgeFieldMapping["confidence"] })}><option>Low</option><option>Medium</option><option>High</option></select></label>
      <label className="field field--full"><span>Evidence</span><textarea rows={2} value={mapping.evidence} onChange={(event) => update({ evidence: event.target.value })} /></label>
      <label className="field field--full"><span>Notes</span><textarea rows={2} value={mapping.notes} onChange={(event) => update({ notes: event.target.value })} /></label>
    </div>
  </article>;
}

function ComparisonResults({ report }: { report: TewComparisonReport }) {
  const changedTables = report.tableChanges.filter((change) => change.classification !== "Unchanged");
  return <div className="bridge-comparison-results">
    <section className="bridge-score-strip">
      <div><span>Changed tables</span><strong>{changedTables.length}</strong></div>
      <div><span>Entity changes</span><strong>{report.entityChanges.length}</strong></div>
      <div><span>Candidate tables</span><strong>{report.candidateTables.length}</strong></div>
      <div><span>Writing</span><strong>Disabled</strong></div>
    </section>
    <p className="bridge-safety-note">{report.notes}</p>
    <section className="bridge-results-section">
      <header><h3>Table changes</h3><span>{changedTables.length}</span></header>
      {changedTables.length === 0 ? <p>No table row-count or schema changes were detected.</p> : <div className="bridge-table-change-list">{changedTables.map((change) => <article key={change.tableName}><div><strong>{change.tableName}</strong><span className={`bridge-change-badge bridge-change-badge--${statusClass(change.classification)}`}>{change.classification}</span></div><small>{change.beforeRows.toLocaleString()} → {change.afterRows.toLocaleString()} rows ({change.rowDelta >= 0 ? "+" : ""}{change.rowDelta}) · {change.beforeColumns} → {change.afterColumns} columns</small></article>)}</div>}
    </section>
    <section className="bridge-results-section">
      <header><h3>Mapped entity changes</h3><span>{report.entityChanges.length}</span></header>
      {report.entityChanges.length === 0 ? <p>No normalized show, match, worker, or storyline changes were detected.</p> : <div className="bridge-entity-change-list">{report.entityChanges.map((change, index) => <article key={`${change.entityType}-${change.entityId}-${index}`}><header><div><span>{change.entityType}</span><strong>{change.entityName || change.entityId}</strong></div><b>{change.changeType}</b></header>{change.fieldChanges.length > 0 && <dl>{change.fieldChanges.map((field) => <div key={field.field}><dt>{field.field}</dt><dd><span>{field.beforeValue || "—"}</span><i>→</i><span>{field.afterValue || "—"}</span></dd></div>)}</dl>}</article>)}</div>}
    </section>
  </div>;
}

export default function BridgeWorkspace({ onOpenShow }: { onOpenShow: (showId: string, segmentId: string) => void }) {
  const [universe, setUniverse] = useState<BridgeUniverse>(() => loadBridgeUniverse(window.localStorage));
  const [shows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [handoff] = useState(() => loadHandoffUniverse(window.localStorage));
  const [selectedShowId, setSelectedShowId] = useState(() => shows[0]?.id ?? "");
  const [view, setView] = useState<CompanionWorkspaceView>(() => universe.settings.defaultView);
  const [beforeSnapshot, setBeforeSnapshot] = useState<TewSnapshot | null>(null);
  const [afterSnapshot, setAfterSnapshot] = useState<TewSnapshot | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<"before" | "after" | "">("");
  const [error, setError] = useState("");
  const [activeReportId, setActiveReportId] = useState(() => universe.comparisonReports[0]?.id ?? "");

  useEffect(() => { saveBridgeUniverse(window.localStorage, universe); }, [universe]);
  const selectedShow = useMemo(() => shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null, [selectedShowId, shows]);
  const workflow = useMemo(() => selectedShow ? buildCompanionWorkflow(selectedShow, handoff) : [], [handoff, selectedShow]);
  const readiness = useMemo(() => selectedShow ? buildBridgeReadiness(selectedShow, universe.mappings) : null, [selectedShow, universe.mappings]);
  const dryRun = useMemo(() => selectedShow ? buildBridgeDryRun(selectedShow, universe.mappings) : null, [selectedShow, universe.mappings]);
  const activeReport = universe.comparisonReports.find((report) => report.id === activeReportId) ?? universe.comparisonReports[0] ?? null;

  function updateSettings(patch: Partial<BridgeUniverse["settings"]>): void {
    setUniverse((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  async function loadSnapshot(file: File, slot: "before" | "after"): Promise<void> {
    setLoadingSlot(slot);
    setError("");
    try {
      const snapshot = await readTewSnapshot(file);
      if (slot === "before") setBeforeSnapshot(snapshot);
      else setAfterSnapshot(snapshot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The TEW database could not be read.");
    } finally {
      setLoadingSlot("");
    }
  }

  function runComparison(): void {
    if (!beforeSnapshot || !afterSnapshot) return;
    const report = compareTewSnapshots(beforeSnapshot, afterSnapshot);
    setUniverse((current) => ({ ...current, comparisonReports: [report, ...current.comparisonReports].slice(0, 20) }));
    setActiveReportId(report.id);
  }

  function updateMapping(mapping: BridgeFieldMapping): void {
    setUniverse((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? mapping : item) }));
  }

  return <section className="bridge-workspace">
    <header className="bridge-hero">
      <div><p className="eyebrow">TEW COMPANION MODE</p><h2>Plan here. Run the show in TEW. Reconcile the real result.</h2><p>This workspace keeps the tracker focused on match approaches, Match Stories, Angle Outputs, competition planning, handoff, and safe read-only TEW research.</p></div>
      <div className="bridge-mode-card"><span>Direct TEW writing</span><strong>Disabled</strong><small>No live-save or executable changes.</small></div>
    </header>

    <section className="bridge-settings-bar">
      <label><input type="checkbox" checked={universe.settings.enabled} onChange={(event) => updateSettings({ enabled: event.target.checked })} /><span>Use TEW Companion Mode</span></label>
      <label><input aria-label="Show advanced preview tools" type="checkbox" checked={universe.settings.advancedPreviewTools} onChange={(event) => updateSettings({ advancedPreviewTools: event.target.checked })} /><span>Show Advanced Preview Tools</span></label>
      <label className="field"><span>Default companion view</span><select value={universe.settings.defaultView} onChange={(event) => updateSettings({ defaultView: event.target.value as CompanionWorkspaceView })}><option value="workflow">Show Workflow</option><option value="comparison">Before / After Comparison</option><option value="mappings">Field Mappings</option><option value="readiness">Bridge Readiness</option><option value="dry-run">Dry-Run Package</option></select></label>
    </section>

    <nav className="bridge-tabs" aria-label="TEW Companion workspace sections">
      <button className={view === "workflow" ? "active" : ""} onClick={() => setView("workflow")} type="button">Show Workflow</button>
      <button className={view === "comparison" ? "active" : ""} onClick={() => setView("comparison")} type="button">Before / After Comparison</button>
      <button className={view === "mappings" ? "active" : ""} onClick={() => setView("mappings")} type="button">Field Mappings</button>
      <button className={view === "readiness" ? "active" : ""} onClick={() => setView("readiness")} type="button">Bridge Readiness</button>
      <button className={view === "dry-run" ? "active" : ""} onClick={() => setView("dry-run")} type="button">Dry-Run Package</button>
    </nav>

    {error && <div className="status-banner error" role="alert"><strong>Read-only import failed</strong><span>{error}</span></div>}

    {view !== "comparison" && <section className="bridge-show-picker"><label className="field"><span>Planned show</span><select aria-label="Companion planned show" value={selectedShow?.id ?? ""} disabled={shows.length === 0} onChange={(event) => setSelectedShowId(event.target.value)}><option value="">{shows.length === 0 ? "No planned shows" : "Select a show"}</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.status}</option>)}</select></label>{selectedShow && <button className="secondary-button" type="button" onClick={() => onOpenShow(selectedShow.id, selectedShow.segments[0]?.id ?? "")}>Open Planned Show</button>}</section>}

    {view === "workflow" && <section className="bridge-panel">
      <header><div><p className="eyebrow">ONE GUIDED PATH</p><h3>{selectedShow?.name || "Create a planned show first"}</h3></div></header>
      {selectedShow ? <div className="bridge-workflow-list">{workflow.map((step, index) => <article key={step.id} className={`bridge-workflow-step bridge-workflow-step--${statusClass(step.status)}`}><span>{index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div><b>{step.status}</b></article>)}</div> : <div className="empty-state">No planned show is available. Build the card in Planned Shows, then return here.</div>}
      <footer className="bridge-boundary"><strong>TEW is the game.</strong><span>The tracker prepares creative details and handoff material. TEW runs the show and supplies actual results and ratings.</span></footer>
    </section>}

    {view === "comparison" && <section className="bridge-panel">
      <header><div><p className="eyebrow">READ-ONLY SCHEMA RESEARCH</p><h3>Compare TEW database copies</h3><p>Use a copy from before manual card entry and another copy after entering the same card in TEW.</p></div></header>
      <div className="bridge-snapshot-grid"><SnapshotSlot label="Before card entry" snapshot={beforeSnapshot} loading={loadingSlot === "before"} onSelect={(file) => void loadSnapshot(file, "before")} onClear={() => setBeforeSnapshot(null)} /><SnapshotSlot label="After card entry" snapshot={afterSnapshot} loading={loadingSlot === "after"} onSelect={(file) => void loadSnapshot(file, "after")} onClear={() => setAfterSnapshot(null)} /></div>
      <div className="bridge-comparison-actions"><button className="primary-button" type="button" disabled={!beforeSnapshot || !afterSnapshot || Boolean(loadingSlot)} onClick={runComparison}>Create Read-Only Comparison</button><span>No bytes are written back to either file.</span></div>
      {universe.comparisonReports.length > 0 && <label className="field bridge-report-picker"><span>Saved comparison report</span><select aria-label="Saved comparison report" value={activeReport?.id ?? ""} onChange={(event) => setActiveReportId(event.target.value)}>{universe.comparisonReports.map((report) => <option key={report.id} value={report.id}>{report.beforeFileName} → {report.afterFileName} · {formatDate(report.createdAt)}</option>)}</select></label>}
      {activeReport ? <ComparisonResults report={activeReport} /> : <div className="empty-state">Load both copied databases to create the first structural comparison report.</div>}
    </section>}

    {view === "mappings" && <section className="bridge-panel">
      <header><div><p className="eyebrow">FIELD-MAPPING LABORATORY</p><h3>Map tracker fields to verified TEW evidence</h3><p>Candidate mappings are not exporter-ready. Mark a field Verified only after repeatable before/after evidence identifies the table, field, and relationships.</p></div><div className="bridge-count-card"><span>Verified</span><strong>{universe.mappings.filter((mapping) => mapping.status === "Verified").length}</strong><small>of {universe.mappings.length} fields</small></div></header>
      <div className="bridge-mapping-list">{universe.mappings.map((mapping) => <MappingRow key={mapping.id} mapping={mapping} onChange={updateMapping} />)}</div>
    </section>}

    {view === "readiness" && <section className="bridge-panel">
      <header><div><p className="eyebrow">CARD READINESS</p><h3>{readiness?.showName || "No selected show"}</h3><p>Verified mappings may support a future guarded exporter. Candidate and manual fields continue through the existing Entry Assistant.</p></div></header>
      {readiness ? <><section className="bridge-score-strip"><div><span>Verified</span><strong>{readiness.verifiedCount}</strong></div><div><span>Candidate</span><strong>{readiness.candidateCount}</strong></div><div><span>Manual</span><strong>{readiness.manualCount}</strong></div><div><span>Blocking</span><strong>{readiness.blockingCount}</strong></div></section><div className="bridge-readiness-list">{readiness.fields.map((field, index) => <article key={`${field.trackerField}-${index}`}><div><strong>{field.label}</strong><small>{field.detail}</small></div><span className={`bridge-status bridge-status--${statusClass(field.status)}`}>{field.status}</span></article>)}</div></> : <div className="empty-state">No planned show is available.</div>}
    </section>}

    {view === "dry-run" && <section className="bridge-panel">
      <header><div><p className="eyebrow">EXPERIMENTAL NON-WRITING PACKAGE</p><h3>{dryRun?.showName || "No selected show"}</h3><p>This report describes proposed database changes. It cannot execute them.</p></div><div className="bridge-mode-card"><span>Writing enabled</span><strong>No</strong><small>Hard safety boundary</small></div></header>
      {dryRun ? <><section className="bridge-score-strip"><div><span>Ready</span><strong>{dryRun.readyCount}</strong></div><div><span>Candidate</span><strong>{dryRun.candidateCount}</strong></div><div><span>Manual</span><strong>{dryRun.manualCount}</strong></div><div><span>Blocked</span><strong>{dryRun.blockedCount}</strong></div></section><div className="bridge-dry-run-list">{dryRun.proposedChanges.map((change) => <article key={change.id}><header><div><span>{change.category}</span><strong>{change.targetTable}.{change.targetField}</strong></div><b className={`bridge-status bridge-status--${statusClass(change.validation)}`}>{change.validation}</b></header><p>{change.proposedValue || "No value"}</p>{change.referencedIds.length > 0 && <small>Referenced IDs: {change.referencedIds.join(", ")}</small>}{change.problem && <em>{change.problem}</em>}</article>)}</div></> : <div className="empty-state">No planned show is available.</div>}
    </section>}
  </section>;
}
