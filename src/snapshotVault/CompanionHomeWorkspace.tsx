import { useEffect, useMemo, useRef, useState } from "react";
import { loadChampionshipUniverse } from "../championships/storage";
import { loadCompetitionUniverse } from "../competitions/storage";
import { createMatchEngineProfile } from "../matchEngine/model";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import { createPlannerBackup, parsePlannerBackup, parsePlannerBackupBundle, savePlannedShows } from "../planner/storage";
import { loadPlannedShows } from "../planner/storage";
import { createProfileLibraryRecord, synchronizeProfileLibrary } from "../profileLibrary/model";
import { loadProfileLibraryUniverse, saveProfileLibraryUniverse } from "../profileLibrary/storage";
import { loadPromotionScheduleUniverse } from "../schedule/storage";
import { loadShowSessionUniverse } from "../showSession/storage";
import { createTrackerStoryline } from "../storylines/model";
import { loadTrackerStorylines, saveTrackerStorylines } from "../storylines/storage";
import type { StorylineRecord, TewSnapshot, WorkerReference } from "../tew/types";
import { loadWrapUpUniverse } from "../wrapUp/storage";
import {
  buildSnapshotSafetyWarnings,
  buildStorylineIdentityCandidates,
  buildWorkerIdentityCandidates,
  createStorylineIdentityDecision,
  createWorkerIdentityDecision,
  normalizeSnapshotName,
  promotionCompanyCandidates,
  snapshotVaultId,
  updatePromotionIdentity,
  upsertStorylineIdentityDecision,
  upsertWorkerIdentityDecision,
} from "./model";
import {
  PRE_RESTORE_SAFETY_KEY,
  activateStoredSnapshot,
  clearStoredSnapshots,
  compareStoredSnapshots,
  estimateSnapshotVaultStorage,
  exportSnapshotVaultPackage,
  importSnapshotVaultPackage,
  parseSnapshotVaultPackage,
  removeStoredSnapshot,
  saveSnapshotVaultUniverse,
  storedSnapshotRecord,
  updateStoredSnapshotManifest,
} from "./storage";
import type {
  SnapshotComparisonRecord,
  SnapshotManifestRecord,
  SnapshotRole,
  SnapshotVaultStorageEstimate,
  SnapshotVaultUniverse,
  StoredSnapshotRecord,
  StorylineIdentityDecisionKind,
  WorkerIdentityDecisionKind,
} from "./types";

interface CompanionHomeWorkspaceProps {
  activeSnapshot: TewSnapshot | null;
  vault: SnapshotVaultUniverse;
  vaultReady: boolean;
  snapshotLoading: boolean;
  snapshotError: string;
  onImportSnapshot: (file: File) => void | Promise<void>;
  onActivateSnapshot: (snapshotId: string) => void | Promise<void>;
  onVaultChange: (universe: SnapshotVaultUniverse) => void;
  onContinueShow: () => void;
  onOpenPlanner: () => void;
  onOpenCalendar: () => void;
  onOpenResults: () => void;
  onOpenProfiles: () => void;
  onOpenStorylines: () => void;
  onOpenWrapUp: () => void;
}

const snapshotRoles: SnapshotRole[] = ["Current TEW Save", "Baseline", "Before Show", "After Show", "Historical Reference", "Unclassified"];

function formatDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function mapImportedStorylineStatus(value: string) {
  const normalized = normalizeSnapshotName(value);
  if (normalized.includes("complete") || normalized.includes("end")) return "Completed" as const;
  if (normalized.includes("pause") || normalized.includes("hold")) return "Paused" as const;
  if (normalized.includes("active") || normalized.includes("running")) return "Active" as const;
  if (normalized.includes("idea")) return "Idea" as const;
  return "Planned" as const;
}

function uniqueStorylineParticipants(existing: ReturnType<typeof createTrackerStoryline>["participants"], imported: WorkerReference[]) {
  const known = new Set(existing.map((participant) => `${participant.source}:${participant.id || normalizeSnapshotName(participant.name)}`));
  const additions = imported.flatMap((worker) => {
    const key = `tew:${worker.id || normalizeSnapshotName(worker.name)}`;
    return known.has(key) ? [] : [{ id: worker.id || snapshotVaultId("storyline-worker"), name: worker.name, role: worker.role || "Involved", source: "tew" as const }];
  });
  return [...existing, ...additions];
}

function currentManifest(vault: SnapshotVaultUniverse): SnapshotManifestRecord | null {
  return vault.manifest.find((record) => record.id === vault.activeSnapshotId) ?? null;
}

function decisionLabel(value: string): string {
  return value || "Not reviewed";
}

