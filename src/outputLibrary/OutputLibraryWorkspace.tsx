import { useEffect, useMemo, useState } from "react";
import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import { loadWorkbenchUniverse, saveWorkbenchUniverse } from "../workbench/storage";
import type { WorkbenchUniverse } from "../workbench/types";
import {
  buildShowProductionPacket,
  compareOutputVersions,
  createReusableOutputStructure,
  restoreOutputVersion,
  saveSegmentToOutputLibrary,
  syncPlannedShowsToOutputLibrary,
} from "./model";
import { loadOutputLibraryUniverse, saveOutputLibraryUniverse } from "./storage";
import type {
  OutputLibraryItem,
  OutputLibrarySettings,
  OutputLibraryTab,
  OutputLibraryUniverse,
  OutputVersion,
} from "./types";

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

function downloadText(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tew-output";
}

function currentVersion(item: OutputLibraryItem | null): OutputVersion | null {
  if (!item) return null;
  return item.versions.find((version) => version.id === item.currentVersionId) ?? item.versions.at(-1) ?? null;
}

function approachNames(item: OutputLibraryItem): string {
  return item.approachIds.map((id) => MATCH_APPROACHES.find((approach) => approach.id === id)?.name ?? id).join(", ");
}

function matchAimName(item: OutputLibraryItem): string {
  return MATCH_AIMS.find((aim) => aim.id === item.matchAimId)?.name ?? item.matchAimId;
}

function itemSearchText(item: OutputLibraryItem): string {
  return [
    item.title,
    item.sourceShowName,
    ...item.participantNames,
    ...item.storylineNames,
    item.championship,
    item.competitionRoundLabel,
    matchAimName(item),
    approachNames(item),
  ].join(" ").toLowerCase();
}

function sourceSegment(item: OutputLibraryItem, shows: PlannedShow[], workbench: WorkbenchUniverse): { segment: PlannedSegment; show: PlannedShow | null } | null {
  if (item.sourceKind === "Planned Show") {
    const show = shows.find((candidate) => candidate.id === item.sourceShowId);
    const segment = show?.segments.find((candidate) => candidate.id === item.sourceSegmentId);
    return show && segment ? { segment, show } : null;
  }
  const quick = workbench.quickSegments.find((record) => record.id === item.sourceQuickSegmentId);
  return quick ? { segment: quick.segment, show: null } : null;
}

