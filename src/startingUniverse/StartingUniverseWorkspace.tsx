import { useEffect, useMemo, useRef, useState } from "react";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import { formulaLabel, IMPORTED_APPROACH_FORMULAS } from "./formulas";
import {
  addWorldWorkerToRoster,
  applyStartingRosterToMatchEngine,
  confirmStartingUniverse,
  createStartingUniverse,
  rebuildStartingUniverseReview,
  selectStartingUniverseCompany,
} from "./model";
import { readTewStartingUniverseFile } from "./parser";
import {
  activateStartingUniverse,
  browserStartingUniverseStore,
  exportStartingUniversePackage,
  importStartingUniversePackage,
  loadActiveStartingUniverse,
  loadStartingUniverseState,
  parseStartingUniversePackage,
  removeStartingUniverse,
  saveStartingUniverseRecord,
  saveStartingUniverseState,
} from "./storage";
import type {
  ImportedApproachFormulaId,
  StartingUniverseRecord,
  StartingUniverseReview,
  StartingUniverseReviewTab,
  StartingUniverseState,
  StartingUniverseTagTeamDecision,
} from "./types";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function topApproaches(ratings: Record<ImportedApproachFormulaId, number>): string {
  return Object.entries(ratings)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([id, value]) => `${IMPORTED_APPROACH_FORMULAS.find((formula) => formula.id === id)?.name ?? id} ${value.toFixed(1)}`)
    .join(" · ");
}