export default function CompanionHomeWorkspace({
  activeSnapshot,
  vault,
  vaultReady,
  snapshotLoading,
  snapshotError,
  onImportSnapshot,
  onActivateSnapshot,
  onVaultChange,
  onContinueShow,
  onOpenPlanner,
  onOpenCalendar,
  onOpenResults,
  onOpenProfiles,
  onOpenStorylines,
  onOpenWrapUp,
}: CompanionHomeWorkspaceProps) {
  const mdbInputRef = useRef<HTMLInputElement | null>(null);
  const vaultImportRef = useRef<HTMLInputElement | null>(null);
  const backupImportRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState("");
  const [estimate, setEstimate] = useState<SnapshotVaultStorageEstimate | null>(null);
  const [activeRecord, setActiveRecord] = useState<StoredSnapshotRecord | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparisonRecord | null>(() => vault.comparisons.find((item) => item.id === vault.lastComparisonId) ?? null);
  const [backupPreview, setBackupPreview] = useState<{ text: string; version: number; shows: number; storylines: number; snapshots: number } | null>(null);
  const [clearPhrase, setClearPhrase] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [storylineFilter, setStorylineFilter] = useState("");
  const [profileSelections, setProfileSelections] = useState<Record<string, string>>({});
  const [storylineSelections, setStorylineSelections] = useState<Record<string, string>>({});

  const plannedShows = useMemo(() => loadPlannedShows(window.localStorage), [vault.home.updatedAt, vault.dataCenter.lastRestoreAt]);
  const sessions = useMemo(() => loadShowSessionUniverse(window.localStorage), [vault.home.updatedAt]);
  const wrapUp = useMemo(() => loadWrapUpUniverse(window.localStorage), [vault.home.updatedAt]);
  const schedule = useMemo(() => loadPromotionScheduleUniverse(window.localStorage), [vault.home.updatedAt]);
  const championships = useMemo(() => loadChampionshipUniverse(window.localStorage), [vault.home.updatedAt]);
  const competitions = useMemo(() => loadCompetitionUniverse(window.localStorage), [vault.home.updatedAt]);
  const matchEngine = useMemo(() => loadMatchEngineUniverse(window.localStorage), [vault.workerDecisions, vault.home.updatedAt]);
  const profileLibrary = useMemo(() => synchronizeProfileLibrary(matchEngine, loadProfileLibraryUniverse(window.localStorage), activeSnapshot), [matchEngine, activeSnapshot, vault.workerDecisions]);
  const trackerStorylines = useMemo(() => loadTrackerStorylines(window.localStorage), [vault.storylineDecisions, vault.home.updatedAt]);
  const currentShow = plannedShows.find((show) => show.id === sessions.lastShowId) ?? plannedShows[0] ?? null;
  const nextScheduledShow = [...plannedShows].filter((show) => !currentShow || show.date >= currentShow.date).sort((left, right) => left.date.localeCompare(right.date)).find((show) => show.id !== currentShow?.id && show.status !== "Reconciled") ?? null;
  const awaitingResults = plannedShows.filter((show) => show.status === "Completed" && !show.reconciliation);
  const awaitingReconciliation = plannedShows.filter((show) => Boolean(show.reconciliation) && show.status !== "Reconciled");
  const wrapUpPending = plannedShows.filter((show) => show.status === "Reconciled" && wrapUp.sessions.find((session) => session.showId === show.id)?.status !== "Closed");
  const unresolvedTitles = plannedShows.flatMap((show) => show.segments).filter((segment) => segment.championshipId && segment.reconciliation.actualMatch && !segment.titleResultDecision).length;
  const unresolvedCompetitionResults = competitions.competitions.flatMap((item) => item.fixtures).filter((fixture) => fixture.plannedSegmentId && !fixture.winnerId && !["Draw", "No Contest", "Cancelled", "Bye"].includes(fixture.status)).length;
  const obligations = schedule.continuityDecisions.filter((decision) => decision.status === "Deferred").length;
  const warnings = useMemo(() => buildSnapshotSafetyWarnings(activeRecord, vault, plannedShows), [activeRecord, vault, plannedShows]);
  const companyCandidates = useMemo(() => promotionCompanyCandidates(activeSnapshot), [activeSnapshot]);
  const workerCandidates = useMemo(() => buildWorkerIdentityCandidates(activeSnapshot, matchEngine.profiles), [activeSnapshot, matchEngine.profiles]);
  const storylineCandidates = useMemo(() => buildStorylineIdentityCandidates(activeSnapshot, trackerStorylines), [activeSnapshot, trackerStorylines]);
  const activeSnapshotId = vault.activeSnapshotId;
  const activeManifest = currentManifest(vault);

  useEffect(() => {
    void estimateSnapshotVaultStorage(vault).then(setEstimate).catch(() => setEstimate(null));
  }, [vault.manifest, vault.dataCenter.retentionLimit]);

  useEffect(() => {
    let alive = true;
    void storedSnapshotRecord(vault.activeSnapshotId).then((record) => { if (alive) setActiveRecord(record); });
    return () => { alive = false; };
  }, [vault.activeSnapshotId, vault.manifest]);

  useEffect(() => {
    saveProfileLibraryUniverse(window.localStorage, profileLibrary);
  }, [profileLibrary]);

  function updateVault(next: SnapshotVaultUniverse): void {
    saveSnapshotVaultUniverse(window.localStorage, next);
    onVaultChange(next);
  }

  function setTab(activeTab: SnapshotVaultUniverse["home"]["activeTab"]): void {
    updateVault({ ...vault, home: { ...vault.home, activeTab, updatedAt: new Date().toISOString() } });
  }

  async function changeManifest(snapshotId: string, patch: Partial<Pick<SnapshotManifestRecord, "role" | "notes">>): Promise<void> {
    try {
      const next = await updateStoredSnapshotManifest(vault, snapshotId, patch);
      updateVault(next);
      setNotice("Snapshot metadata updated without changing the parsed TEW history.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Snapshot metadata could not be updated.");
    }
  }

  async function runComparison(): Promise<void> {
    try {
      const result = await compareStoredSnapshots(vault.home.compareBeforeSnapshotId, vault.home.compareAfterSnapshotId, vault);
      setComparison(result.comparison);
      updateVault(result.universe);
      setNotice(`${result.comparison.changes.length} supported history difference${result.comparison.changes.length === 1 ? "" : "s"} detected.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The snapshots could not be compared.");
    }
  }

  async function removeSnapshot(snapshotId: string): Promise<void> {
    const manifest = vault.manifest.find((record) => record.id === snapshotId);
    if (!manifest) return;
    const activeWarning = snapshotId === vault.activeSnapshotId ? " This is the active snapshot." : "";
    if (!window.confirm(`Remove ${manifest.fileName} from the parsed Snapshot Vault?${activeWarning} The creative tracker data will remain.`)) return;
    const next = await removeStoredSnapshot(snapshotId, vault);
    updateVault(next);
    if (snapshotId === activeSnapshotId && next.activeSnapshotId) await onActivateSnapshot(next.activeSnapshotId);
    setNotice("Parsed snapshot removed. Creative tracker data was not deleted.");
  }

  async function exportVault(): Promise<void> {
    try {
      const packageValue = await exportSnapshotVaultPackage(vault);
      downloadJson(`tew-snapshot-vault-${new Date().toISOString().slice(0, 10)}.json`, packageValue);
      updateVault({ ...vault, dataCenter: { ...vault.dataCenter, lastVaultExportAt: new Date().toISOString() } });
      setNotice(`Exported ${packageValue.records.length} parsed snapshot${packageValue.records.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Snapshot Vault export failed.");
    }
  }

  async function importVaultFile(file: File): Promise<void> {
    try {
      const packageValue = parseSnapshotVaultPackage(await file.text());
      const next = await importSnapshotVaultPackage(packageValue);
      updateVault(next);
      if (next.activeSnapshotId) await onActivateSnapshot(next.activeSnapshotId);
      setNotice(`Restored ${packageValue.records.length} parsed snapshot${packageValue.records.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Snapshot Vault import failed.");
    }
  }

  function updatePromotion(patch: Partial<SnapshotVaultUniverse["promotion"]>, complete = false): void {
    updateVault(updatePromotionIdentity(vault, patch, complete));
  }

  function recordWorkerDecision(workerId: string, decision: WorkerIdentityDecisionKind, profileKey = "", note = ""): void {
    if (!activeSnapshot || !activeSnapshotId) return;
    const worker = activeSnapshot.workers.find((item) => item.id === workerId);
    const candidate = workerCandidates.find((item) => item.tewWorkerId === workerId);
    if (!worker || !candidate) return;
    const existing = vault.workerDecisions.find((item) => item.snapshotId === activeSnapshotId && item.tewWorkerId === worker.id);
    const nextDecision = createWorkerIdentityDecision({
      snapshotId: activeSnapshotId,
      tewWorkerId: worker.id,
      tewWorkerName: worker.name,
      decision,
      profileKey,
      candidateProfileKeys: candidate.candidateProfileKeys,
      note,
    }, existing);
    updateVault(upsertWorkerIdentityDecision(vault, nextDecision));
  }

  function linkExistingProfile(workerId: string): void {
    if (!activeSnapshot) return;
    const worker = activeSnapshot.workers.find((item) => item.id === workerId);
    const profileKey = profileSelections[workerId] || workerCandidates.find((item) => item.tewWorkerId === workerId)?.candidateProfileKeys[0] || "";
    if (!worker || !profileKey) { setNotice("Choose an existing wrestler profile before confirming the TEW identity link."); return; }
    const profile = matchEngine.profiles.find((item) => item.workerKey === profileKey);
    if (!profile) return;
    const synchronized = synchronizeProfileLibrary(matchEngine, loadProfileLibraryUniverse(window.localStorage), activeSnapshot);
    const nextLibrary = {
      ...synchronized,
      records: synchronized.records.map((record) => record.workerKey === profileKey ? {
        ...record,
        identity: {
          status: "Confirmed" as const,
          tewWorkerId: worker.id,
          tewWorkerName: worker.name,
          candidateWorkerIds: [],
          method: "Manual confirmation" as const,
          confirmedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      } : record),
    };
    saveProfileLibraryUniverse(window.localStorage, nextLibrary);
    recordWorkerDecision(workerId, "Linked Existing Profile", profileKey, "Tracker ratings and manual overrides were preserved.");
    setNotice(`${worker.name} linked to ${profile.workerName}. Existing tracker ratings were not replaced.`);
  }

  function createIdentityOnlyProfile(workerId: string): void {
    if (!activeSnapshot) return;
    const worker = activeSnapshot.workers.find((item) => item.id === workerId);
    if (!worker) return;
    const existingProfile = matchEngine.profiles.find((profile) => profile.workerSource === "tew" && profile.workerId === worker.id);
    if (existingProfile) {
      recordWorkerDecision(worker.id, "Confirmed Existing Link", existingProfile.workerKey, "Exact TEW worker ID already exists.");
      setNotice(`${worker.name} already has an exact TEW-linked profile.`);
      return;
    }
    const profile = createMatchEngineProfile({ id: worker.id, name: worker.name, source: "tew" });
    profile.notes = "Identity imported from the read-only TEW snapshot. Ratings remain visible baseline placeholders until replaced or imported.";
    const nextMatchEngine = { ...matchEngine, profiles: [...matchEngine.profiles, profile] };
    const library = loadProfileLibraryUniverse(window.localStorage);
    const record = createProfileLibraryRecord(profile, activeSnapshot);
    const nextLibrary = { ...library, records: [...library.records.filter((item) => item.workerKey !== profile.workerKey), record], settings: { ...library.settings, selectedProfileKey: profile.workerKey } };
    saveMatchEngineUniverse(window.localStorage, nextMatchEngine);
    saveProfileLibraryUniverse(window.localStorage, nextLibrary);
    recordWorkerDecision(worker.id, "Created Identity-Only Profile", profile.workerKey, "No wrestler ratings were invented. Baseline values remain incomplete.");
    setNotice(`${worker.name} received an identity-only profile marked Ratings Incomplete.`);
  }

  function bulkConfirmExactWorkerIds(): void {
    let next = vault;
    let confirmed = 0;
    for (const candidate of workerCandidates.filter((item) => item.exactIdProfileKeys.length === 1 && !item.conflict)) {
      const existing = next.workerDecisions.find((item) => item.snapshotId === activeSnapshotId && item.tewWorkerId === candidate.tewWorkerId);
      const decision = createWorkerIdentityDecision({
        snapshotId: activeSnapshotId,
        tewWorkerId: candidate.tewWorkerId,
        tewWorkerName: candidate.tewWorkerName,
        decision: "Confirmed Existing Link",
        profileKey: candidate.exactIdProfileKeys[0],
        candidateProfileKeys: candidate.candidateProfileKeys,
        note: "Bulk-confirmed exact TEW worker ID match.",
      }, existing);
      next = upsertWorkerIdentityDecision(next, decision);
      confirmed += 1;
    }
    updateVault(next);
    setNotice(`${confirmed} exact TEW worker ID link${confirmed === 1 ? "" : "s"} confirmed.`);
  }

  function trackerStorylineForSelection(tewId: string) {
    const selected = storylineSelections[tewId] || storylineCandidates.find((candidate) => candidate.tewStorylineId === tewId)?.candidateStorylineIds[0] || "";
    return trackerStorylines.find((storyline) => storyline.id === selected) ?? null;
  }

  function recordStorylineDecision(tewStoryline: StorylineRecord, decision: StorylineIdentityDecisionKind, trackerStorylineId = "", note = ""): void {
    if (!activeSnapshotId) return;
    const candidate = storylineCandidates.find((item) => item.tewStorylineId === tewStoryline.id);
    const existing = vault.storylineDecisions.find((item) => item.snapshotId === activeSnapshotId && item.tewStorylineId === tewStoryline.id);
    const nextDecision = createStorylineIdentityDecision({
      snapshotId: activeSnapshotId,
      tewStorylineId: tewStoryline.id,
      tewStorylineName: tewStoryline.name,
      decision,
      trackerStorylineId,
      candidateStorylineIds: candidate?.candidateStorylineIds ?? [],
      importedStatus: tewStoryline.status,
      importedHeat: tewStoryline.heat,
      note,
    }, existing);
    updateVault(upsertStorylineIdentityDecision(vault, nextDecision));
  }

  function linkExistingStoryline(tewId: string): void {
    if (!activeSnapshot) return;
    const imported = activeSnapshot.storylines.find((storyline) => storyline.id === tewId);
    const tracker = trackerStorylineForSelection(tewId);
    if (!imported || !tracker) { setNotice("Choose an existing tracker storyline before confirming the link."); return; }
    const timestamp = new Date().toISOString();
    const updated = {
      ...tracker,
      referenceLinks: tracker.referenceLinks.some((link) => link.source === "tew" && link.referenceId === imported.id)
        ? tracker.referenceLinks
        : [...tracker.referenceLinks, { id: snapshotVaultId("storyline-reference"), source: "tew" as const, referenceId: imported.id, name: imported.name }],
      updatedAt: timestamp,
    };
    saveTrackerStorylines(window.localStorage, trackerStorylines.map((storyline) => storyline.id === tracker.id ? updated : storyline));
    recordStorylineDecision(imported, "Linked Existing Storyline", tracker.id, "Tracker creative details were preserved unchanged.");
    setNotice(`${imported.name} linked to ${tracker.name}. Tracker-written creative details were preserved.`);
  }

  function createStorylineFromSnapshot(tewId: string): void {
    if (!activeSnapshot) return;
    const imported = activeSnapshot.storylines.find((storyline) => storyline.id === tewId);
    if (!imported) return;
    const tracker = createTrackerStoryline(trackerStorylines.length + 1);
    tracker.name = imported.name;
    tracker.status = mapImportedStorylineStatus(imported.status);
    tracker.premise = imported.description;
    tracker.currentPhase = "";
    tracker.participants = imported.workers.map((worker) => ({ id: worker.id || snapshotVaultId("storyline-worker"), name: worker.name, role: worker.role || "Involved", source: "tew" }));
    tracker.referenceLinks = [{ id: snapshotVaultId("storyline-reference"), source: "tew", referenceId: imported.id, name: imported.name }];
    tracker.privateNotes = [`Imported from ${imported.sourceTable}.`, imported.heat === null ? "TEW heat unavailable." : `Imported TEW heat: ${imported.heat}.`, "No premise expansion, motivations, climax, ending, aftermath, or milestones were invented."].join("\n");
    tracker.updatedAt = new Date().toISOString();
    saveTrackerStorylines(window.localStorage, [...trackerStorylines, tracker]);
    recordStorylineDecision(imported, "Created Tracker Storyline", tracker.id, "Only supported TEW name, description, status, heat note, and participants were copied.");
    setNotice(`${imported.name} created as a tracker storyline without invented future creative details.`);
  }

  function updateImportedStorylineFields(tewId: string): void {
    if (!activeSnapshot) return;
    const imported = activeSnapshot.storylines.find((storyline) => storyline.id === tewId);
    const tracker = trackerStorylineForSelection(tewId);
    if (!imported || !tracker) return;
    const heatNote = imported.heat === null ? "" : `Latest imported TEW heat: ${imported.heat}.`;
    const updated = {
      ...tracker,
      status: mapImportedStorylineStatus(imported.status),
      participants: uniqueStorylineParticipants(tracker.participants, imported.workers),
      privateNotes: [tracker.privateNotes, heatNote].filter(Boolean).join("\n").trim(),
      updatedAt: new Date().toISOString(),
    };
    saveTrackerStorylines(window.localStorage, trackerStorylines.map((storyline) => storyline.id === tracker.id ? updated : storyline));
    recordStorylineDecision(imported, "Update Imported Fields", tracker.id, "Imported status, heat note, and participant references updated. Creative fields were preserved.");
    setNotice(`${tracker.name} imported status and participant references updated. Creative details were not replaced.`);
  }

  function exportCompleteBackup(): void {
    const timestamp = new Date().toISOString();
    const backup = createPlannerBackup(loadPlannedShows(window.localStorage));
    downloadJson(`tew-story-tracker-backup-v22-${timestamp.slice(0, 10)}.json`, backup);
    updateVault({ ...vault, dataCenter: { ...vault.dataCenter, lastCompleteBackupAt: timestamp } });
    setNotice("Version 22 complete companion backup exported. Parsed Snapshot Vault contents remain in the separate vault package.");
  }

  async function previewBackup(file: File): Promise<void> {
    try {
      const text = await file.text();
      const bundle = parsePlannerBackupBundle(text);
      const parsed = JSON.parse(text) as { version?: number };
      setBackupPreview({ text, version: parsed.version ?? 0, shows: bundle.shows.length, storylines: bundle.storylines.length, snapshots: bundle.snapshotVault.manifest.length });
      setNotice("Backup parsed successfully. Review the counts before restoring.");
    } catch (caught) {
      setBackupPreview(null);
      setNotice(caught instanceof Error ? caught.message : "The backup could not be previewed.");
    }
  }

  function restoreBackup(): void {
    if (!backupPreview) return;
    if (!window.confirm(`Restore version ${backupPreview.version} with ${backupPreview.shows} planned shows? Current tracker data will be replaced after creating a local safety point.`)) return;
    const timestamp = new Date().toISOString();
    const safety = createPlannerBackup(loadPlannedShows(window.localStorage));
    window.localStorage.setItem(PRE_RESTORE_SAFETY_KEY, JSON.stringify(safety));
    const restoredShows = parsePlannerBackup(backupPreview.text);
    savePlannedShows(window.localStorage, restoredShows);
    const bundle = parsePlannerBackupBundle(backupPreview.text);
    const nextVault = { ...bundle.snapshotVault, dataCenter: { ...bundle.snapshotVault.dataCenter, lastRestoreAt: timestamp, lastPreRestoreSafetyAt: timestamp } };
    saveSnapshotVaultUniverse(window.localStorage, nextVault);
    setNotice("Backup restored. Reloading the companion with the restored data.");
    window.setTimeout(() => window.location.reload(), 150);
  }

  async function clearSnapshotsOnly(): Promise<void> {
    if (!window.confirm("Clear all parsed TEW snapshots from IndexedDB? Creative tracker data and normal backups will remain.")) return;
    const next = await clearStoredSnapshots(vault);
    updateVault(next);
    setActiveRecord(null);
    setNotice("Snapshot Vault cleared. Creative tracker data was not deleted.");
  }

  function clearTrackerOnly(): void {
    if (clearPhrase !== "CLEAR TRACKER") { setNotice("Type CLEAR TRACKER exactly before clearing creative tracker data."); return; }
    const preservedVault = window.localStorage.getItem("tew-story-tracker:snapshot-vault-manifest:v1");
    const preservedSafety = window.localStorage.getItem(PRE_RESTORE_SAFETY_KEY);
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => Boolean(key));
    keys.filter((key) => key.startsWith("tew-story-tracker:") && key !== "tew-story-tracker:snapshot-vault-manifest:v1" && key !== PRE_RESTORE_SAFETY_KEY).forEach((key) => window.localStorage.removeItem(key));
    if (preservedVault) window.localStorage.setItem("tew-story-tracker:snapshot-vault-manifest:v1", preservedVault);
    if (preservedSafety) window.localStorage.setItem(PRE_RESTORE_SAFETY_KEY, preservedSafety);
    setNotice("Creative tracker data cleared. Parsed Snapshot Vault data was preserved.");
    window.setTimeout(() => window.location.reload(), 150);
  }

  const visibleWorkers = workerCandidates.filter((candidate) => normalizeSnapshotName(candidate.tewWorkerName).includes(normalizeSnapshotName(workerFilter))).slice(0, 120);
  const visibleStorylines = storylineCandidates.filter((candidate) => normalizeSnapshotName(candidate.tewStorylineName).includes(normalizeSnapshotName(storylineFilter))).slice(0, 120);
  const latestComparison = comparison ?? vault.comparisons.find((item) => item.id === vault.lastComparisonId) ?? null;

  return <section className="companion-home-workspace" aria-label="TEW Companion Home">
    <header className="companion-home-hero">
      <div><p className="eyebrow">CORE BOOKING HOME</p><h2>Your current TEW snapshot, current show, next action, and complete data safety in one place</h2><p>Parsed TEW history is preserved read-only in IndexedDB. Match approaches, Match Stories, Angle Outputs, card entry, reconciliation, and Post-Show Wrap-Up remain the companion's only daily responsibilities.</p></div>
      <div className="companion-home-active"><span>Active snapshot</span><strong>{activeManifest?.fileName ?? (vaultReady ? "No stored snapshot" : "Restoring…")}</strong><small>{activeManifest ? `${activeManifest.role} · ${formatDate(activeManifest.importedAt)}` : "Import an MDB or restore a Snapshot Vault package."}</small></div>
    </header>

    {notice && <div className="status-banner planner-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
    {snapshotError && <div className="status-banner error" role="alert"><strong>Snapshot import failed</strong><span>{snapshotError}</span></div>}

    <nav className="companion-home-tabs" aria-label="Companion Home sections">
      <button type="button" className={vault.home.activeTab === "home" ? "active" : ""} onClick={() => setTab("home")}>Companion Home</button>
      <button type="button" className={vault.home.activeTab === "vault" ? "active" : ""} onClick={() => setTab("vault")}>TEW Snapshot Vault</button>
      <button type="button" className={vault.home.activeTab === "onboarding" ? "active" : ""} onClick={() => setTab("onboarding")}>Promotion Onboarding</button>
      <button type="button" className={vault.home.activeTab === "data" ? "active" : ""} onClick={() => setTab("data")}>Data &amp; Backup Center</button>
    </nav>

    <input ref={mdbInputRef} className="visually-hidden" type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={(event) => { const file = event.target.files?.item(0); if (file) void onImportSnapshot(file); event.currentTarget.value = ""; }} />
    <input ref={vaultImportRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void importVaultFile(file); event.currentTarget.value = ""; }} />
    <input ref={backupImportRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.item(0); if (file) void previewBackup(file); event.currentTarget.value = ""; }} />

    {vault.home.activeTab === "home" && <div className="companion-home-grid">
      <main className="companion-home-main">
        <section className="companion-home-current">
          <header><div><p className="eyebrow">NEXT ACTION</p><h3>{wrapUpPending.length ? `Finish Post-Show Wrap-Up for ${wrapUpPending[0].name}` : awaitingReconciliation.length ? `Reconcile ${awaitingReconciliation[0].name}` : currentShow ? `Continue ${currentShow.name}` : nextScheduledShow ? `Open ${nextScheduledShow.name}` : "Set up the first planned show"}</h3></div><span>{currentShow?.status ?? "No current show"}</span></header>
          <dl><div><dt>Current show</dt><dd>{currentShow?.name ?? "None"}</dd></div><div><dt>Next scheduled show</dt><dd>{nextScheduledShow?.name ?? "None"}</dd></div><div><dt>Current session step</dt><dd>{sessions.records.find((record) => record.showId === currentShow?.id)?.activeStep ?? "overview"}</dd></div><div><dt>Promotion</dt><dd>{vault.promotion.promotionName || "Onboarding not completed"}</dd></div></dl>
          <div className="companion-home-actions"><button className="primary-button" type="button" onClick={currentShow ? onContinueShow : onOpenPlanner}>{currentShow ? "Continue Current Show" : "Create First Show"}</button>{currentShow && <button className="secondary-button" type="button" onClick={onOpenPlanner}>Edit Card / Add Match</button>}<button className="secondary-button" type="button" onClick={() => mdbInputRef.current?.click()}>{snapshotLoading ? "Reading Snapshot…" : "Import Updated TEW Snapshot"}</button><button className="secondary-button" type="button" onClick={onOpenResults}>Review New TEW Results</button><button className="secondary-button" type="button" disabled={wrapUpPending.length === 0} onClick={onOpenWrapUp}>Finish Post-Show Wrap-Up</button><button className="secondary-button" type="button" onClick={onOpenCalendar}>Open Promotion Calendar</button><button className="secondary-button" type="button" onClick={exportCompleteBackup}>Export Complete Backup</button></div>
        </section>

        <section className="companion-home-metrics" aria-label="Companion workflow summary"><article><span>Awaiting results</span><strong>{awaitingResults.length}</strong></article><article><span>Reconciliation needed</span><strong>{awaitingReconciliation.length}</strong></article><article><span>Wrap-Up pending</span><strong>{wrapUpPending.length}</strong></article><article><span>Deferred obligations</span><strong>{obligations}</strong></article><article><span>Title decisions</span><strong>{unresolvedTitles}</strong></article><article><span>Competition results</span><strong>{unresolvedCompetitionResults}</strong></article></section>

        <section className="companion-home-warnings"><header><h3>Snapshot safety and stale-data checks</h3><span>{warnings.length}</span></header>{warnings.length === 0 ? <p>No active-snapshot safety warnings were detected.</p> : warnings.map((warning) => <article key={warning.id} className={`snapshot-warning snapshot-warning--${warning.severity.toLowerCase()}`}><strong>{warning.severity}: {warning.title}</strong><span>{warning.detail}</span></article>)}</section>

        {latestComparison && <section className="companion-home-comparison"><header><div><p className="eyebrow">LATEST SNAPSHOT COMPARISON</p><h3>{latestComparison.beforeFileName} → {latestComparison.afterFileName}</h3></div><span>{latestComparison.changes.length}</span></header><div className="comparison-count-grid"><article><span>New shows</span><strong>{latestComparison.newShowIds.length}</strong></article><article><span>Changed matches</span><strong>{latestComparison.changedMatchIds.length}</strong></article><article><span>New workers</span><strong>{latestComparison.newWorkerIds.length}</strong></article><article><span>New storylines</span><strong>{latestComparison.newStorylineIds.length}</strong></article></div>{latestComparison.changes.slice(0, 8).map((change) => <article className="comparison-change" key={change.id}><strong>{change.kind}: {change.title}</strong><span>{change.detail}</span></article>)}<button className="secondary-button" type="button" onClick={() => setTab("vault")}>Open Full Snapshot Comparison</button></section>}
      </main>

      <aside className="companion-home-sidebar">
        <section><header><h3>Current TEW snapshot</h3><span>{activeManifest?.mappingConfidence ?? "None"}</span></header>{activeManifest ? <dl><div><dt>File</dt><dd>{activeManifest.fileName}</dd></div><div><dt>Role</dt><dd>{activeManifest.role}</dd></div><div><dt>Workers</dt><dd>{activeManifest.workerCount}</dd></div><div><dt>Shows</dt><dd>{activeManifest.showCount}</dd></div><div><dt>Matches</dt><dd>{activeManifest.matchCount}</dd></div><div><dt>Storylines</dt><dd>{activeManifest.storylineCount}</dd></div></dl> : <p>No parsed snapshot is active.</p>}<button className="secondary-button" type="button" onClick={() => setTab("vault")}>Change Active Snapshot</button></section>
        <section><header><h3>Data safety</h3><span>v22</span></header><dl><div><dt>Last complete backup</dt><dd>{formatDate(vault.dataCenter.lastCompleteBackupAt)}</dd></div><div><dt>Snapshot package</dt><dd>{formatDate(vault.dataCenter.lastVaultExportAt)}</dd></div><div><dt>Vault storage</dt><dd>{estimate ? formatBytes(estimate.totalBytes) : "Calculating…"}</dd></div><div><dt>Stored snapshots</dt><dd>{vault.manifest.length}</dd></div></dl><button className="secondary-button" type="button" onClick={() => setTab("data")}>Open Data Center</button></section>
      </aside>
    </div>}

    {vault.home.activeTab === "vault" && <section className="snapshot-vault-panel">
      <header className="snapshot-vault-header"><div><p className="eyebrow">PERSISTENT READ-ONLY HISTORY</p><h3>TEW Snapshot Vault</h3><p>Parsed TEW snapshots live in IndexedDB and survive browser refreshes. The source MDB is never modified, uploaded, or treated as editable.</p></div><div className="snapshot-vault-actions"><button className="primary-button" type="button" onClick={() => mdbInputRef.current?.click()}>{snapshotLoading ? "Reading MDB…" : "Import TEW MDB Snapshot"}</button><button className="secondary-button" type="button" onClick={() => void exportVault()}>Export Snapshot Vault Package</button><button className="secondary-button" type="button" onClick={() => vaultImportRef.current?.click()}>Import Snapshot Vault Package</button></div></header>
      <section className="snapshot-storage-summary"><article><span>Snapshots</span><strong>{estimate?.recordCount ?? vault.manifest.length}</strong></article><article><span>Parsed size</span><strong>{estimate ? formatBytes(estimate.parsedSnapshotBytes) : "—"}</strong></article><article><span>Browser usage</span><strong>{estimate?.usageBytes === null || estimate?.usageBytes === undefined ? "Unavailable" : formatBytes(estimate.usageBytes)}</strong></article><article><span>Estimated quota</span><strong>{estimate?.quotaBytes === null || estimate?.quotaBytes === undefined ? "Unavailable" : formatBytes(estimate.quotaBytes)}</strong></article></section>
      <div className="snapshot-vault-list">{vault.manifest.length === 0 ? <div className="empty-state"><h3>No stored TEW snapshots</h3><p>Import the current TEW MDB or restore a Snapshot Vault package.</p></div> : vault.manifest.map((manifest) => <article key={manifest.id} className={manifest.id === vault.activeSnapshotId ? "active" : ""}><header><div><strong>{manifest.fileName}</strong><span>{manifest.fingerprint}</span></div><b>{manifest.id === vault.activeSnapshotId ? "Active" : manifest.mappingConfidence}</b></header><dl><div><dt>Imported</dt><dd>{formatDate(manifest.importedAt)}</dd></div><div><dt>History</dt><dd>{manifest.showCount} shows · {manifest.matchCount} matches</dd></div><div><dt>Identity</dt><dd>{manifest.workerCount} workers · {manifest.storylineCount} storylines</dd></div><div><dt>Warnings</dt><dd>{manifest.warningCount}</dd></div></dl><label className="field"><span>Snapshot role</span><select aria-label={`${manifest.fileName} snapshot role`} value={manifest.role} onChange={(event) => void changeManifest(manifest.id, { role: event.target.value as SnapshotRole })}>{snapshotRoles.map((role) => <option key={role}>{role}</option>)}</select></label><label className="field"><span>Notes</span><textarea aria-label={`${manifest.fileName} snapshot notes`} rows={2} value={manifest.notes} onChange={(event) => { const notes = event.target.value; updateVault({ ...vault, manifest: vault.manifest.map((item) => item.id === manifest.id ? { ...item, notes } : item) }); }} onBlur={(event) => void changeManifest(manifest.id, { notes: event.target.value })} /></label><footer><button className="primary-button" type="button" disabled={manifest.id === vault.activeSnapshotId} onClick={() => void onActivateSnapshot(manifest.id)}>Activate Snapshot</button><button className="secondary-button" type="button" onClick={() => void removeSnapshot(manifest.id)}>Remove Parsed Snapshot</button></footer></article>)}</div>
      <section className="snapshot-comparison-lab"><header><div><p className="eyebrow">READ-ONLY COMPARISON</p><h3>Compare two stored snapshots</h3></div><span>{vault.comparisons.length} saved</span></header><div className="snapshot-comparison-controls"><label className="field"><span>Earlier snapshot</span><select aria-label="Earlier stored snapshot" value={vault.home.compareBeforeSnapshotId} onChange={(event) => updateVault({ ...vault, home: { ...vault.home, compareBeforeSnapshotId: event.target.value, updatedAt: new Date().toISOString() } })}><option value="">Choose snapshot…</option>{vault.manifest.map((record) => <option key={record.id} value={record.id}>{record.fileName} · {record.role}</option>)}</select></label><label className="field"><span>Later snapshot</span><select aria-label="Later stored snapshot" value={vault.home.compareAfterSnapshotId} onChange={(event) => updateVault({ ...vault, home: { ...vault.home, compareAfterSnapshotId: event.target.value, updatedAt: new Date().toISOString() } })}><option value="">Choose snapshot…</option>{vault.manifest.map((record) => <option key={record.id} value={record.id}>{record.fileName} · {record.role}</option>)}</select></label><button className="primary-button" type="button" onClick={() => void runComparison()}>Compare Supported TEW History</button></div>{latestComparison && <div className="snapshot-comparison-results"><header><strong>{latestComparison.beforeFileName} → {latestComparison.afterFileName}</strong><span>{latestComparison.changes.length} changes</span></header>{latestComparison.changes.length === 0 ? <p>No supported show, match, worker, storyline, mapping, or warning changes were detected.</p> : latestComparison.changes.map((change) => <article key={change.id}><div><strong>{change.kind}</strong><span>{change.title}</span></div><small>{change.detail}</small><dl><div><dt>Before</dt><dd>{change.beforeValue}</dd></div><div><dt>After</dt><dd>{change.afterValue}</dd></div></dl></article>)}</div>}</section>
    </section>}

    {vault.home.activeTab === "onboarding" && <section className="companion-onboarding-panel">
      <header><div><p className="eyebrow">CONTROLLED PROMOTION SETUP</p><h3>Promotion, worker identities, and storyline links</h3><p>Only identities and supported imported fields are synchronized. Wrestler ratings, future creative plans, winners, dialogue, and TEW-only systems are never invented.</p></div><span>{vault.promotion.status}</span></header>
      <section className="onboarding-promotion"><header><h4>1. Promotion identity</h4><span>{companyCandidates.length} imported candidate{companyCandidates.length === 1 ? "" : "s"}</span></header>{companyCandidates.length > 0 && <div className="onboarding-company-candidates">{companyCandidates.map((candidate) => <button type="button" key={candidate.name} onClick={() => updatePromotion({ promotionName: candidate.name })}>{candidate.name} · {candidate.showCount} historical shows</button>)}</div>}<div className="onboarding-form-grid"><label className="field"><span>Promotion name</span><input aria-label="Onboarding promotion name" value={vault.promotion.promotionName} onChange={(event) => updatePromotion({ promotionName: event.target.value })} /></label><label className="field"><span>Abbreviation</span><input aria-label="Onboarding promotion abbreviation" value={vault.promotion.abbreviation} onChange={(event) => updatePromotion({ abbreviation: event.target.value })} /></label><label className="field"><span>Default brand</span><input aria-label="Onboarding default brand" value={vault.promotion.defaultBrand} onChange={(event) => updatePromotion({ defaultBrand: event.target.value })} /></label><label className="field"><span>Default weekly show</span><input aria-label="Onboarding default weekly show" value={vault.promotion.defaultWeeklyShow} onChange={(event) => updatePromotion({ defaultWeeklyShow: event.target.value })} /></label><label className="field"><span>Default show length</span><input aria-label="Onboarding default show length" type="number" min={15} max={360} value={vault.promotion.defaultShowLength} onChange={(event) => updatePromotion({ defaultShowLength: Math.max(15, Number(event.target.value) || 60) })} /></label><label className="field"><span>Calendar start date</span><input aria-label="Onboarding calendar start date" type="date" value={vault.promotion.calendarStartDate} onChange={(event) => updatePromotion({ calendarStartDate: event.target.value })} /></label></div><button className="primary-button" type="button" disabled={!vault.promotion.promotionName.trim() || !activeSnapshotId} onClick={() => updatePromotion({ activeSnapshotId }, true)}>Confirm Promotion Identity</button></section>

      <section className="onboarding-workers"><header><div><h4>2. TEW worker identity review</h4><p>Creating an identity-only profile leaves every match-approach rating visibly incomplete.</p></div><div><input aria-label="Onboarding worker filter" placeholder="Filter workers" value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} /><button className="secondary-button" type="button" onClick={bulkConfirmExactWorkerIds}>Bulk Confirm Exact TEW IDs</button><button className="secondary-button" type="button" onClick={onOpenProfiles}>Open Wrestler Profiles</button></div></header>{!activeSnapshot ? <div className="empty-state compact">Activate a stored TEW snapshot before reviewing worker identities.</div> : <div className="onboarding-identity-list">{visibleWorkers.map((candidate) => { const decision = vault.workerDecisions.find((item) => item.snapshotId === activeSnapshotId && item.tewWorkerId === candidate.tewWorkerId); return <article key={candidate.tewWorkerId} className={candidate.conflict ? "conflict" : ""}><header><div><strong>{candidate.tewWorkerName}</strong><span>TEW ID {candidate.tewWorkerId}</span></div><b>{decisionLabel(decision?.decision ?? candidate.recommendedDecision)}</b></header><p>{candidate.exactIdProfileKeys.length === 1 ? "Exact TEW worker ID match available." : candidate.exactNameProfileKeys.length === 1 ? "One normalized-name profile match requires confirmation." : candidate.conflict ? "Multiple tracker profiles could represent this worker." : "No tracker profile is linked yet."}</p><label className="field"><span>Existing profile</span><select aria-label={`${candidate.tewWorkerName} existing profile`} value={profileSelections[candidate.tewWorkerId] ?? candidate.candidateProfileKeys[0] ?? ""} onChange={(event) => setProfileSelections((current) => ({ ...current, [candidate.tewWorkerId]: event.target.value }))}><option value="">Choose profile…</option>{matchEngine.profiles.map((profile) => <option key={profile.workerKey} value={profile.workerKey}>{profile.workerName} · {profile.workerKey}</option>)}</select></label><footer><button className="secondary-button" type="button" onClick={() => linkExistingProfile(candidate.tewWorkerId)}>Link Existing Profile</button><button className="secondary-button" type="button" onClick={() => createIdentityOnlyProfile(candidate.tewWorkerId)}>Create Identity-Only Profile</button><button className="secondary-button" type="button" onClick={() => recordWorkerDecision(candidate.tewWorkerId, "Ignored", "", "Worker is outside the companion promotion or deliberately not tracked.")}>Ignore Worker</button></footer></article>; })}</div>}</section>

      <section className="onboarding-storylines"><header><div><h4>3. TEW storyline identity review</h4><p>Tracker-written premise, motivations, climax, ending, aftermath, and milestones remain separate from imported TEW fields.</p></div><div><input aria-label="Onboarding storyline filter" placeholder="Filter storylines" value={storylineFilter} onChange={(event) => setStorylineFilter(event.target.value)} /><button className="secondary-button" type="button" onClick={onOpenStorylines}>Open Storyline Hub</button></div></header>{!activeSnapshot ? <div className="empty-state compact">Activate a stored TEW snapshot before reviewing storyline identities.</div> : <div className="onboarding-identity-list">{visibleStorylines.map((candidate) => { const imported = activeSnapshot.storylines.find((item) => item.id === candidate.tewStorylineId)!; const decision = vault.storylineDecisions.find((item) => item.snapshotId === activeSnapshotId && item.tewStorylineId === candidate.tewStorylineId); return <article key={`${imported.sourceTable}:${imported.id}`} className={candidate.conflict ? "conflict" : ""}><header><div><strong>{imported.name}</strong><span>{imported.sourceTable} · {imported.status || "Status unavailable"} · Heat {imported.heat ?? "—"}</span></div><b>{decisionLabel(decision?.decision ?? candidate.recommendedDecision)}</b></header><p>{imported.description || "No imported description is available."}</p><label className="field"><span>Existing tracker storyline</span><select aria-label={`${imported.name} existing storyline`} value={storylineSelections[imported.id] ?? candidate.candidateStorylineIds[0] ?? ""} onChange={(event) => setStorylineSelections((current) => ({ ...current, [imported.id]: event.target.value }))}><option value="">Choose storyline…</option>{trackerStorylines.map((storyline) => <option key={storyline.id} value={storyline.id}>{storyline.name}</option>)}</select></label><footer><button className="secondary-button" type="button" onClick={() => linkExistingStoryline(imported.id)}>Link Existing Storyline</button><button className="secondary-button" type="button" onClick={() => createStorylineFromSnapshot(imported.id)}>Create Tracker Storyline</button><button className="secondary-button" type="button" onClick={() => updateImportedStorylineFields(imported.id)}>Update Imported Fields Only</button><button className="secondary-button" type="button" onClick={() => recordStorylineDecision(imported, "Historical Only", "", "Preserved as read-only TEW history without creating a tracker storyline.")}>Historical Only</button></footer></article>; })}</div>}</section>
    </section>}

    {vault.home.activeTab === "data" && <section className="companion-data-center">
      <header><div><p className="eyebrow">GLOBAL DATA SAFETY</p><h3>Complete backup, restore preview, and separate Snapshot Vault packages</h3><p>The normal version 22 companion backup preserves the vault manifest and all creative systems. The separate Snapshot Vault package preserves the larger parsed TEW history records.</p></div><span>Backup v22</span></header>
      <div className="data-center-grid"><section><h4>Complete companion backup</h4><p>Includes planned shows, outputs, profiles, calendar, reconciliation, Wrap-Up, onboarding, identity decisions, and Snapshot Vault manifest.</p><button className="primary-button" type="button" onClick={exportCompleteBackup}>Export Complete Companion Backup</button><dl><div><dt>Last export</dt><dd>{formatDate(vault.dataCenter.lastCompleteBackupAt)}</dd></div><div><dt>Current format</dt><dd>Version 22</dd></div></dl></section><section><h4>Restore companion backup</h4><p>Preview the version and record counts. A complete pre-restore safety point is retained locally before replacement.</p><button className="secondary-button" type="button" onClick={() => backupImportRef.current?.click()}>Choose Backup for Preview</button>{backupPreview && <div className="backup-preview"><strong>Version {backupPreview.version}</strong><span>{backupPreview.shows} shows · {backupPreview.storylines} storylines · {backupPreview.snapshots} snapshot manifest records</span><button className="primary-button" type="button" onClick={restoreBackup}>Confirm Restore</button></div>}</section><section><h4>Snapshot Vault package</h4><p>Export or restore full parsed read-only TEW snapshot contents independently from creative tracker data.</p><div><button className="secondary-button" type="button" onClick={() => void exportVault()}>Export Snapshot Vault Package</button><button className="secondary-button" type="button" onClick={() => vaultImportRef.current?.click()}>Import Snapshot Vault Package</button></div><dl><div><dt>Last package</dt><dd>{formatDate(vault.dataCenter.lastVaultExportAt)}</dd></div><div><dt>Stored size</dt><dd>{estimate ? formatBytes(estimate.totalBytes) : "Calculating…"}</dd></div></dl></section><section><h4>Retention and storage warnings</h4><label className="field"><span>Maximum stored snapshots</span><input aria-label="Snapshot retention limit" type="number" min={1} max={100} value={vault.dataCenter.retentionLimit} onChange={(event) => updateVault({ ...vault, dataCenter: { ...vault.dataCenter, retentionLimit: Math.max(1, Math.min(100, Number(event.target.value) || 12)) } })} /></label><label className="field"><span>Warning threshold in MB</span><input aria-label="Snapshot storage warning megabytes" type="number" min={5} max={2048} value={vault.dataCenter.storageWarningMegabytes} onChange={(event) => updateVault({ ...vault, dataCenter: { ...vault.dataCenter, storageWarningMegabytes: Math.max(5, Number(event.target.value) || 80) } })} /></label></section></div>
      <section className="data-center-danger"><header><h4>Clear data separately</h4><p>Snapshot Vault data and creative tracker data are deliberately separate.</p></header><div><article><strong>Clear parsed Snapshot Vault</strong><p>Deletes IndexedDB snapshot contents and manifest. Planned shows, outputs, profiles, and creative history remain.</p><button className="danger-button" type="button" onClick={() => void clearSnapshotsOnly()}>Clear Snapshot Vault Only</button></article><article><strong>Clear creative tracker data</strong><p>Preserves Snapshot Vault contents. Type CLEAR TRACKER to unlock this action.</p><input aria-label="Clear tracker confirmation" value={clearPhrase} onChange={(event) => setClearPhrase(event.target.value)} /><button className="danger-button" type="button" onClick={clearTrackerOnly}>Clear Tracker Data Only</button></article></div></section>
    </section>}
  </section>;
}