export default function OutputLibraryWorkspace({
  onOpenPlannedSegment,
  onOpenWorkbench,
}: {
  onOpenPlannedSegment: (showId: string, segmentId: string) => void;
  onOpenWorkbench: () => void;
}) {
  const [universe, setUniverse] = useState<OutputLibraryUniverse>(() => loadOutputLibraryUniverse(window.localStorage));
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [workbench, setWorkbench] = useState<WorkbenchUniverse>(() => loadWorkbenchUniverse(window.localStorage));
  const [notice, setNotice] = useState("");
  const [structureName, setStructureName] = useState("");

  useEffect(() => saveOutputLibraryUniverse(window.localStorage, universe), [universe]);
  useEffect(() => savePlannedShows(window.localStorage, shows), [shows]);
  useEffect(() => saveWorkbenchUniverse(window.localStorage, workbench), [workbench]);

  const filteredItems = useMemo(() => {
    const query = universe.settings.searchQuery.trim().toLowerCase();
    return universe.items.filter((item) => {
      if (universe.settings.typeFilter !== "All" && item.type !== universe.settings.typeFilter) return false;
      if (universe.settings.sourceFilter !== "All" && item.sourceKind !== universe.settings.sourceFilter) return false;
      return !query || itemSearchText(item).includes(query);
    });
  }, [universe.items, universe.settings.searchQuery, universe.settings.sourceFilter, universe.settings.typeFilter]);

  const selectedItem = universe.items.find((item) => item.id === universe.settings.selectedItemId)
    ?? filteredItems[0]
    ?? universe.items[0]
    ?? null;
  const selectedVersion = currentVersion(selectedItem);
  const compareFrom = selectedItem?.versions.find((version) => version.id === universe.settings.compareFromVersionId)
    ?? selectedItem?.versions[0]
    ?? null;
  const compareTo = selectedItem?.versions.find((version) => version.id === universe.settings.compareToVersionId)
    ?? selectedVersion;
  const comparisonRows = compareFrom && compareTo ? compareOutputVersions(compareFrom, compareTo) : [];
  const selectedShow = shows.find((show) => show.id === universe.settings.selectedShowId) ?? shows[0] ?? null;
  const selectedPacket = universe.showPackets.find((packet) => packet.showId === universe.settings.selectedShowId)
    ?? universe.showPackets[0]
    ?? null;

  function patchSettings(patch: Partial<OutputLibrarySettings>): void {
    setUniverse((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function selectItem(item: OutputLibraryItem): void {
    patchSettings({
      selectedItemId: item.id,
      compareFromVersionId: item.versions[0]?.id ?? "",
      compareToVersionId: item.currentVersionId,
    });
  }

  function setTab(tab: OutputLibraryTab): void {
    patchSettings({ activeTab: tab });
  }

  function syncPlannedShows(): void {
    const next = syncPlannedShowsToOutputLibrary(universe, shows);
    setUniverse(next);
    setNotice(`${shows.reduce((sum, show) => sum + show.segments.length, 0)} planned segment${shows.reduce((sum, show) => sum + show.segments.length, 0) === 1 ? "" : "s"} synchronized with output lineage and packages.`);
  }

  function syncSelectedSource(): void {
    if (!selectedItem) return;
    const source = sourceSegment(selectedItem, shows, workbench);
    if (!source) {
      setNotice("The original Quick Segment or planned-show segment no longer exists.");
      return;
    }
    const result = saveSegmentToOutputLibrary(universe, {
      segment: source.segment,
      show: source.show,
      sourceKind: selectedItem.sourceKind,
      quickSegmentId: selectedItem.sourceQuickSegmentId,
      draftHistory: selectedItem.sourceKind === "Quick Segment"
        ? workbench.quickSegments.find((record) => record.id === selectedItem.sourceQuickSegmentId)?.draftHistory
        : undefined,
    });
    setUniverse(result.universe);
    setNotice(result.createdVersion ? "A new lineage version and fresh production package were saved." : "The library already matches the source segment; the package was refreshed without duplicating a version.");
  }

  function openSource(): void {
    if (!selectedItem) return;
    if (selectedItem.sourceKind === "Planned Show") {
      onOpenPlannedSegment(selectedItem.sourceShowId, selectedItem.sourceSegmentId);
      return;
    }
    const quickExists = workbench.quickSegments.some((record) => record.id === selectedItem.sourceQuickSegmentId);
    if (!quickExists) {
      setNotice("The original Quick Segment no longer exists.");
      return;
    }
    setWorkbench((current) => ({
      ...current,
      settings: { ...current.settings, lastQuickSegmentId: selectedItem.sourceQuickSegmentId, defaultMode: selectedItem.type === "match" ? "quick-match" : "quick-angle" },
      recentSegmentIds: [selectedItem.sourceQuickSegmentId, ...current.recentSegmentIds.filter((id) => id !== selectedItem.sourceQuickSegmentId)].slice(0, 12),
    }));
    window.setTimeout(onOpenWorkbench, 0);
  }

  function restoreVersion(version: OutputVersion): void {
    if (!selectedItem) return;
    if (selectedItem.sourceKind === "Planned Show") {
      const show = shows.find((candidate) => candidate.id === selectedItem.sourceShowId);
      const segment = show?.segments.find((candidate) => candidate.id === selectedItem.sourceSegmentId);
      if (!show || !segment) {
        setNotice("The linked planned-show segment no longer exists.");
        return;
      }
      const restored = restoreOutputVersion(segment, version);
      const nextShows = shows.map((candidate) => candidate.id === show.id
        ? { ...candidate, segments: candidate.segments.map((item) => item.id === segment.id ? restored : item), updatedAt: new Date().toISOString() }
        : candidate);
      setShows(nextShows);
      const result = saveSegmentToOutputLibrary(universe, {
        segment: restored,
        show: { ...show, segments: show.segments.map((item) => item.id === segment.id ? restored : item) },
        sourceKind: "Planned Show",
        stage: "Applied Output",
        label: `Restored from ${version.label}`,
      });
      setUniverse(result.universe);
      setNotice(`Restored ${version.label} to the planned segment and preserved the restoration as a new lineage version.`);
      return;
    }
    const record = workbench.quickSegments.find((candidate) => candidate.id === selectedItem.sourceQuickSegmentId);
    if (!record) {
      setNotice("The linked Quick Segment no longer exists.");
      return;
    }
    const restored = restoreOutputVersion(record.segment, version);
    const nextWorkbench = {
      ...workbench,
      quickSegments: workbench.quickSegments.map((candidate) => candidate.id === record.id ? { ...candidate, segment: restored, updatedAt: new Date().toISOString() } : candidate),
    };
    setWorkbench(nextWorkbench);
    const result = saveSegmentToOutputLibrary(universe, {
      segment: restored,
      sourceKind: "Quick Segment",
      quickSegmentId: record.id,
      draftHistory: record.draftHistory,
      stage: "Applied Output",
      label: `Restored from ${version.label}`,
    });
    setUniverse(result.universe);
    setNotice(`Restored ${version.label} to the Quick Segment and preserved the restoration as a new lineage version.`);
  }

  function createStructure(): void {
    if (!selectedItem) return;
    const structure = createReusableOutputStructure(selectedItem, structureName);
    setUniverse((current) => ({ ...current, structures: [structure, ...current.structures] }));
    setStructureName("");
    setNotice(`${structure.name} saved without wrestler names, winner, championship name, dialogue, or specific storyline outcome.`);
  }

  function buildPacket(): void {
    if (!selectedShow) {
      setNotice("Create or select a planned show before generating a production packet.");
      return;
    }
    const synchronized = syncPlannedShowsToOutputLibrary(universe, shows);
    const packet = buildShowProductionPacket(selectedShow, synchronized.items);
    setUniverse({
      ...synchronized,
      showPackets: [packet, ...synchronized.showPackets].slice(0, 30),
      settings: { ...synchronized.settings, activeTab: "packets", selectedShowId: selectedShow.id },
    });
    setNotice(`Production packet generated for ${selectedShow.name} with ${packet.warnings.length} warning${packet.warnings.length === 1 ? "" : "s"}.`);
  }

  async function copyPackage(kind: "tew" | "full"): Promise<void> {
    if (!selectedItem) return;
    const value = kind === "tew" ? selectedItem.productionPackage.conciseText : selectedItem.productionPackage.fullText;
    setNotice(await copyText(value) ? `${kind === "tew" ? "TEW notes package" : "Complete production package"} copied.` : "There is no package text to copy.");
  }

  const summary = {
    matches: universe.items.filter((item) => item.type === "match").length,
    angles: universe.items.filter((item) => item.type === "angle").length,
    reconciled: universe.items.filter((item) => item.plannedVsActual.ready).length,
    templates: universe.structures.length,
  };

  return <section className="output-library-workspace">
    <header className="output-library-hero">
      <div>
        <p className="eyebrow">PHASE 5F · TEW COMPANION OUTPUTS</p>
        <h2>Output Library and Road-Agent Workflow</h2>
        <p>Preserve every Match Story and Angle Output from the original plan through TEW entry and reconciliation. Generate copy-ready road-agent packages without replacing TEW or writing to its database.</p>
      </div>
      <div className="output-library-safety"><span>Authority</span><strong>TEW results</strong><small>Companion packages are planning and handoff material.</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="output-library-summary" aria-label="Output Library summary">
      <div><span>Saved matches</span><strong>{summary.matches}</strong></div>
      <div><span>Saved angles</span><strong>{summary.angles}</strong></div>
      <div><span>Reconciled reports</span><strong>{summary.reconciled}</strong></div>
      <div><span>Reusable structures</span><strong>{summary.templates}</strong></div>
    </section>

    <nav className="output-library-tabs" aria-label="Output Library sections">
      <button type="button" className={universe.settings.activeTab === "library" ? "active" : ""} onClick={() => setTab("library")}>Output Library</button>
      <button type="button" className={universe.settings.activeTab === "packets" ? "active" : ""} onClick={() => setTab("packets")}>Show Production Packets</button>
      <button type="button" className={universe.settings.activeTab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Reusable Structures</button>
    </nav>

    {universe.settings.activeTab === "library" && <>
      <section className="output-library-toolbar">
        <button className="primary-button" type="button" onClick={syncPlannedShows}>Sync Planned Shows</button>
        <label className="field field--wide"><span>Search outputs</span><input aria-label="Search output library" value={universe.settings.searchQuery} onChange={(event) => patchSettings({ searchQuery: event.target.value })} placeholder="Wrestler, show, approach, championship, competition, storyline…" /></label>
        <label className="field"><span>Segment type</span><select aria-label="Output type filter" value={universe.settings.typeFilter} onChange={(event) => patchSettings({ typeFilter: event.target.value as OutputLibrarySettings["typeFilter"] })}><option>All</option><option value="match">Matches</option><option value="angle">Angles</option></select></label>
        <label className="field"><span>Source</span><select aria-label="Output source filter" value={universe.settings.sourceFilter} onChange={(event) => patchSettings({ sourceFilter: event.target.value as OutputLibrarySettings["sourceFilter"] })}><option>All</option><option>Quick Segment</option><option>Planned Show</option></select></label>
      </section>

      <div className="output-library-layout">
        <aside className="output-library-list">
          <header><strong>Saved outputs</strong><span>{filteredItems.length}</span></header>
          {filteredItems.length === 0 ? <div className="empty-state compact"><p>No outputs match the current filters. Save one from the Workbench or synchronize planned shows.</p></div> : filteredItems.map((item) => {
            const version = currentVersion(item);
            return <button type="button" key={item.id} className={selectedItem?.id === item.id ? "active" : ""} onClick={() => selectItem(item)}>
              <span className={`output-library-kind output-library-kind--${item.type}`}>{item.type === "match" ? "M" : "A"}</span>
              <div><strong>{item.title}</strong><small>{item.sourceShowName || item.sourceKind} · {item.participantNames.join(", ") || "No participants"}</small><em>{version?.stage ?? "Plan"} · {item.versions.length} version{item.versions.length === 1 ? "" : "s"}</em></div>
            </button>;
          })}
        </aside>

        {!selectedItem || !selectedVersion ? <div className="empty-state output-library-empty"><h3>No saved output selected</h3><p>Save a Quick Segment from the Match &amp; Angle Workbench or synchronize a planned show.</p></div> : <article className="output-library-detail">
          <header className="output-library-item-header">
            <div><p className="eyebrow">{selectedItem.sourceKind.toUpperCase()}</p><h3>{selectedItem.title}</h3><p>{selectedItem.sourceShowName || "Standalone companion segment"} · {selectedItem.participantNames.join(", ") || "No participants"}</p></div>
            <div><span>{selectedVersion.stage}</span><strong>{selectedItem.versions.length}</strong><small>lineage versions</small></div>
          </header>

          <div className="output-library-actions">
            <button className="primary-button" type="button" onClick={() => void copyPackage("tew")}>Copy TEW Notes</button>
            <button className="secondary-button" type="button" onClick={() => void copyPackage("full")}>Copy Full Package</button>
            <button className="secondary-button" type="button" onClick={syncSelectedSource}>Sync from Source</button>
            <button className="secondary-button" type="button" onClick={openSource}>Open Source Segment</button>
          </div>

          <section className="output-library-package">
            <header><div><p className="eyebrow">CURRENT PRODUCTION PACKAGE</p><h3>{selectedItem.productionPackage.kind}</h3></div><span>{formatDate(selectedItem.productionPackage.generatedAt)}</span></header>
            <div className="output-library-package-grid">
              <div><h4>Direct TEW fields</h4>{selectedItem.productionPackage.directTewFields.filter((field) => field.value.trim()).map((field) => <p key={field.label}><strong>{field.label}</strong><span>{field.value}</span></p>)}</div>
              <div><h4>Suggested TEW notes</h4>{selectedItem.productionPackage.tewNotes.filter((field) => field.value.trim()).map((field) => <p key={field.label}><strong>{field.label}</strong><span>{field.value}</span></p>)}</div>
              <div><h4>Companion-only strategy</h4>{selectedItem.productionPackage.companionOnly.filter((field) => field.value.trim()).map((field) => <p key={field.label}><strong>{field.label}</strong><span>{field.value}</span></p>)}</div>
            </div>
            {selectedItem.productionPackage.warnings.length > 0 && <div className="output-library-warnings"><strong>Package warnings</strong>{selectedItem.productionPackage.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
            <details><summary>Complete package text</summary><pre>{selectedItem.productionPackage.fullText}</pre></details>
          </section>

          <section className="output-library-lineage">
            <header><div><p className="eyebrow">OUTPUT LINEAGE</p><h3>Plan → draft → applied → TEW entry → reconciled actual</h3></div></header>
            <div>{selectedItem.versions.map((version) => <article key={version.id} className={version.id === selectedItem.currentVersionId ? "current" : ""}><div><strong>{version.stage}</strong><span>{version.label}</span><small>{formatDate(version.createdAt)}</small></div><p>{version.snapshot.type === "match" ? version.snapshot.matchStory || "No Match Story in this version." : version.snapshot.segmentOutput || "No Angle Output in this version."}</p><button type="button" onClick={() => restoreVersion(version)}>Restore to Source</button></article>)}</div>
          </section>

          <section className="output-library-compare">
            <header><div><p className="eyebrow">VERSION COMPARISON</p><h3>See exactly what changed</h3></div></header>
            <div className="output-library-compare-selectors"><label className="field"><span>From</span><select aria-label="Compare from output version" value={compareFrom?.id ?? ""} onChange={(event) => patchSettings({ compareFromVersionId: event.target.value })}>{selectedItem.versions.map((version) => <option key={version.id} value={version.id}>{version.stage} · {version.label}</option>)}</select></label><label className="field"><span>To</span><select aria-label="Compare to output version" value={compareTo?.id ?? ""} onChange={(event) => patchSettings({ compareToVersionId: event.target.value })}>{selectedItem.versions.map((version) => <option key={version.id} value={version.id}>{version.stage} · {version.label}</option>)}</select></label></div>
            <div className="output-library-compare-table">{comparisonRows.filter((row) => row.status !== "Same").length === 0 ? <p>No differences between the selected versions.</p> : comparisonRows.filter((row) => row.status !== "Same").map((row) => <article key={row.field}><strong>{row.field}</strong><span className={`output-library-change output-library-change--${row.status.toLowerCase()}`}>{row.status}</span><div><p><b>From</b>{row.fromValue || "Blank"}</p><p><b>To</b>{row.toValue || "Blank"}</p></div></article>)}</div>
          </section>

          <section className="output-library-source-transparency">
            <header><div><p className="eyebrow">SOURCE TRANSPARENCY</p><h3>Where the output language came from</h3></div></header>
            {selectedVersion.sourceAttribution.length === 0 ? <p>No approach phrase source was required for this version.</p> : selectedVersion.sourceAttribution.map((source) => <article key={source.id}><strong>{source.label}</strong><span>{source.source}</span><p>{source.note}</p></article>)}
          </section>

          <section className="output-library-actual-report">
            <header><div><p className="eyebrow">PLANNED VS ACTUAL</p><h3>{selectedItem.plannedVsActual.ready ? "Reconciled TEW comparison" : "Awaiting reconciled TEW result"}</h3></div></header>
            <p>{selectedItem.plannedVsActual.summary}</p>
            <div>{selectedItem.plannedVsActual.rows.map((row) => <article key={row.field}><strong>{row.field}</strong><span>{row.status}</span><p><b>Planned</b>{row.plannedValue || "Blank"}</p><p><b>Actual</b>{row.actualValue || "Blank"}</p></article>)}</div>
          </section>

          <section className="output-library-template-action">
            <header><div><p className="eyebrow">REUSABLE STRUCTURE</p><h3>Keep the construction, remove the specific booking</h3></div></header>
            <p>Wrestler names, planned winner, championship name, dialogue, and specific storyline outcome are not copied into the reusable structure.</p>
            <div><input aria-label="Reusable output structure name" value={structureName} onChange={(event) => setStructureName(event.target.value)} placeholder="Optional structure name" /><button className="secondary-button" type="button" onClick={createStructure}>Create Reusable Structure</button></div>
          </section>
        </article>}
      </div>
    </>}

    {universe.settings.activeTab === "packets" && <section className="show-packet-workspace">
      <header><div><p className="eyebrow">SHOW-WIDE PRODUCTION</p><h3>Ordered production packet for the complete card</h3><p>Includes every match and angle package, continuity notes, missing-output warnings, TEW-entry guidance, and the post-show reconciliation checklist.</p></div></header>
      <div className="show-packet-controls"><label className="field"><span>Planned show</span><select aria-label="Production packet planned show" value={selectedShow?.id ?? ""} onChange={(event) => patchSettings({ selectedShowId: event.target.value })}><option value="">Choose a planned show…</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label><button className="primary-button" type="button" onClick={buildPacket}>Generate Show Production Packet</button></div>
      <div className="show-packet-layout">
        <aside>{universe.showPackets.length === 0 ? <div className="empty-state compact">No production packets have been generated.</div> : universe.showPackets.map((packet) => <button type="button" key={packet.id} className={selectedPacket?.id === packet.id ? "active" : ""} onClick={() => patchSettings({ selectedShowId: packet.showId })}><strong>{packet.showName}</strong><span>{packet.segmentCount} segments · {packet.warnings.length} warnings</span><small>{formatDate(packet.generatedAt)}</small></button>)}</aside>
        {selectedPacket ? <article><header><div><p className="eyebrow">LATEST SELECTED PACKET</p><h3>{selectedPacket.showName}</h3></div><span>{selectedPacket.matchCount} matches · {selectedPacket.angleCount} angles</span></header><div className="output-library-actions"><button className="primary-button" type="button" onClick={() => void copyText(selectedPacket.text).then((copied) => setNotice(copied ? "Show production packet copied." : "Packet text is empty."))}>Copy Packet</button><button className="secondary-button" type="button" onClick={() => downloadText(`${slug(selectedPacket.showName)}-production-packet.txt`, selectedPacket.text, "text/plain")}>Export Text</button><button className="secondary-button" type="button" onClick={() => downloadText(`${slug(selectedPacket.showName)}-production-packet.json`, selectedPacket.json, "application/json")}>Export JSON</button></div>{selectedPacket.warnings.length > 0 && <div className="output-library-warnings"><strong>Preflight warnings</strong>{selectedPacket.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}<pre>{selectedPacket.text}</pre></article> : <div className="empty-state">Generate a packet for a planned show.</div>}
      </div>
    </section>}

    {universe.settings.activeTab === "templates" && <section className="output-structure-workspace">
      <header><div><p className="eyebrow">REUSABLE OUTPUT STRUCTURES</p><h3>Production guidance without prebooking wrestlers or outcomes</h3><p>Structures retain duration, match or angle format, purpose, and required sections. Specific names, winners, championships, dialogue, and storyline outcomes are removed.</p></div><span>{universe.structures.length}</span></header>
      {universe.structures.length === 0 ? <div className="empty-state"><p>Create a reusable structure from any saved Output Library item.</p></div> : <div className="output-structure-grid">{universe.structures.map((structure) => <article key={structure.id}><header><div><span>{structure.type === "match" ? "MATCH" : "ANGLE"}</span><h4>{structure.name}</h4></div><small>{structure.durationMinutes} minutes</small></header><p>{structure.summary}</p><dl><div><dt>Format</dt><dd>{structure.type === "match" ? structure.matchType || "Match" : `${structure.angleLocation || "Location open"} · ${structure.angleContentType || "Content open"}`}</dd></div><div><dt>Purpose</dt><dd>{structure.purpose || "Open"}</dd></div><div><dt>Required sections</dt><dd>{structure.requiredSections.join(", ")}</dd></div></dl><small>Created {formatDate(structure.createdAt)}</small></article>)}</div>}
    </section>}
  </section>;
}
