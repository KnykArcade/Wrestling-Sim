import { useEffect, useMemo, useRef, useState } from "react";
import { calculateProfileStaminaRating, createMatchEngineProfile, profileStaminaCapacity } from "../matchEngine/model";
import { MATCH_ENGINE_SKILLS, WRESTLER_STYLES } from "../matchEngine/profileCatalog";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineProfile, WrestlerSkill, WrestlerStyleId } from "../matchEngine/types";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import { loadWorkbenchUniverse, saveWorkbenchUniverse } from "../workbench/storage";
import type { WorkbenchUniverse } from "../workbench/types";
import {
  PROFILE_CORE_FIELDS,
  PROFILE_IMPORT_FIELDS,
  applyImportRows,
  autoMapHeaders,
  blankProfileTemplateCsv,
  buildImportRows,
  bulkAssignStyle,
  confirmProfileIdentity,
  createMappingPreset,
  createProfileLibraryRecord,
  invalidatePlansForProfiles,
  profileLibraryCsv,
  rollbackImportSession,
  setManualProfileField,
  synchronizeProfileLibrary,
} from "./model";
import { loadProfileLibraryUniverse, saveProfileLibraryUniverse } from "./storage";
import type {
  ImportConflictDecision,
  ProfileFieldKey,
  ProfileImportRow,
  ProfileLibraryRecord,
  ProfileLibraryUniverse,
  ProfileValueSource,
  WorkbookData,
} from "./types";
import { readProfileWorkbook } from "./workbook";

type Tab = "profiles" | "import" | "sessions";

const sourceOptions: Array<"All" | ProfileValueSource> = [
  "All",
  "Imported from workbook",
  "Imported from TEW",
  "Mapped from TEW",
  "Derived",
  "Manual override",
  "Missing",
  "Baseline placeholder",
];