export default function StartingUniverseWorkspace({ onUniverseLoaded }: { onUniverseLoaded?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const packageInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<StartingUniverseState>(() => loadStartingUniverseState(window.localStorage));
  const [record, setRecord] = useState<StartingUniverseRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [rosterFilter, setRosterFilter] = useState("");
  const [worldSearch, setWorldSearch] = useState("");
  const [replaceExistingProfiles, setReplaceExistingProfiles] = useState(false);
  const [customReview, setCustomReview] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadActiveStartingUniverse(state).then((active) => {
      if (!alive) return;
      setRecord(active);
      setReady(true);
    }).catch((caught) => {
      if (!alive) return;
      setError(caught instanceof Error ? caught.message : "Starting Universe storage could not be opened.");
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => saveStartingUniverseState(window.localStorage, state), [state]);

  async function persist(nextRecord: StartingUniverseRecord, nextTab?: StartingUniverseReviewTab): Promise<void> {
    const nextState = await saveStartingUniverseRecord(nextRecord, nextTab ? { ...state, selectedTab: nextTab } : state);
    setRecord(nextRecord);
    setState(nextState);
  }

  async function importFile(file: File): Promise<void> {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const parsed = await readTewStartingUniverseFile(file);
      const nextRecord = createStartingUniverse(parsed);
      const nextState = await saveStartingUniverseRecord(nextRecord, { ...state, selectedTab: "company", lastImportedAt: new Date().toISOString() });
      setRecord(nextRecord);
      setState(nextState);
      setCustomReview(false);
      setNotice(`${nextRecord.companies.length} companies, ${nextRecord.workers.length} workers, and ${nextRecord.contracts.length} contracts were imported from ${file.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The TEW starting-universe export could not be imported.");
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  async function importPackage(file: File): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const packageValue = parseStartingUniversePackage(await file.text());
      const nextState = await importStartingUniversePackage(packageValue);
      const active = await loadActiveStartingUniverse(nextState);
      setState(nextState);
      setRecord(active);
      setNotice(`Restored ${packageValue.records.length} Starting Universe record${packageValue.records.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Starting Universe package could not be restored.");
    } finally {
      setLoading(false);
    }
  }

  async function exportPackage(): Promise<void> {
    const packageValue = await exportStartingUniversePackage(state);
    downloadJson(`wrestling-sim-starting-universe-${new Date().toISOString().slice(0, 10)}.json`, packageValue);
    setState((current) => ({ ...current, lastExportedAt: new Date().toISOString() }));
    setNotice(`Exported ${packageValue.records.length} Starting Universe record${packageValue.records.length === 1 ? "" : "s"}.`);
  }

  async function selectManifest(id: string): Promise<void> {
    const result = await activateStartingUniverse(id, state);
    setState(result.state);
    setRecord(result.record);
  }

  async function deleteUniverse(id: string): Promise<void> {
    const manifest = state.manifest.find((item) => item.id === id);
    if (!manifest || !window.confirm(`Remove ${manifest.name} from browser storage? Export a Starting Universe package first if it must be retained.`)) return;
    const nextState = await removeStartingUniverse(id, state);
    const active = await loadActiveStartingUniverse(nextState);
    setState(nextState);
    setRecord(active);
  }

  async function selectCompany(companyId: string): Promise<void> {
    if (!record) return;
    await persist(selectStartingUniverseCompany(record, companyId), "roster");
  }

  function withReview(patch: Partial<StartingUniverseReview>, refreshCompany = false): StartingUniverseRecord | null {
    if (!record) return null;
    const review = { ...record.review, ...patch };
    const next = rebuildStartingUniverseReview(record, review);
    return refreshCompany ? selectStartingUniverseCompany(next, next.playableCompanyId) : next;
  }

  async function updateRoster(workerId: string, patch: Partial<StartingUniverseReview["roster"][number]>): Promise<void> {
    const next = withReview({ roster: record!.review.roster.map((decision) => decision.workerId === workerId ? { ...decision, ...patch } : decision), rosterAcknowledged: false }, true);
    if (next) await persist(next);
  }

  async function addWorldWorker(workerId: string): Promise<void> {
    if (!record) return;
    await persist(addWorldWorkerToRoster(record, workerId));
    setWorldSearch("");
    setNotice("Imported world worker added to the starting-roster review. No source TEW contract was changed.");
  }

  async function updateTitle(titleId: string, patch: Partial<StartingUniverseReview["titles"][number]>): Promise<void> {
    const next = withReview({ titles: record!.review.titles.map((decision) => decision.titleId === titleId ? { ...decision, ...patch } : decision), titlesAcknowledged: false });
    if (next) await persist(next);
  }

  async function updateTvShow(tvShowId: string, patch: Partial<StartingUniverseReview["tvShows"][number]>): Promise<void> {
    const next = withReview({ tvShows: record!.review.tvShows.map((decision) => decision.tvShowId === tvShowId ? { ...decision, ...patch } : decision), titlesAcknowledged: false });
    if (next) await persist(next);
  }

  async function updateTeam(id: string, patch: Partial<StartingUniverseTagTeamDecision>): Promise<void> {
    if (!record) return;
    let nextPatch = patch;
    if (patch.selectedVariantId) {
      const variant = record.tagTeamVariants.find((item) => item.id === patch.selectedVariantId);
      if (variant) nextPatch = { ...patch, gameName: variant.name };
    }
    const next = withReview({ tagTeams: record.review.tagTeams.map((decision) => decision.id === id ? { ...decision, ...nextPatch } : decision), teamsAcknowledged: false });
    if (next) await persist(next);
  }

  async function updateStable(stableId: string, patch: Partial<StartingUniverseReview["stables"][number]>): Promise<void> {
    const next = withReview({ stables: record!.review.stables.map((decision) => decision.stableId === stableId ? { ...decision, ...patch } : decision), teamsAcknowledged: false });
    if (next) await persist(next);
  }

  async function acknowledge(area: "roster" | "titles" | "teams"): Promise<void> {
    if (!record) return;
    const patch = area === "roster" ? { rosterAcknowledged: true } : area === "titles" ? { titlesAcknowledged: true } : { teamsAcknowledged: true };
    const next = withReview(patch);
    if (next) await persist(next);
  }

  async function finalizeUniverse(): Promise<void> {
    if (!record) return;
    setError("");
    try {
      const confirmed = confirmStartingUniverse(record);
      const matchEngineResult = applyStartingRosterToMatchEngine(confirmed, loadMatchEngineUniverse(window.localStorage), replaceExistingProfiles);
      saveMatchEngineUniverse(window.localStorage, matchEngineResult.universe);
      await persist(confirmed, "confirm");
      setNotice(`Standalone starting universe confirmed. Match Engine profiles: ${matchEngineResult.created} created, ${matchEngineResult.updated} updated, ${matchEngineResult.preserved} existing customized profiles preserved.`);
      onUniverseLoaded?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The starting universe could not be confirmed.");
    }
  }

  const company = record?.companies.find((item) => item.id === record.playableCompanyId) ?? null;
  const workers = useMemo(() => new Map(record?.workers.map((worker) => [worker.id, worker]) ?? []), [record]);
  const contracts = useMemo(() => new Map(record?.contracts.map((contract) => [contract.id, contract]) ?? []), [record]);
  const roster = record?.review.roster.filter((decision) => normalize(workers.get(decision.workerId)?.name ?? "").includes(normalize(rosterFilter))) ?? [];
  const rosterIds = new Set(record?.review.roster.map((decision) => decision.workerId) ?? []);
  const worldCandidates = record?.workers.filter((worker) => !rosterIds.has(worker.id) && normalize(worker.name).includes(normalize(worldSearch))).slice(0, 30) ?? [];
  const blockingIssues = record?.review.issues.filter((issue) => issue.severity === "Blocking") ?? [];

  return <section className="starting-universe-workspace">
    <header className="starting-universe-hero">
      <div><p className="eyebrow">PHASE 6A · STANDALONE UNIVERSE</p><h2>Import a TEW world, review the starting roster, and begin your own Wrestling Sim game</h2><p>Choose the SQLite export or its matching ZIP of CSV tables. The source files remain read-only. The confirmed universe, roster decisions, and all sixteen Excel approach formulas become permanent Wrestling Sim data.</p></div>
      <div className="starting-universe-mode"><span>Outcome authority after Phase 6B</span><strong>Wrestling Sim</strong><small>TEW supplies the starting world. Your game will control future cards, suggested winners, ratings, and history.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
    {error && <div className="status-banner error" role="alert"><strong>Starting Universe action failed</strong><span>{error}</span></div>}

    <input ref={fileInputRef} className="visually-hidden" type="file" accept=".sqlite,.db,.zip,application/zip,application/x-sqlite3" onChange={(event) => { const file = event.target.files?.item(0); if (file) void importFile(file); event.currentTarget.value = ""; }} />
    <input ref={packageInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void importPackage(file); event.currentTarget.value = ""; }} />

    <section className="starting-universe-toolbar">
      <button className="primary-button" type="button" disabled={loading} onClick={() => fileInputRef.current?.click()}>{loading ? "Reading TEW Export…" : "Import TEW SQLite or ZIP"}</button>
      <button className="secondary-button" type="button" onClick={() => packageInputRef.current?.click()}>Restore Starting Universe Package</button>
      <button className="secondary-button" type="button" disabled={state.manifest.length === 0} onClick={() => void exportPackage()}>Export Starting Universe Package</button>
      {state.manifest.length > 0 && <label className="field"><span>Stored universe</span><select aria-label="Stored starting universe" value={state.activeUniverseId} onChange={(event) => void selectManifest(event.target.value)}>{state.manifest.map((manifest) => <option key={manifest.id} value={manifest.id}>{manifest.name} · {manifest.status}</option>)}</select></label>}
      {record && <button className="danger-button" type="button" onClick={() => void deleteUniverse(record.id)}>Remove Stored Universe</button>}
    </section>

    {!ready || loading ? <div className="empty-state starting-universe-empty"><h3>{loading ? "Reading the TEW export" : "Opening Starting Universe storage"}</h3><p>Large SQLite and CSV exports can take a moment to parse in the browser.</p></div> : !record ? <div className="starting-universe-import-card"><p className="eyebrow">START HERE</p><h3>Select one of the TEW files you supplied</h3><div><article><strong>SQLite export</strong><p>Direct structured import from the `.sqlite` file.</p></article><article><strong>ZIP of CSV tables</strong><p>Browser-friendly alternative containing the same exported tables.</p></article></div><p>Only one of the two matching files is needed. Neither file is modified.</p><button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}>Choose Starting Universe File</button></div> : <>
      <section className="starting-universe-summary" aria-label="Imported starting universe summary"><article><span>Companies</span><strong>{record.companies.length}</strong></article><article><span>Workers</span><strong>{record.workers.length}</strong></article><article><span>Contracts</span><strong>{record.contracts.length}</strong></article><article><span>Playable roster</span><strong>{record.review.roster.filter((decision) => decision.included).length}</strong></article><article><span>Titles</span><strong>{record.review.titles.filter((decision) => decision.included).length}</strong></article><article><span>Approach formulas</span><strong>{IMPORTED_APPROACH_FORMULAS.length}</strong></article></section>

      {!customReview && <section className="starting-universe-ready" aria-label="Universe Ready summary">
        <header><div><p className="eyebrow">UNIVERSE READY</p><h3>{record.name}</h3><p>The imported company data is ready. Roster roles, titles, television, tag teams, stables, and all 16 approach formulas will use the imported values automatically.</p></div><span className={blockingIssues.length ? "blocked" : "ready"}>{blockingIssues.length ? "Action required" : record.status === "Confirmed" ? "Loaded" : "Ready to load"}</span></header>
        {!record.companies.some((item) => item.userControlled) && <label className="field field--wide"><span>Company you want to control</span><select aria-label="Quick load playable company" value={record.playableCompanyId} onChange={(event) => void selectCompany(event.target.value)}>{record.companies.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.initials || item.id})</option>)}</select></label>}
        <div className="starting-ready-grid"><article><span>Company</span><strong>{company?.name ?? "Not selected"}</strong></article><article><span>Roster and staff</span><strong>{record.review.roster.filter((decision) => decision.included).length}</strong></article><article><span>Titles and TV</span><strong>{record.review.titles.filter((decision) => decision.included).length} / {record.review.tvShows.filter((decision) => decision.included).length}</strong></article><article><span>Teams and stables</span><strong>{record.review.tagTeams.filter((decision) => decision.included).length} / {record.review.stables.filter((decision) => decision.included).length}</strong></article></div>
        {record.review.issues.length > 0 && <details className="starting-ready-warnings"><summary>{blockingIssues.length ? `${blockingIssues.length} problem${blockingIssues.length === 1 ? "" : "s"} must be fixed` : `${record.review.issues.length} import note${record.review.issues.length === 1 ? "" : "s"}`}</summary>{record.review.issues.map((issue) => <p key={issue.id}><strong>{issue.severity}: {issue.message}</strong> {issue.detail}</p>)}</details>}
        <div className="starting-final-actions"><button className="primary-button" type="button" disabled={blockingIssues.length > 0 || record.status === "Confirmed"} onClick={() => void finalizeUniverse()}>{record.status === "Confirmed" ? "Universe Loaded" : "Load Universe and Start"}</button><button className="secondary-button" type="button" onClick={() => setCustomReview(true)}>Review or Customize Import</button>{record.status === "Confirmed" && <button className="secondary-button" type="button" onClick={onUniverseLoaded}>Continue to Main Game</button>}</div>
      </section>}

      {customReview && <>
      <nav className="starting-universe-tabs" aria-label="Starting Universe review sections">{(["source", "company", "roster", "titles", "teams", "formulas", "confirm"] as StartingUniverseReviewTab[]).map((tab) => <button key={tab} type="button" className={state.selectedTab === tab ? "active" : ""} onClick={() => setState((current) => ({ ...current, selectedTab: tab }))}>{tab === "source" ? "1. Source" : tab === "company" ? "2. Company" : tab === "roster" ? "3. Roster" : tab === "titles" ? "4. Titles & TV" : tab === "teams" ? "5. Teams & Stables" : tab === "formulas" ? "6. 16 Formulas" : "7. Confirm"}</button>)}</nav>
      <button className="secondary-button starting-review-close" type="button" onClick={() => setCustomReview(false)}>Back to Universe Ready</button>

      {state.selectedTab === "source" && <section className="starting-review-panel"><header><div><p className="eyebrow">READ-ONLY SOURCE</p><h3>{record.source.fileName}</h3></div><span>{record.source.format}</span></header><dl className="starting-source-grid"><div><dt>Game date</dt><dd>{record.source.gameDate || "Unavailable"}</dd></div><div><dt>Game start</dt><dd>{record.source.gameStartDate || "Unavailable"}</dd></div><div><dt>Database</dt><dd>{record.source.databaseTitle || "Unnamed"}</dd></div><div><dt>Database version</dt><dd>{record.source.databaseVersion || "Unavailable"}</dd></div><div><dt>Source size</dt><dd>{formatBytes(record.source.fileSize)}</dd></div><div><dt>Fingerprint</dt><dd>{record.source.fingerprint.slice(0, 16)}…</dd></div><div><dt>Imported</dt><dd>{formatDate(record.source.importedAt)}</dd></div><div><dt>Tables found</dt><dd>{record.source.tableNames.length}</dd></div></dl>{record.source.warnings.length > 0 && <div className="starting-warning-list">{record.source.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}<footer><button className="primary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "company" }))}>Continue to Company</button></footer></section>}

      {state.selectedTab === "company" && <section className="starting-review-panel"><header><div><p className="eyebrow">PLAYABLE COMPANY</p><h3>{company?.name ?? "Choose a company"}</h3><p>All imported companies remain in the starting world. This selection determines the roster and championships you control.</p></div><span>{record.companies.filter((item) => item.active).length} active</span></header><label className="field field--wide"><span>Playable company</span><select aria-label="Starting Universe playable company" value={record.playableCompanyId} onChange={(event) => void selectCompany(event.target.value)}>{record.companies.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.initials || item.id}) · {item.size}</option>)}</select></label>{company && <dl className="starting-company-grid"><div><dt>Initials</dt><dd>{company.initials}</dd></div><div><dt>Region</dt><dd>{company.basedIn}</dd></div><div><dt>Size</dt><dd>{company.size}</dd></div><div><dt>Prestige</dt><dd>{company.prestige}</dd></div><div><dt>Momentum</dt><dd>{company.momentum}</dd></div><div><dt>Money</dt><dd>{company.money.toLocaleString()}</dd></div><div><dt>Owner</dt><dd>{company.ownerName || "Unavailable"}</dd></div><div><dt>Head booker</dt><dd>{company.headBookerName || "Unavailable"}</dd></div><div><dt>Product</dt><dd>{company.styleName || company.productBase || "Unavailable"}</dd></div><div><dt>User controlled in TEW</dt><dd>{company.userControlled ? "Yes" : "No"}</dd></div></dl>}<footer><button className="primary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "roster" }))}>Review Starting Roster</button></footer></section>}

      {state.selectedTab === "roster" && <section className="starting-review-panel"><header><div><p className="eyebrow">STARTING ROSTER REVIEW</p><h3>{company?.name} roster and staff</h3><p>Remove imported contracts or add any worker from the imported world before the universe begins.</p></div><span>{record.review.roster.filter((decision) => decision.included).length} included</span></header><div className="starting-roster-controls"><input aria-label="Starting roster filter" placeholder="Filter current roster" value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value)} /><div><input aria-label="Imported world worker search" placeholder="Find another imported worker" value={worldSearch} onChange={(event) => setWorldSearch(event.target.value)} />{worldSearch.trim() && <div className="starting-world-results">{worldCandidates.map((worker) => <button key={worker.id} type="button" onClick={() => void addWorldWorker(worker.id)}><strong>{worker.name}</strong><span>{worker.style || worker.status || "Imported worker"}</span></button>)}</div>}</div></div><div className="starting-roster-table"><header><span>Include</span><span>Worker</span><span>Class</span><span>Primary role</span><span>Workbook ratings</span></header>{roster.map((decision) => { const worker = workers.get(decision.workerId); const contract = contracts.get(decision.contractId); if (!worker) return null; return <article key={decision.workerId} className={!decision.included ? "excluded" : ""}><label><input aria-label={`Include ${worker.name}`} type="checkbox" checked={decision.included} onChange={(event) => void updateRoster(worker.id, { included: event.target.checked })} /></label><div><strong>{contract?.ringName || worker.name}</strong><span>{worker.name !== contract?.ringName && contract?.ringName ? `TEW identity: ${worker.name}` : worker.style || "Style unavailable"}</span><small>{decision.addedFromWorld ? "Added from imported world" : contract?.perception || "Perception unavailable"}</small></div><select aria-label={`${worker.name} roster class`} value={decision.rosterClass} onChange={(event) => void updateRoster(worker.id, { rosterClass: event.target.value as typeof decision.rosterClass })}><option>Wrestler</option><option>Staff</option><option>Dual Role</option></select><input aria-label={`${worker.name} primary role`} value={decision.primaryRole} onChange={(event) => void updateRoster(worker.id, { primaryRole: event.target.value })} /><div><strong>{decision.workbookMetrics.overallRating.toFixed(1)} overall</strong><span>{topApproaches(decision.workbookMetrics.approachRatings)}</span><small>Stamina {decision.workbookMetrics.staminaRating.toFixed(1)} · Capacity {decision.workbookMetrics.staminaCapacity} · Botch risk {decision.workbookMetrics.botchRisk.toFixed(1)}</small></div></article>; })}</div><footer><button className="primary-button" type="button" onClick={() => void acknowledge("roster")}>{record.review.rosterAcknowledged ? "Roster Review Acknowledged" : "Acknowledge Starting Roster"}</button><button className="secondary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "titles" }))}>Continue to Titles &amp; TV</button></footer></section>}

      {state.selectedTab === "titles" && <section className="starting-review-panel"><header><div><p className="eyebrow">TITLES AND WEEKLY PROGRAMS</p><h3>Resolve imported names without silent changes</h3><p>The TEW title name remains visible beside the editable Wrestling Sim name.</p></div><span>{record.review.titles.length} titles</span></header><div className="starting-title-list">{record.review.titles.map((decision) => { const title = record.titles.find((item) => item.id === decision.titleId); if (!title) return null; return <article key={title.id}><label><input aria-label={`Include ${title.importedName}`} type="checkbox" checked={decision.included} onChange={(event) => void updateTitle(title.id, { included: event.target.checked })} /> Include</label><div><strong>{title.importedName}</strong><span>{title.style} · {title.level} · Prestige {title.prestige}</span></div><label className="field"><span>Wrestling Sim title name</span><input aria-label={`${title.importedName} game name`} value={decision.gameName} onChange={(event) => void updateTitle(title.id, { gameName: event.target.value, acknowledged: false })} /></label><label><input aria-label={`Acknowledge ${title.importedName}`} type="checkbox" checked={decision.acknowledged} onChange={(event) => void updateTitle(title.id, { acknowledged: event.target.checked })} /> Reviewed</label></article>; })}</div><div className="starting-tv-list"><h4>Imported television shows</h4>{record.review.tvShows.length === 0 ? <p>No TV show is assigned to this company in the export.</p> : record.review.tvShows.map((decision) => { const show = record.tvShows.find((item) => item.id === decision.tvShowId); if (!show) return null; return <article key={show.id}><label><input aria-label={`Include ${show.importedName}`} type="checkbox" checked={decision.included} onChange={(event) => void updateTvShow(show.id, { included: event.target.checked })} /> Include</label><div><strong>{show.importedName}</strong><span>{show.showDay} · {show.lengthMinutes} minutes</span></div><input aria-label={`${show.importedName} game name`} value={decision.gameName} onChange={(event) => void updateTvShow(show.id, { gameName: event.target.value, acknowledged: false })} /><input aria-label={`${show.importedName} length`} type="number" min={15} max={360} value={decision.lengthMinutes} onChange={(event) => void updateTvShow(show.id, { lengthMinutes: Math.max(15, Number(event.target.value) || show.lengthMinutes), acknowledged: false })} /><input aria-label={`${show.importedName} show day`} value={decision.showDay} onChange={(event) => void updateTvShow(show.id, { showDay: event.target.value, acknowledged: false })} /><label><input aria-label={`Acknowledge ${show.importedName}`} type="checkbox" checked={decision.acknowledged} onChange={(event) => void updateTvShow(show.id, { acknowledged: event.target.checked })} /> Reviewed</label></article>; })}</div><footer><button className="primary-button" type="button" onClick={() => void acknowledge("titles")}>{record.review.titlesAcknowledged ? "Titles & TV Review Acknowledged" : "Acknowledge Titles & TV"}</button><button className="secondary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "teams" }))}>Continue to Teams &amp; Stables</button></footer></section>}

      {state.selectedTab === "teams" && <section className="starting-review-panel"><header><div><p className="eyebrow">TEAM IDENTITY REVIEW</p><h3>Choose imported team and stable identities</h3><p>TEW can contain several records for the same pair. The importer shows every variant instead of guessing silently.</p></div><span>{record.review.tagTeams.length} roster pairs</span></header><div className="starting-team-list">{record.review.tagTeams.length === 0 ? <p>No imported tag-team candidates have both members on the included roster.</p> : record.review.tagTeams.map((decision) => <article key={decision.id}><label><input aria-label={`Include team ${decision.workerNames.join(" and ")}`} type="checkbox" checked={decision.included} onChange={(event) => void updateTeam(decision.id, { included: event.target.checked })} /> Include</label><div><strong>{decision.workerNames.join(" & ")}</strong><span>{decision.variantIds.length} imported variant{decision.variantIds.length === 1 ? "" : "s"}</span></div><label className="field"><span>Imported identity</span><select aria-label={`${decision.workerNames.join(" and ")} team variant`} value={decision.selectedVariantId} onChange={(event) => void updateTeam(decision.id, { selectedVariantId: event.target.value, acknowledged: false })}>{decision.variantIds.map((variantId) => { const variant = record.tagTeamVariants.find((item) => item.id === variantId)!; return <option key={variant.id} value={variant.id}>{variant.name} · {variant.companyName || "Global"} · Experience {variant.experience}</option>; })}</select></label><label className="field"><span>Wrestling Sim team name</span><input aria-label={`${decision.workerNames.join(" and ")} team name`} value={decision.gameName} onChange={(event) => void updateTeam(decision.id, { gameName: event.target.value, acknowledged: false })} /></label><label><input aria-label={`Acknowledge team ${decision.workerNames.join(" and ")}`} type="checkbox" checked={decision.acknowledged} onChange={(event) => void updateTeam(decision.id, { acknowledged: event.target.checked })} /> Reviewed</label></article>)}</div><div className="starting-stable-list"><h4>Stable candidates</h4>{record.review.stables.length === 0 ? <p>No company-specific or multi-roster-member stable was found.</p> : record.review.stables.map((decision) => { const stable = record.stables.find((item) => item.id === decision.stableId); if (!stable) return null; return <article key={stable.id}><label><input aria-label={`Include stable ${stable.name}`} type="checkbox" checked={decision.included} onChange={(event) => void updateStable(stable.id, { included: event.target.checked })} /> Include</label><div><strong>{stable.name}</strong><span>{stable.members.map((member) => workers.get(member.workerId)?.name || member.workerName || member.workerId).join(", ")}</span></div><input aria-label={`${stable.name} stable name`} value={decision.gameName} onChange={(event) => void updateStable(stable.id, { gameName: event.target.value, acknowledged: false })} /><label><input aria-label={`Acknowledge stable ${stable.name}`} type="checkbox" checked={decision.acknowledged} onChange={(event) => void updateStable(stable.id, { acknowledged: event.target.checked })} /> Reviewed</label></article>; })}</div><footer><button className="primary-button" type="button" onClick={() => void acknowledge("teams")}>{record.review.teamsAcknowledged ? "Teams & Stables Review Acknowledged" : "Acknowledge Teams & Stables"}</button><button className="secondary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "formulas" }))}>Review All 16 Formulas</button></footer></section>}

      {state.selectedTab === "formulas" && <section className="starting-review-panel"><header><div><p className="eyebrow">EXCEL MATCH SYSTEM</p><h3>All 16 distinct approach formulas retained</h3><p>Counter Specialist remains separate. Ring General remains a separate six-part formula and is presented as Pace Controller in the companion.</p></div><span>{record.approachFormulaVersion}</span></header><div className="starting-formula-list">{IMPORTED_APPROACH_FORMULAS.map((formula, index) => <article key={formula.id}><b>{index + 1}</b><div><strong>{formula.name}</strong><span>Workbook: {formula.workbookName}</span><p>{formulaLabel(formula)}</p><small>{formula.sourceNote}</small></div><em>{formula.currentMatchEngineId ? "Current companion mapping" : "Reserved for Phase 6B"}</em></article>)}</div><footer><button className="primary-button" type="button" onClick={() => setState((current) => ({ ...current, selectedTab: "confirm" }))}>Continue to Confirmation</button></footer></section>}

      {state.selectedTab === "confirm" && <section className="starting-review-panel"><header><div><p className="eyebrow">CONFIRM STARTING WORLD</p><h3>{record.name}</h3><p>Confirmation freezes the reviewed import as your standalone starting point and creates Match Engine profiles for included wrestlers.</p></div><span>{record.status}</span></header><div className="starting-confirm-grid"><article><span>Playable company</span><strong>{company?.name}</strong></article><article><span>Included roster</span><strong>{record.review.roster.filter((decision) => decision.included).length}</strong></article><article><span>Wrestler-enabled</span><strong>{record.review.roster.filter((decision) => decision.included && decision.rosterClass !== "Staff").length}</strong></article><article><span>Staff-enabled</span><strong>{record.review.roster.filter((decision) => decision.included && decision.rosterClass !== "Wrestler").length}</strong></article><article><span>Titles</span><strong>{record.review.titles.filter((decision) => decision.included).length}</strong></article><article><span>Teams</span><strong>{record.review.tagTeams.filter((decision) => decision.included).length}</strong></article></div><section className="starting-review-issues"><header><h4>Review findings</h4><span>{record.review.issues.length}</span></header>{record.review.issues.map((issue) => <article key={issue.id} className={`starting-issue--${issue.severity.toLowerCase()}`}><strong>{issue.severity}: {issue.message}</strong><span>{issue.detail}</span></article>)}</section><div className="starting-acknowledgements"><label><input type="checkbox" checked={record.review.rosterAcknowledged} onChange={() => void acknowledge("roster")} /> Starting roster reviewed</label><label><input type="checkbox" checked={record.review.titlesAcknowledged} onChange={() => void acknowledge("titles")} /> Titles and television reviewed</label><label><input type="checkbox" checked={record.review.teamsAcknowledged} onChange={() => void acknowledge("teams")} /> Teams and stables reviewed</label><label><input type="checkbox" checked={replaceExistingProfiles} onChange={(event) => setReplaceExistingProfiles(event.target.checked)} /> Replace already customized Match Engine profiles with imported TEW ratings</label></div><div className="starting-final-actions"><button className="primary-button" type="button" disabled={blockingIssues.length > 0 || record.status === "Confirmed"} onClick={() => void finalizeUniverse()}>{record.status === "Confirmed" ? "Starting Universe Confirmed" : "Confirm Standalone Starting Universe"}</button><button className="secondary-button" type="button" onClick={() => void exportPackage()}>Export Starting Universe Package</button></div>{record.status === "Confirmed" && <div className="starting-confirmed-banner"><strong>Standalone starting point locked</strong><span>Confirmed {formatDate(record.confirmedAt)}. Phase 6B can now use these ratings and formulas to suggest the winner, finish, and match rating.</span></div>}</section>}
      </>}
    </>}
  </section>;
}
