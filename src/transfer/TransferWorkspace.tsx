import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildGuardedExportAudit,
  buildRawEvidenceSession,
  mappingStageGate,
  promoteMapping,
  validateRoundTrip,
  verificationStage,
} from "../bridge/guardedTransfer";
import { loadBridgeUniverse, saveBridgeUniverse } from "../bridge/storage";
import type {
  BridgeFieldMapping,
  BridgeMappingVerificationStage,
  BridgeUniverse,
  GuardedExportAudit,
  RawEvidenceSession,
} from "../bridge/types";
import { loadPlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import { readTewResearchTables, readTewSnapshot } from "../tew/reader";
import type { TewResearchSnapshot } from "../tew/types";
import {
  buildTransferPackage,
  buildTransferText,
  createTransferAudit,
  synchronizeTransferRecord,
} from "./model";
import { loadTransferUniverse, saveTransferUniverse } from "./storage";
import type {
  TransferField,
  TransferFieldProgress,
  TransferPackage,
  TransferRecord,
  TransferUniverse,
} from "./types";

type TransferView = "entry" | "raw-evidence" | "mapping-gates" | "exporter";

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tew-transfer";
}

function download(name: string, content: string, type = "application/json"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(value: string): Promise<boolean> {
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

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function activePackage(record: TransferRecord | null): TransferPackage | null {
  if (!record) return null;
  return record.packageHistory.find((pkg) => pkg.id === record.activePackageId) ?? record.packageHistory.at(-1) ?? null;
}

function progressFor(fields: TransferFieldProgress[], key: string): TransferFieldProgress | undefined {
  return fields.find((field) => field.fieldKey === key);
}

function TransferFieldRow({
  field,
  progress,
  onCopy,
  onStatus,
}: {
  field: TransferField;
  progress: TransferFieldProgress | undefined;
  onCopy: () => void;
  onStatus: (status: TransferFieldProgress["status"]) => void;
}) {
  return <article className="transfer-field-row">
    <header><div><span>{field.destination}</span><strong>{field.label}</strong><small>{field.mappingTarget} · {field.mappingStage}</small></div><select aria-label={`${field.label} transfer status`} value={progress?.status ?? "Pending"} onChange={(event) => onStatus(event.target.value as TransferFieldProgress["status"])}><option>Pending</option><option>Copied</option><option>Entered</option><option>Not Applicable</option></select></header>
    <pre>{field.value || "Not set"}</pre>
    <footer><span>{field.guidance}</span><button className="secondary-button" type="button" disabled={!field.value} onClick={onCopy}>Copy Field</button></footer>
  </article>;
}

function EvidenceFileSlot({ label, file, onSelect }: { label: string; file: File | null; onSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return <article className={`transfer-file-slot ${file ? "is-loaded" : ""}`}><div><span>{label}</span><strong>{file?.name ?? "No file selected"}</strong><small>Read-only table sampling. No bytes are written.</small></div><button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>{file ? "Replace" : "Select Copy"}</button><input ref={inputRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const selected = event.target.files?.item(0); if (selected) onSelect(selected); event.currentTarget.value = ""; }} /></article>;
}

export default function TransferWorkspace({ onOpenShow }: { onOpenShow: (showId: string, segmentId: string) => void }) {
  const [shows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [bridge, setBridge] = useState<BridgeUniverse>(() => loadBridgeUniverse(window.localStorage));
  const [transfer, setTransfer] = useState<TransferUniverse>(() => loadTransferUniverse(window.localStorage));
  const [selectedShowId, setSelectedShowId] = useState(() => shows[0]?.id ?? "");
  const [view, setView] = useState<TransferView>("entry");
  const [notice, setNotice] = useState("");
  const [selectedComparisonId, setSelectedComparisonId] = useState(() => bridge.comparisonReports[0]?.id ?? "");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [identityFields, setIdentityFields] = useState<Record<string, string>>({});
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [rowLimit, setRowLimit] = useState(500);
  const [researchLoading, setResearchLoading] = useState(false);
  const [mappingMessage, setMappingMessage] = useState<Record<string, string>>({});
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceCopyConfirmed, setSourceCopyConfirmed] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);

  useEffect(() => saveBridgeUniverse(window.localStorage, bridge), [bridge]);
  useEffect(() => saveTransferUniverse(window.localStorage, transfer), [transfer]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null;
  const record = selectedShow ? transfer.records.find((item) => item.showId === selectedShow.id) ?? null : null;
  const pkg = activePackage(record);
  const selectedComparison = bridge.comparisonReports.find((report) => report.id === selectedComparisonId) ?? bridge.comparisonReports[0] ?? null;
  const evidenceSessions = bridge.rawEvidenceSessions ?? [];
  const latestEvidence = evidenceSessions[0] ?? null;
  const exportAudits = bridge.exportAudits ?? [];
  const latestAudit = selectedShow ? exportAudits.find((audit) => audit.showId === selectedShow.id) ?? null : null;
  const currentIndex = record?.currentSegmentIndex ?? 0;
  const currentSegment = pkg?.segments[currentIndex] ?? null;
  const currentSegmentProgress = currentSegment ? record?.segmentProgress.find((item) => item.segmentId === currentSegment.segmentId) ?? null : null;

  useEffect(() => {
    if (!selectedComparison || selectedTables.length > 0) return;
    setSelectedTables(selectedComparison.candidateTables.slice(0, 8));
  }, [selectedComparison, selectedTables.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (view !== "entry" || !pkg || !record) return;
      if (event.altKey && event.key === "ArrowRight") setCurrentSegment(Math.min(pkg.segments.length - 1, currentIndex + 1));
      if (event.altKey && event.key === "ArrowLeft") setCurrentSegment(Math.max(0, currentIndex - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function setCurrentSegment(index: number): void {
    if (!selectedShow) return;
    setTransfer((current) => ({ ...current, records: current.records.map((item) => item.showId === selectedShow.id ? { ...item, currentSegmentIndex: index, updatedAt: new Date().toISOString() } : item) }));
  }

  function generatePackage(): void {
    if (!selectedShow) return;
    const nextPackage = buildTransferPackage(selectedShow, bridge.mappings);
    setTransfer((current) => {
      const existing = current.records.find((item) => item.showId === selectedShow.id);
      const nextRecord = synchronizeTransferRecord(existing, nextPackage);
      return {
        records: current.records.some((item) => item.showId === selectedShow.id) ? current.records.map((item) => item.showId === selectedShow.id ? nextRecord : item) : [...current.records, nextRecord],
        auditLogs: [createTransferAudit(selectedShow.id, "Package Generated", `${nextPackage.segments.length} segments translated for assisted TEW entry.`), ...current.auditLogs].slice(0, 250),
      };
    });
    setNotice("A new TEW-oriented transfer package was generated without changing TEW.");
  }

  function updateEventStatus(fieldKey: string, status: TransferFieldProgress["status"]): void {
    if (!selectedShow) return;
    setTransfer((current) => ({ ...current, records: current.records.map((item) => item.showId === selectedShow.id ? { ...item, eventProgress: item.eventProgress.map((field) => field.fieldKey === fieldKey ? { ...field, status, updatedAt: new Date().toISOString() } : field), updatedAt: new Date().toISOString() } : item) }));
  }

  function updateSegmentStatus(fieldKey: string, status: TransferFieldProgress["status"]): void {
    if (!selectedShow || !currentSegment) return;
    setTransfer((current) => ({ ...current, records: current.records.map((item) => item.showId === selectedShow.id ? { ...item, segmentProgress: item.segmentProgress.map((segment) => segment.segmentId === currentSegment.segmentId ? { ...segment, fields: segment.fields.map((field) => field.fieldKey === fieldKey ? { ...field, status, updatedAt: new Date().toISOString() } : field), updatedAt: new Date().toISOString() } : segment), updatedAt: new Date().toISOString() } : item) }));
  }

  async function copyTransferField(field: TransferField, fieldKey: string, segment = false): Promise<void> {
    const copied = await copyText(field.value);
    if (!copied) { setNotice("Clipboard copy failed."); return; }
    if (segment) updateSegmentStatus(fieldKey, "Copied"); else updateEventStatus(fieldKey, "Copied");
    if (selectedShow) setTransfer((current) => ({ ...current, auditLogs: [createTransferAudit(selectedShow.id, "Field Copied", field.label), ...current.auditLogs].slice(0, 250) }));
    setNotice(`${field.label} copied.`);
  }

  function markCurrentSegmentComplete(): void {
    if (!selectedShow || !currentSegment) return;
    setTransfer((current) => ({
      ...current,
      records: current.records.map((item) => item.showId === selectedShow.id ? {
        ...item,
        segmentProgress: item.segmentProgress.map((segment) => segment.segmentId === currentSegment.segmentId ? { ...segment, completed: true, fields: segment.fields.map((field) => field.status === "Not Applicable" ? field : { ...field, status: "Entered", updatedAt: new Date().toISOString() }), updatedAt: new Date().toISOString() } : segment),
        updatedAt: new Date().toISOString(),
      } : item),
      auditLogs: [createTransferAudit(selectedShow.id, "Segment Completed", currentSegment.title), ...current.auditLogs].slice(0, 250),
    }));
    setNotice(`${currentSegment.title} marked entered in TEW.`);
  }

  async function copyCompleteSegment(): Promise<void> {
    if (!currentSegment) return;
    const copied = await copyText(currentSegment.completeEntryText);
    setNotice(copied ? `${currentSegment.title} copied as a complete entry sheet.` : "Clipboard copy failed.");
  }

  function exportTransfer(format: "json" | "text"): void {
    if (!pkg) return;
    const base = `${safeName(pkg.showName)}-tew-transfer`;
    if (format === "json") download(`${base}.json`, JSON.stringify({ product: "TEW IX Assisted Transfer", writingEnabled: false, package: pkg }, null, 2));
    else download(`${base}.txt`, buildTransferText(pkg), "text/plain");
    setNotice(`${format.toUpperCase()} transfer package exported.`);
  }

  async function createEvidenceSession(): Promise<void> {
    if (!beforeFile || !afterFile || selectedTables.length === 0) return;
    setResearchLoading(true);
    setNotice("");
    try {
      const [before, after] = await Promise.all([
        readTewResearchTables(beforeFile, selectedTables, rowLimit),
        readTewResearchTables(afterFile, selectedTables, rowLimit),
      ]);
      const inferred = { ...identityFields };
      for (const tableName of selectedTables) {
        const table = after.tables.find((item) => item.name.toLowerCase() === tableName.toLowerCase()) ?? before.tables.find((item) => item.name.toLowerCase() === tableName.toLowerCase());
        if (!inferred[tableName]) inferred[tableName] = table?.identityCandidates[0] ?? "";
      }
      const session = buildRawEvidenceSession(selectedComparison?.id ?? "", before, after, selectedTables, inferred);
      setIdentityFields(session.identityFields);
      setBridge((current) => ({ ...current, rawEvidenceSessions: [session, ...(current.rawEvidenceSessions ?? [])].slice(0, 30) }));
      setNotice(session.conclusion);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Raw evidence research failed.");
    } finally {
      setResearchLoading(false);
    }
  }

  function updateMapping(mappingId: string, patch: Partial<BridgeFieldMapping>): void {
    setBridge((current) => ({ ...current, mappings: current.mappings.map((mapping) => mapping.id === mappingId ? { ...mapping, ...patch, updatedAt: new Date().toISOString() } : mapping) }));
  }

  function requestStage(mapping: BridgeFieldMapping, stage: BridgeMappingVerificationStage): void {
    try {
      const promoted = promoteMapping(mapping, stage, evidenceSessions, `Reviewed in Phase 5B mapping gate on ${new Date().toISOString()}.`);
      setBridge((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? promoted : item) }));
      setMappingMessage((current) => ({ ...current, [mapping.id]: `${stage} accepted.` }));
    } catch (caught) {
      setMappingMessage((current) => ({ ...current, [mapping.id]: caught instanceof Error ? caught.message : "Stage change was blocked." }));
    }
  }

  function createExportAudit(): void {
    if (!selectedShow) return;
    const audit = buildGuardedExportAudit(selectedShow, bridge.mappings, evidenceSessions, sourceFile?.name ?? "", sourceCopyConfirmed);
    setBridge((current) => ({ ...current, exportAudits: [audit, ...(current.exportAudits ?? [])].slice(0, 30) }));
    setNotice(audit.status === "Blocked" ? `Export blocked: ${audit.blockers[0] ?? "Safety gates are incomplete."}` : "Card is eligible pending a verified Access writer.");
  }

  async function runValidation(file: File): Promise<void> {
    if (!selectedShow || !latestAudit) return;
    setValidationLoading(true);
    try {
      const snapshot = await readTewSnapshot(file);
      const validation = validateRoundTrip(selectedShow, snapshot);
      const updated: GuardedExportAudit = { ...latestAudit, roundTripValidation: validation, status: validation.status === "Passed" ? "Validation Passed" : "Validation Failed" };
      setBridge((current) => ({ ...current, exportAudits: (current.exportAudits ?? []).map((audit) => audit.id === latestAudit.id ? updated : audit) }));
      setNotice(`Round-trip validation ${validation.status.toLowerCase()}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Round-trip validation failed.");
    } finally {
      setValidationLoading(false);
    }
  }

  const completedSegments = record?.segmentProgress.filter((segment) => segment.completed).length ?? 0;

  return <section className="transfer-workspace">
    <header className="transfer-hero"><div><p className="eyebrow">PHASE 5B · GUARDED TEW TRANSFER</p><h2>Translate the tracker card into TEW entry order, then prove mappings before any database writer exists</h2><p>Match approaches, Match Stories, and Angle Outputs remain your companion layer. TEW remains the full game and the authority for actual results.</p></div><div className="transfer-safety-card"><span>Database writing</span><strong>Blocked</strong><small>Read-only parser; no verified Access writer.</small></div></header>

    <nav className="transfer-tabs" aria-label="Guarded TEW transfer sections"><button type="button" className={view === "entry" ? "active" : ""} onClick={() => setView("entry")}>Assisted Transfer</button><button type="button" className={view === "raw-evidence" ? "active" : ""} onClick={() => setView("raw-evidence")}>Raw Evidence</button><button type="button" className={view === "mapping-gates" ? "active" : ""} onClick={() => setView("mapping-gates")}>Mapping Gates</button><button type="button" className={view === "exporter" ? "active" : ""} onClick={() => setView("exporter")}>Guarded Exporter</button></nav>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    {view !== "raw-evidence" && view !== "mapping-gates" && <section className="transfer-show-picker"><label className="field"><span>Planned show</span><select aria-label="Transfer planned show" value={selectedShow?.id ?? ""} onChange={(event) => setSelectedShowId(event.target.value)} disabled={shows.length === 0}><option value="">{shows.length ? "Select a show" : "No planned shows"}</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.segments.length} segments</option>)}</select></label>{selectedShow && <button className="secondary-button" type="button" onClick={() => onOpenShow(selectedShow.id, selectedShow.segments[0]?.id ?? "")}>Open Planned Show</button>}</section>}

    {view === "entry" && <section className="transfer-panel">
      <header><div><p className="eyebrow">EXACT TEW ENTRY ORDER</p><h3>{selectedShow?.name ?? "Create a planned show first"}</h3><p>Generate a package after the card changes. Progress is saved separately from the creative plan.</p></div><div className="transfer-actions"><button className="primary-button" type="button" onClick={generatePackage} disabled={!selectedShow || selectedShow.segments.length === 0}>{pkg ? "Regenerate Package" : "Generate Transfer Package"}</button><button className="secondary-button" type="button" onClick={() => exportTransfer("text")} disabled={!pkg}>Export Text</button><button className="secondary-button" type="button" onClick={() => exportTransfer("json")} disabled={!pkg}>Export JSON</button></div></header>
      {!pkg ? <div className="empty-state"><h3>No transfer package yet</h3><p>Build the card, approaches, Match Stories, and Angle Outputs first.</p></div> : <>
        <section className="transfer-score-strip"><div><span>Segments</span><strong>{pkg.segments.length}</strong></div><div><span>Entered</span><strong>{completedSegments}</strong></div><div><span>Warnings</span><strong>{pkg.warnings.length}</strong></div><div><span>Writing</span><strong>Disabled</strong></div></section>
        <section className="transfer-event-fields"><header><h3>1. Event Information</h3></header>{pkg.eventFields.map((field) => { const key = `event:${field.key}`; return <TransferFieldRow key={key} field={field} progress={progressFor(record?.eventProgress ?? [], key)} onCopy={() => void copyTransferField(field, key)} onStatus={(status) => updateEventStatus(key, status)} />; })}</section>
        {currentSegment && <section className="transfer-segment-card"><header><div><span>{currentSegment.section} · {currentSegment.type.toUpperCase()}</span><h3>{currentSegment.order + 1}. {currentSegment.title}</h3><small>Segment {currentIndex + 1} of {pkg.segments.length} · Alt + Left/Right changes segments</small></div><div><button className="secondary-button" type="button" disabled={currentIndex === 0} onClick={() => setCurrentSegment(currentIndex - 1)}>Previous</button><button className="secondary-button" type="button" disabled={currentIndex >= pkg.segments.length - 1} onClick={() => setCurrentSegment(currentIndex + 1)}>Next</button></div></header>
          <div className="transfer-segment-actions"><button className="secondary-button" type="button" onClick={() => void copyCompleteSegment()}>Copy Complete Segment</button><button className="primary-button" type="button" onClick={markCurrentSegmentComplete}>Mark Segment Entered</button></div>
          {[...currentSegment.directFields, ...currentSegment.tewNotes, ...currentSegment.companionOnly].map((field) => { const key = `${currentSegment.segmentId}:${field.destination}:${field.key}`; return <TransferFieldRow key={key} field={field} progress={progressFor(currentSegmentProgress?.fields ?? [], key)} onCopy={() => void copyTransferField(field, key, true)} onStatus={(status) => updateSegmentStatus(key, status)} />; })}
        </section>}
      </>}
    </section>}

    {view === "raw-evidence" && <section className="transfer-panel">
      <header><div><p className="eyebrow">CONTROLLED READ-ONLY RESEARCH</p><h3>Compare raw rows only in deliberately selected candidate tables</h3><p>Create a small test card in TEW, save copies before and after entry, then research the changed tables.</p></div></header>
      <label className="field"><span>Structural comparison report</span><select aria-label="Raw evidence comparison report" value={selectedComparison?.id ?? ""} onChange={(event) => { setSelectedComparisonId(event.target.value); setSelectedTables([]); }}><option value="">No comparison reports</option>{bridge.comparisonReports.map((report) => <option key={report.id} value={report.id}>{report.beforeFileName} → {report.afterFileName}</option>)}</select></label>
      {selectedComparison && <div className="transfer-table-selector"><h4>Candidate tables</h4>{selectedComparison.candidateTables.length === 0 ? <p>No changed tables were identified.</p> : selectedComparison.candidateTables.map((tableName) => <label key={tableName}><input type="checkbox" checked={selectedTables.includes(tableName)} onChange={(event) => setSelectedTables((current) => event.target.checked ? [...current, tableName] : current.filter((name) => name !== tableName))} /><span>{tableName}</span><input aria-label={`${tableName} identity field`} placeholder="Identity field (optional)" value={identityFields[tableName] ?? ""} onChange={(event) => setIdentityFields((current) => ({ ...current, [tableName]: event.target.value }))} /></label>)}</div>}
      <div className="transfer-evidence-files"><EvidenceFileSlot label="Before test-card entry" file={beforeFile} onSelect={setBeforeFile} /><EvidenceFileSlot label="After test-card entry" file={afterFile} onSelect={setAfterFile} /></div>
      <label className="field transfer-row-limit"><span>Rows sampled per selected table</span><input aria-label="Research row limit" type="number" min={1} max={2000} value={rowLimit} onChange={(event) => setRowLimit(Math.max(1, Math.min(2000, Number(event.target.value) || 1)))} /></label>
      <button className="primary-button" type="button" disabled={!beforeFile || !afterFile || selectedTables.length === 0 || researchLoading} onClick={() => void createEvidenceSession()}>{researchLoading ? "Reading Selected Tables…" : "Create Raw Evidence Session"}</button>
      {latestEvidence && <section className="transfer-evidence-results"><header><div><span>{latestEvidence.beforeFileName} → {latestEvidence.afterFileName}</span><h3>{latestEvidence.conclusion}</h3></div><strong>{latestEvidence.tableEvidence.length} tables</strong></header>{latestEvidence.tableEvidence.map((table) => <article key={table.tableName}><div><strong>{table.tableName}</strong><span>Identity: {table.identityField || "Exact row signature"}</span></div><dl><div><dt>Inserted</dt><dd>{table.insertedCount}</dd></div><div><dt>Changed</dt><dd>{table.changedCount}</dd></div><div><dt>Removed</dt><dd>{table.removedCount}</dd></div></dl><p>{table.notes}</p>{table.rowChanges.slice(0, 5).map((row, index) => <details key={`${row.identityValue}-${index}`}><summary>{row.changeType} · {row.identityValue}</summary>{row.fieldChanges.map((field) => <p key={field.field}><b>{field.field}</b>: {field.beforeValue || "—"} → {field.afterValue || "—"}</p>)}</details>)}</article>)}</section>}
    </section>}

    {view === "mapping-gates" && <section className="transfer-panel">
      <header><div><p className="eyebrow">EVIDENCE-GATED MAPPINGS</p><h3>Candidate → Corroborated → Verified → Export Eligible</h3><p>Export eligibility requires repeated evidence, an identity field, High confidence, value-format notes, and required-default documentation.</p></div></header>
      <div className="transfer-mapping-list">{bridge.mappings.map((mapping) => { const stage = verificationStage(mapping); const gate = mappingStageGate(mapping, "Export Eligible", evidenceSessions); return <article key={mapping.id} className="transfer-mapping-card"><header><div><span>{mapping.category}</span><strong>{mapping.trackerLabel}</strong><small>{mapping.trackerField}</small></div><b className={`transfer-stage transfer-stage--${statusClass(stage)}`}>{stage}</b></header><div className="transfer-mapping-grid"><label className="field"><span>TEW table</span><input aria-label={`${mapping.trackerLabel} guarded table`} value={mapping.tewTable} onChange={(event) => updateMapping(mapping.id, { tewTable: event.target.value })} /></label><label className="field"><span>TEW field</span><input aria-label={`${mapping.trackerLabel} guarded field`} value={mapping.tewField} onChange={(event) => updateMapping(mapping.id, { tewField: event.target.value })} /></label><label className="field"><span>Identity field</span><input value={mapping.identityField ?? ""} onChange={(event) => updateMapping(mapping.id, { identityField: event.target.value })} /></label><label className="field"><span>Confidence</span><select value={mapping.confidence} onChange={(event) => updateMapping(mapping.id, { confidence: event.target.value as BridgeFieldMapping["confidence"] })}><option>Low</option><option>Medium</option><option>High</option></select></label><label className="field field--full"><span>TEW value format</span><textarea rows={2} value={mapping.formatNotes ?? ""} onChange={(event) => updateMapping(mapping.id, { formatNotes: event.target.value })} /></label><label className="field field--full"><span>Required defaults</span><textarea rows={2} value={mapping.requiredDefaults ?? ""} onChange={(event) => updateMapping(mapping.id, { requiredDefaults: event.target.value })} /></label></div><fieldset><legend>Linked raw evidence</legend>{evidenceSessions.length === 0 ? <p>No raw evidence sessions exist.</p> : evidenceSessions.map((session) => <label key={session.id}><input type="checkbox" checked={(mapping.evidenceSessionIds ?? []).includes(session.id)} onChange={(event) => updateMapping(mapping.id, { evidenceSessionIds: event.target.checked ? [...(mapping.evidenceSessionIds ?? []), session.id] : (mapping.evidenceSessionIds ?? []).filter((id) => id !== session.id) })} /><span>{session.beforeFileName} → {session.afterFileName}</span></label>)}</fieldset><div className="transfer-stage-actions">{(["Candidate", "Corroborated", "Verified", "Export Eligible", "Unsupported"] as BridgeMappingVerificationStage[]).map((target) => <button key={target} className="secondary-button" type="button" onClick={() => requestStage(mapping, target)}>{target}</button>)}</div><p className={gate.allowed ? "transfer-gate-pass" : "transfer-gate-block"}>{mappingMessage[mapping.id] || (gate.allowed ? "Export eligibility gates currently pass." : gate.reasons.join(" "))}</p></article>; })}</div>
    </section>}

    {view === "exporter" && <section className="transfer-panel">
      <header><div><p className="eyebrow">GUARDED COPIED-DATABASE EXPORTER PROTOTYPE</p><h3>{selectedShow?.name ?? "No planned show"}</h3><p>The prototype creates a complete audit and dry run. It must stop because the installed Access parser cannot write verified output files.</p></div><div className="transfer-safety-card"><span>Writer available</span><strong>No</strong><small>Blocked by design</small></div></header>
      <EvidenceFileSlot label="Disposable source database copy" file={sourceFile} onSelect={setSourceFile} />
      <label className="transfer-confirm"><input aria-label="Confirm disposable TEW source copy" type="checkbox" checked={sourceCopyConfirmed} onChange={(event) => setSourceCopyConfirmed(event.target.checked)} /><span>I confirm this is a disposable copy, not the only live TEW save.</span></label>
      <button className="primary-button" type="button" disabled={!selectedShow} onClick={createExportAudit}>Generate Guarded Export Audit</button>
      {latestAudit && <section className="transfer-export-audit"><header><div><span>{latestAudit.status}</span><h3>{latestAudit.proposedOutputFileName}</h3></div><button className="secondary-button" type="button" onClick={() => download(`${safeName(latestAudit.showName)}-guarded-export-audit.json`, JSON.stringify(latestAudit, null, 2))}>Download Audit JSON</button></header><div className="transfer-gate-list">{latestAudit.gates.map((item) => <article key={item.id} className={item.passed ? "passed" : "blocked"}><strong>{item.passed ? "PASS" : "BLOCK"}</strong><div><b>{item.label}</b><span>{item.detail}</span></div></article>)}</div><p className="bridge-safety-note">No source file was modified and no database output was produced.</p><label className="transfer-validation-file"><span>Validate an externally produced output copy</span><input type="file" accept=".mdb,.accdb,application/x-msaccess" disabled={validationLoading} onChange={(event) => { const file = event.target.files?.item(0); if (file) void runValidation(file); event.currentTarget.value = ""; }} /></label>{latestAudit.roundTripValidation.status !== "Not Run" && <div className={`transfer-validation-result transfer-validation-result--${latestAudit.roundTripValidation.status.toLowerCase()}`}><strong>Round-trip validation: {latestAudit.roundTripValidation.status}</strong>{latestAudit.roundTripValidation.checks.map((check) => <p key={check.id}>{check.passed ? "PASS" : "FAIL"} · {check.label} — {check.detail}</p>)}</div>}</section>}
    </section>}
  </section>;
}