const decisions: ImportConflictDecision[] = [
  "Keep existing profile",
  "Replace imported fields",
  "Merge missing fields",
  "Preserve manual overrides",
  "Create separate profile",
  "Skip row",
];

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function downloadText(fileName: string, text: string, type = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function workerSourceLabel(profile: MatchEngineProfile): string {
  return profile.workerSource === "tew" ? `TEW ID ${profile.workerId}` : "Manual profile";
}

function readinessClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function invalidateQuickSegments(universe: WorkbenchUniverse, workerKeys: string[]): WorkbenchUniverse {
  const changed = new Set(workerKeys);
  const timestamp = new Date().toISOString();
  return {
    ...universe,
    quickSegments: universe.quickSegments.map((record) => record.segment.matchApproachSetup.workerPlans.some((plan) => changed.has(plan.workerKey))
      ? {
          ...record,
          updatedAt: timestamp,
          segment: {
            ...record.segment,
            matchApproachSetup: { ...record.segment.matchApproachSetup, performancePreview: null, updatedAt: timestamp },
          },
        }
      : record),
  };
}

function profileValue(profile: MatchEngineProfile, field: ProfileFieldKey): string | number {
  if (MATCH_ENGINE_SKILLS.includes(field as WrestlerSkill)) return profile.skills[field as WrestlerSkill];
  if (field === "styleId") return profile.styleId;
  if (field === "name") return profile.workerName;
  if (field === "tewWorkerId") return profile.workerSource === "tew" ? profile.workerId : "";
  if (field === "overall" || field === "health" || field === "popularity" || field === "experience" || field === "fanReaction" || field === "gimmick") return profile[field];
  return "";
}

export default function ProfileLibraryWorkspace({ snapshot }: { snapshot: TewSnapshot | null }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<Tab>("profiles");
  const [profiles, setProfiles] = useState<MatchEngineProfile[]>(() => loadMatchEngineUniverse(window.localStorage).profiles);
  const [library, setLibrary] = useState<ProfileLibraryUniverse>(() => synchronizeProfileLibrary(loadMatchEngineUniverse(window.localStorage), loadProfileLibraryUniverse(window.localStorage), snapshot));
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [workbench, setWorkbench] = useState<WorkbenchUniverse>(() => loadWorkbenchUniverse(window.localStorage));
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkStyle, setBulkStyle] = useState<WrestlerStyleId>("all-rounder");
  const [notice, setNotice] = useState("");
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [columnMap, setColumnMap] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [previewRows, setPreviewRows] = useState<ProfileImportRow[]>([]);
  const [presetName, setPresetName] = useState("");
  const [loadingWorkbook, setLoadingWorkbook] = useState(false);

  const profileUniverse = useMemo(() => ({ profiles }), [profiles]);
  const synchronized = useMemo(() => synchronizeProfileLibrary(profileUniverse, library, snapshot), [profileUniverse, snapshot]);
  const recordMap = useMemo(() => new Map(synchronized.records.map((record) => [record.workerKey, record])), [synchronized.records]);
  const selectedRecord = recordMap.get(synchronized.settings.selectedProfileKey) ?? synchronized.records[0] ?? null;
  const selectedProfile = profiles.find((profile) => profile.workerKey === selectedRecord?.workerKey) ?? null;

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    const record = recordMap.get(profile.workerKey);
    if (!record) return false;
    const query = synchronized.settings.searchQuery.trim().toLowerCase();
    if (query && !profile.workerName.toLowerCase().includes(query) && !profile.workerId.toLowerCase().includes(query)) return false;
    if (synchronized.settings.readinessFilter !== "All" && record.readiness !== synchronized.settings.readinessFilter) return false;
    if (synchronized.settings.linkFilter !== "All" && record.identity.status !== synchronized.settings.linkFilter) return false;
    if (synchronized.settings.sourceFilter !== "All" && !Object.values(record.provenance).some((item) => item?.source === synchronized.settings.sourceFilter)) return false;
    return true;
  }), [profiles, recordMap, synchronized.settings]);

  const currentSheet = workbook?.sheets.find((sheet) => sheet.name === sheetName) ?? workbook?.sheets[0] ?? null;
  const headers = currentSheet?.rows[Math.max(0, headerRow - 1)] ?? [];
  const readyCount = synchronized.records.filter((record) => record.readiness === "Ready").length;
  const warningCount = synchronized.records.filter((record) => record.readiness === "Usable with warnings").length;
  const incompleteCount = synchronized.records.filter((record) => record.readiness === "Incomplete").length;

  useEffect(() => {
    const next = synchronizeProfileLibrary({ profiles }, library, snapshot);
    if (JSON.stringify(next) !== JSON.stringify(library)) setLibrary(next);
  }, [profiles, snapshot]);

  useEffect(() => saveMatchEngineUniverse(window.localStorage, { profiles }), [profiles]);
  useEffect(() => saveProfileLibraryUniverse(window.localStorage, library), [library]);
  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveWorkbenchUniverse(window.localStorage, workbench), [workbench]);

  function updateSettings(patch: Partial<ProfileLibraryUniverse["settings"]>): void {
    setLibrary((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function selectProfile(workerKey: string): void {
    updateSettings({ selectedProfileKey: workerKey });
  }

  function createManualProfile(): void {
    const index = profiles.length + 1;
    const profile = createMatchEngineProfile({ id: `manual-profile-${Date.now()}`, name: `New Wrestler ${index}`, source: "manual" });
    const record = createProfileLibraryRecord(profile, snapshot);
    setProfiles((current) => [...current, profile]);
    setLibrary((current) => ({ ...current, records: [...current.records, record], settings: { ...current.settings, selectedProfileKey: profile.workerKey } }));
    setNotice("Manual profile created with visible baseline placeholders. Replace or import the ratings before treating it as complete.");
  }

  function editField(field: ProfileFieldKey, value: string | number): void {
    if (!selectedProfile || !selectedRecord) return;
    const result = setManualProfileField(selectedProfile, selectedRecord, field, value);
    setProfiles((current) => current.map((profile) => profile.workerKey === selectedProfile.workerKey ? result.profile : profile));
    setLibrary((current) => ({ ...current, records: current.records.map((record) => record.workerKey === selectedRecord.workerKey ? result.record : record) }));
    setShows((current) => invalidatePlansForProfiles(current, [selectedProfile.workerKey]));
    setWorkbench((current) => invalidateQuickSegments(current, [selectedProfile.workerKey]));
  }

  function confirmSuggestedIdentity(workerId: string): void {
    if (!selectedRecord || !selectedProfile || !snapshot) return;
    const worker = snapshot.workers.find((item) => item.id === workerId);
    if (!worker) return;
    const updatedRecord = confirmProfileIdentity(selectedRecord, worker.id, worker.name);
    const updatedProfile: MatchEngineProfile = {
      ...selectedProfile,
      workerSource: "tew",
      workerId: worker.id,
      workerName: worker.name,
      workerKey: `tew:${worker.id}`,
      updatedAt: new Date().toISOString(),
    };
    setProfiles((current) => current.map((profile) => profile.workerKey === selectedProfile.workerKey ? updatedProfile : profile));
    setLibrary((current) => ({ ...current, records: current.records.map((record) => record.workerKey === selectedRecord.workerKey ? { ...updatedRecord, workerKey: updatedProfile.workerKey, workerId: worker.id, workerName: worker.name } : record), settings: { ...current.settings, selectedProfileKey: updatedProfile.workerKey } }));
    setNotice(`${worker.name} is now confirmed against TEW worker ID ${worker.id}.`);
  }

  function toggleSelected(workerKey: string, checked: boolean): void {
    setSelectedKeys((current) => checked ? [...new Set([...current, workerKey])] : current.filter((key) => key !== workerKey));
  }

  function applyBulkStyle(): void {
    if (!selectedKeys.length) return;
    const result = bulkAssignStyle(profiles, synchronized.records, selectedKeys, bulkStyle);
    setProfiles(result.profiles);
    setLibrary((current) => ({ ...current, records: result.records }));
    setShows((current) => invalidatePlansForProfiles(current, selectedKeys));
    setWorkbench((current) => invalidateQuickSegments(current, selectedKeys));
    setNotice(`${selectedKeys.length} profile${selectedKeys.length === 1 ? "" : "s"} assigned to ${WRESTLER_STYLES.find((style) => style.id === bulkStyle)?.name}. Existing performance previews were invalidated.`);
  }

  function deleteSelectedManualProfiles(): void {
    const deletable = profiles.filter((profile) => selectedKeys.includes(profile.workerKey) && profile.workerSource === "manual");
    if (!deletable.length) { setNotice("Only selected manual profiles can be removed through this bulk action."); return; }
    if (!window.confirm(`Delete ${deletable.length} selected manual profile${deletable.length === 1 ? "" : "s"}? Planned segments are not deleted.`)) return;
    const keys = new Set(deletable.map((profile) => profile.workerKey));
    setProfiles((current) => current.filter((profile) => !keys.has(profile.workerKey)));
    setLibrary((current) => ({ ...current, records: current.records.filter((record) => !keys.has(record.workerKey)), settings: { ...current.settings, selectedProfileKey: "" } }));
    setSelectedKeys([]);
    setNotice(`${deletable.length} manual profile${deletable.length === 1 ? "" : "s"} removed.`);
  }

  async function handleFile(file: File): Promise<void> {
    setLoadingWorkbook(true);
    setNotice("");
    try {
      const parsed = await readProfileWorkbook(file);
      const sheet = parsed.sheets[0];
      const map = autoMapHeaders(sheet?.rows[0] ?? []);
      setWorkbook(parsed);
      setSheetName(sheet?.name ?? "");
      setHeaderRow(1);
      setColumnMap(map);
      setPreviewRows([]);
      setPresetName(`${file.name} mapping`);
      setNotice(`${parsed.sheets.length} worksheet${parsed.sheets.length === 1 ? "" : "s"} loaded read-only. Macros were not executed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The ratings file could not be read.");
    } finally {
      setLoadingWorkbook(false);
    }
  }

  function changeSheet(nextSheet: string): void {
    const sheet = workbook?.sheets.find((item) => item.name === nextSheet);
    setSheetName(nextSheet);
    setHeaderRow(1);
    setColumnMap(autoMapHeaders(sheet?.rows[0] ?? []));
    setPreviewRows([]);
  }

  function mapField(field: ProfileFieldKey, header: string): void {
    setColumnMap((current) => ({ ...current, [field]: header || undefined }));
    setPreviewRows([]);
  }

  function buildPreview(): void {
    if (!workbook || !sheetName) return;
    const rows = buildImportRows({ workbook, sheetName, headerRow, columnMap, profiles, snapshot });
    setPreviewRows(rows);
    setNotice(`${rows.length} profile row${rows.length === 1 ? "" : "s"} reviewed. Resolve conflicts and errors before importing.`);
  }

  function updateDecision(rowId: string, decision: ImportConflictDecision): void {
    setPreviewRows((current) => current.map((row) => row.id === rowId ? { ...row, decision } : row));
  }

  function savePreset(): string {
    if (!workbook) return "";
    const preset = createMappingPreset({ name: presetName, workbook, sheetName, headerRow, columnMap });
    setLibrary((current) => ({ ...current, mappingPresets: [preset, ...current.mappingPresets].slice(0, 20) }));
    setNotice(`${preset.name} saved for future imports.`);
    return preset.id;
  }

  function applyImport(): void {
    if (!workbook || previewRows.length === 0) return;
    const blocking = previewRows.filter((row) => row.status === "Error" && row.decision !== "Skip row");
    if (blocking.length) { setNotice(`${blocking.length} error row${blocking.length === 1 ? "" : "s"} must be skipped or corrected before import.`); return; }
    let presetId = library.mappingPresets.find((preset) => preset.name === presetName && preset.sheetName === sheetName)?.id ?? "";
    if (!presetId) presetId = savePreset();
    const result = applyImportRows({ workbook, sheetName, headerRow, mappingPresetId: presetId, rows: previewRows, profiles, library: synchronized, snapshot });
    setProfiles(result.profiles);
    setLibrary(result.library);
    setShows((current) => invalidatePlansForProfiles(current, result.invalidatedWorkerKeys));
    setWorkbench((current) => invalidateQuickSegments(current, result.invalidatedWorkerKeys));
    setPreviewRows(result.session.rows);
    setTab("sessions");
    setNotice(`${result.session.rowsAccepted} rows accepted: ${result.session.profilesCreated} profiles created and ${result.session.profilesUpdated} updated. A rollback snapshot was saved.`);
  }

  function rollback(sessionId: string): void {
    if (!window.confirm("Roll back this entire ratings import session? Later manual edits to affected profiles may be replaced by the saved pre-import snapshot.")) return;
    const result = rollbackImportSession(library, profiles, sessionId);
    setLibrary(result.library);
    setProfiles(result.profiles);
    setNotice("The import session was rolled back to its saved pre-import profile state.");
  }

  function usePreset(presetId: string): void {
    const preset = library.mappingPresets.find((item) => item.id === presetId);
    if (!preset || !workbook) return;
    const sheet = workbook.sheets.some((item) => item.name === preset.sheetName) ? preset.sheetName : workbook.sheets[0]?.name ?? "";
    setSheetName(sheet);
    setHeaderRow(preset.headerRow);
    setColumnMap(preset.columnMap);
    setPresetName(preset.name);
    setPreviewRows([]);
  }

  return <section className="profile-library-workspace">
    <header className="profile-library-hero">
      <div><p className="eyebrow">PHASE 5E · ROSTER-READY COMPANION</p><h2>Wrestler Profile Library and Bulk Ratings Import</h2><p>Enter or import wrestler data once, preserve where every rating came from, and reuse the same confirmed profile in Quick Matches, planned shows, Match Stories, and TEW handoffs.</p></div>
      <div className="profile-library-safety"><span>TEW and workbooks</span><strong>Read-only</strong><small>Excel macros are never executed. TEW ratings are never modified.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="profile-library-score-strip">
      <div><span>Total profiles</span><strong>{profiles.length}</strong></div>
      <div><span>Ready</span><strong>{readyCount}</strong></div>
      <div><span>Usable with warnings</span><strong>{warningCount}</strong></div>
      <div><span>Incomplete</span><strong>{incompleteCount}</strong></div>
      <div><span>Confirmed TEW links</span><strong>{synchronized.records.filter((record) => record.identity.status === "Confirmed").length}</strong></div>
    </section>

    <nav className="profile-library-tabs" aria-label="Wrestler Profile Library sections">
      <button type="button" className={tab === "profiles" ? "active" : ""} onClick={() => setTab("profiles")}>Profile Library</button>
      <button type="button" className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>Bulk Ratings Import</button>
      <button type="button" className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>Import Sessions</button>
    </nav>

    {tab === "profiles" && <>
      <section className="profile-library-toolbar">
        <label className="field"><span>Search profiles</span><input aria-label="Search wrestler profiles" value={synchronized.settings.searchQuery} onChange={(event) => updateSettings({ searchQuery: event.target.value })} placeholder="Name or TEW worker ID" /></label>
        <label className="field"><span>Readiness</span><select aria-label="Profile readiness filter" value={synchronized.settings.readinessFilter} onChange={(event) => updateSettings({ readinessFilter: event.target.value as ProfileLibraryUniverse["settings"]["readinessFilter"] })}><option>All</option><option>Ready</option><option>Usable with warnings</option><option>Incomplete</option></select></label>
        <label className="field"><span>TEW link</span><select aria-label="Profile link filter" value={synchronized.settings.linkFilter} onChange={(event) => updateSettings({ linkFilter: event.target.value as ProfileLibraryUniverse["settings"]["linkFilter"] })}><option>All</option><option>Confirmed</option><option>Suggested</option><option>Ambiguous</option><option>Manual</option><option>Missing TEW worker</option></select></label>
        <label className="field"><span>Rating source</span><select aria-label="Profile source filter" value={synchronized.settings.sourceFilter} onChange={(event) => updateSettings({ sourceFilter: event.target.value as ProfileLibraryUniverse["settings"]["sourceFilter"] })}>{sourceOptions.map((source) => <option key={source}>{source}</option>)}</select></label>
        <button className="primary-button" type="button" onClick={createManualProfile}>Create Manual Profile</button>
      </section>

      <section className="profile-library-bulkbar">
        <span>{selectedKeys.length} selected</span>
        <select aria-label="Bulk wrestler style" value={bulkStyle} onChange={(event) => setBulkStyle(event.target.value as WrestlerStyleId)}>{WRESTLER_STYLES.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
        <button className="secondary-button" type="button" disabled={!selectedKeys.length} onClick={applyBulkStyle}>Assign Style</button>
        <button className="secondary-button" type="button" disabled={!selectedKeys.length} onClick={deleteSelectedManualProfiles}>Delete Selected Manual Profiles</button>
        <button className="secondary-button" type="button" onClick={() => downloadText("wrestler-profile-library.csv", profileLibraryCsv(profiles, synchronized.records), "text/csv;charset=utf-8")}>Export CSV</button>
        <button className="secondary-button" type="button" onClick={() => downloadText("wrestler-profile-library.json", JSON.stringify({ profiles, profileLibrary: synchronized }, null, 2), "application/json")}>Export JSON</button>
        <button className="secondary-button" type="button" onClick={() => downloadText("wrestler-profile-import-template.csv", blankProfileTemplateCsv(), "text/csv;charset=utf-8")}>Blank Import Template</button>
      </section>

      <div className="profile-library-layout">
        <aside className="profile-library-list" aria-label="Wrestler profiles">
          <div className="profile-library-list-heading"><span>Profiles</span><strong>{filteredProfiles.length}</strong></div>
          {filteredProfiles.map((profile) => {
            const record = recordMap.get(profile.workerKey)!;
            return <article key={profile.workerKey} className={selectedRecord?.workerKey === profile.workerKey ? "active" : ""}>
              <label><input type="checkbox" checked={selectedKeys.includes(profile.workerKey)} onChange={(event) => toggleSelected(profile.workerKey, event.target.checked)} aria-label={`Select ${profile.workerName}`} /></label>
              <button type="button" onClick={() => selectProfile(profile.workerKey)}>
                <strong>{profile.workerName}</strong>
                <span>{workerSourceLabel(profile)}</span>
                <small className={`profile-readiness profile-readiness--${readinessClass(record.readiness)}`}>{record.readiness} · {record.completenessPercent}%</small>
                <small>{record.identity.status} TEW link</small>
              </button>
            </article>;
          })}
          {filteredProfiles.length === 0 && <div className="empty-state compact">No profiles match the selected filters.</div>}
        </aside>

        {!selectedProfile || !selectedRecord ? <section className="empty-state profile-library-empty"><h3>Select or create a wrestler profile</h3><p>The library will show rating values, provenance, stamina, TEW identity, and readiness.</p></section> : <section className="profile-library-detail">
          <header className="profile-library-detail-header"><div><p className="eyebrow">CENTRAL MATCH-APPROACH PROFILE</p><input aria-label="Profile wrestler name" value={selectedProfile.workerName} onChange={(event) => editField("name", event.target.value)} /><span>{workerSourceLabel(selectedProfile)} · Updated {formatDate(selectedRecord.updatedAt)}</span></div><div className={`profile-readiness-card profile-readiness-card--${readinessClass(selectedRecord.readiness)}`}><span>Profile readiness</span><strong>{selectedRecord.readiness}</strong><small>{selectedRecord.completenessPercent}% required fields verified</small></div></header>

          <section className="profile-library-metrics"><div><span>Overall</span><strong>{selectedProfile.overall}</strong></div><div><span>Stamina rating</span><strong>{calculateProfileStaminaRating(selectedProfile).toFixed(1)}</strong></div><div><span>Approach capacity</span><strong>{profileStaminaCapacity(selectedProfile)}</strong></div><div><span>Style</span><strong>{WRESTLER_STYLES.find((style) => style.id === selectedProfile.styleId)?.name}</strong></div></section>

          <section className="profile-library-identity">
            <header><div><p className="eyebrow">TEW IDENTITY LINK</p><h3>{selectedRecord.identity.status}</h3></div><span>{selectedRecord.identity.method}</span></header>
            <p>{selectedRecord.identity.tewWorkerId ? `TEW worker ${selectedRecord.identity.tewWorkerName || selectedProfile.workerName} · ID ${selectedRecord.identity.tewWorkerId}` : "No confirmed TEW worker ID is attached to this profile."}</p>
            {snapshot && selectedRecord.identity.status !== "Confirmed" && <label className="field"><span>Confirm TEW worker</span><select aria-label="Confirm TEW worker identity" defaultValue="" onChange={(event) => { if (event.target.value) confirmSuggestedIdentity(event.target.value); event.currentTarget.value = ""; }}><option value="">Choose a worker</option>{snapshot.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {worker.id}</option>)}</select></label>}
          </section>

          <section className="profile-library-core-fields">
            <label className="field"><span>Wrestler style</span><select aria-label="Library wrestler style" value={selectedProfile.styleId} onChange={(event) => editField("styleId", event.target.value)}>{WRESTLER_STYLES.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select><small>{selectedRecord.provenance.styleId?.source}</small></label>
            {PROFILE_CORE_FIELDS.map((field) => <label className="field" key={field}><span>{field.replace(/([A-Z])/g, " $1")}</span><input aria-label={`Library ${field}`} type="number" min={field === "fanReaction" || field === "gimmick" ? 1 : 0} max={field === "fanReaction" || field === "gimmick" ? 5 : 100} value={profileValue(selectedProfile, field)} onChange={(event) => editField(field, Number(event.target.value))} /><small>{selectedRecord.provenance[field]?.source ?? "Missing"}</small></label>)}
          </section>

          <section className="profile-library-skill-panel"><header><div><p className="eyebrow">18 MATCH-APPROACH SKILLS</p><h3>Ratings and field-level provenance</h3></div><span>{selectedRecord.missingRequiredFields.length} required fields still missing or placeholder</span></header><div className="profile-library-skill-grid">{MATCH_ENGINE_SKILLS.map((skill) => <label className={`field ${selectedRecord.missingRequiredFields.includes(skill) ? "needs-data" : ""}`} key={skill}><span>{skill}</span><input aria-label={`Library ${skill} rating`} type="number" min={0} max={100} value={selectedProfile.skills[skill]} onChange={(event) => editField(skill, Number(event.target.value))} /><small>{selectedRecord.provenance[skill]?.source ?? "Missing"}</small></label>)}</div></section>

          <section className="profile-library-provenance"><header><div><p className="eyebrow">PROFILE QUALITY REPORT</p><h3>{selectedRecord.readiness}</h3></div></header>{selectedRecord.missingRequiredFields.length > 0 && <p><strong>Missing or placeholder required fields:</strong> {selectedRecord.missingRequiredFields.join(", ")}</p>}{selectedRecord.warningFields.length > 0 && <p><strong>Secondary warnings:</strong> {selectedRecord.warningFields.join(", ")}</p>}<p>Approach AI can still run with placeholders, but the workbench must not present those recommendations as fully roster-verified.</p></section>
        </section>}
      </div>
    </>}

    {tab === "import" && <section className="profile-import-workspace">
      <header className="profile-import-header"><div><p className="eyebrow">READ-ONLY RATINGS IMPORT</p><h3>Excel, CSV, or tracker JSON</h3><p>Select a file, map its columns, preview every row, and resolve conflicts before changing the central profile library.</p></div><button className="primary-button" type="button" onClick={() => fileRef.current?.click()} disabled={loadingWorkbook}>{loadingWorkbook ? "Reading File…" : "Select Ratings File"}</button><input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx,.xlsm,.csv,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void handleFile(file); event.currentTarget.value = ""; }} /></header>
      {!workbook ? <div className="empty-state"><h3>No ratings file selected</h3><p>Excel macros are not executed. The importer reads worksheet cell values only.</p></div> : <>
        <section className="profile-import-source"><div><span>Source file</span><strong>{workbook.fileName}</strong><small>{workbook.fileType.toUpperCase()} · {workbook.sheets.length} sheet{workbook.sheets.length === 1 ? "" : "s"}</small></div><label className="field"><span>Worksheet</span><select aria-label="Ratings import worksheet" value={sheetName} onChange={(event) => changeSheet(event.target.value)}>{workbook.sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label><label className="field"><span>Header row</span><input aria-label="Ratings import header row" type="number" min={1} max={Math.max(1, currentSheet?.rows.length ?? 1)} value={headerRow} onChange={(event) => { const value = Math.max(1, Number(event.target.value) || 1); setHeaderRow(value); setColumnMap(autoMapHeaders(currentSheet?.rows[value - 1] ?? [])); setPreviewRows([]); }} /></label><label className="field"><span>Saved mapping preset</span><select aria-label="Ratings mapping preset" defaultValue="" onChange={(event) => { if (event.target.value) usePreset(event.target.value); event.currentTarget.value = ""; }}><option value="">Choose a preset</option>{library.mappingPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label></section>

        <section className="profile-import-mapping"><header><div><p className="eyebrow">COLUMN MAPPING</p><h3>Map workbook headers to profile fields</h3></div><button className="secondary-button" type="button" onClick={() => setColumnMap(autoMapHeaders(headers))}>Auto-Map Headers</button></header><div className="profile-import-mapping-grid">{PROFILE_IMPORT_FIELDS.map((field) => <label className="field" key={field}><span>{field}</span><select aria-label={`Map ${field}`} value={columnMap[field] ?? ""} onChange={(event) => mapField(field, event.target.value)}><option value="">Not mapped</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div><footer><label className="field"><span>Preset name</span><input aria-label="Mapping preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label><button className="secondary-button" type="button" onClick={savePreset}>Save Mapping Preset</button><button className="primary-button" type="button" disabled={!columnMap.name} onClick={buildPreview}>Review Import Rows</button></footer></section>

        {previewRows.length > 0 && <section className="profile-import-review"><header><div><p className="eyebrow">IMPORT REVIEW</p><h3>{previewRows.length} source rows</h3><p>Manual overrides are preserved by default when an existing profile is matched.</p></div><div><span>Ready {previewRows.filter((row) => row.status === "Ready").length}</span><span>Conflicts {previewRows.filter((row) => row.status === "Conflict").length}</span><span>Errors {previewRows.filter((row) => row.status === "Error").length}</span></div></header><div className="profile-import-row-list">{previewRows.map((row) => <article key={row.id} className={`profile-import-row profile-import-row--${row.status.toLowerCase()}`}><header><div><span>Row {row.rowNumber}</span><strong>{row.sourceName || "Unnamed wrestler"}</strong><small>{row.sourceTewWorkerId ? `TEW ID ${row.sourceTewWorkerId}` : "No source TEW ID"}</small></div><b>{row.status}</b></header>{row.messages.length > 0 && <ul>{row.messages.map((message) => <li key={message}>{message}</li>)}</ul>}<div className="profile-import-row-meta"><span>{row.matchedProfileKey ? `Existing profile: ${row.matchedProfileKey}` : "New profile"}</span><span>{Object.keys(row.values).length} mapped values</span></div><label className="field"><span>Conflict action</span><select aria-label={`Row ${row.rowNumber} import decision`} value={row.decision} onChange={(event) => updateDecision(row.id, event.target.value as ImportConflictDecision)}>{decisions.map((decision) => <option key={decision}>{decision}</option>)}</select></label></article>)}</div><footer><span>No profile changes occur until this explicit import action.</span><button className="primary-button" type="button" onClick={applyImport}>Apply Reviewed Import</button></footer></section>}
      </>}
    </section>}

    {tab === "sessions" && <section className="profile-import-sessions"><header><div><p className="eyebrow">PROFILE UPDATE SESSIONS</p><h3>Audit and rollback history</h3><p>Every accepted import retains its source, mapping, row decisions, profile counts, and pre-import profile snapshot.</p></div><span>{library.importSessions.length} sessions</span></header>{library.importSessions.length === 0 ? <div className="empty-state"><h3>No profile imports completed</h3><p>Completed imports will appear here with a full audit and rollback option.</p></div> : <div className="profile-import-session-list">{library.importSessions.map((session) => <article key={session.id}><header><div><strong>{session.fileName}</strong><span>{session.sheetName} · Header row {session.headerRow}</span><small>{formatDate(session.completedAt)}</small></div><b>{session.rolledBackAt ? "Rolled Back" : "Applied"}</b></header><section><div><span>Accepted</span><strong>{session.rowsAccepted}</strong></div><div><span>Skipped</span><strong>{session.rowsSkipped}</strong></div><div><span>Created</span><strong>{session.profilesCreated}</strong></div><div><span>Updated</span><strong>{session.profilesUpdated}</strong></div><div><span>Conflicts resolved</span><strong>{session.conflictsResolved}</strong></div></section><details><summary>Row-by-row import decisions</summary>{session.rows.map((row) => <p key={row.id}><strong>Row {row.rowNumber}: {row.sourceName || "Unnamed"}</strong> — {row.status} · {row.decision}{row.messages.length ? ` · ${row.messages.join("; ")}` : ""}</p>)}</details><footer><span>{session.rolledBackAt ? `Rolled back ${formatDate(session.rolledBackAt)}` : "Pre-import profile state available"}</span><button className="secondary-button" type="button" disabled={Boolean(session.rolledBackAt)} onClick={() => rollback(session.id)}>Roll Back Session</button></footer></article>)}</div>}</section>}
  </section>;
}
