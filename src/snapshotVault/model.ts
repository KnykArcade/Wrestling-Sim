import type { MatchEngineProfile } from "../matchEngine/types";
import type { PlannedShow } from "../planner/types";
import type { TrackerStoryline } from "../storylines/types";
import type { MatchRecord, ShowRecord, StorylineRecord, TewSnapshot, WorkerReference } from "../tew/types";
import type {
  PromotionIdentity,
  SnapshotComparisonChange,
  SnapshotComparisonRecord,
  SnapshotManifestRecord,
  SnapshotMappingConfidence,
  SnapshotRole,
  SnapshotSafetyWarning,
  SnapshotVaultUniverse,
  StoredSnapshotRecord,
  StorylineIdentityCandidate,
  StorylineIdentityDecision,
  WorkerIdentityCandidate,
  WorkerIdentityDecision,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

export function snapshotVaultId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeSnapshotName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableSort<T>(values: T[], selector: (value: T) => string): T[] {
  return [...values].sort((left, right) => selector(left).localeCompare(selector(right)));
}

function canonicalWorker(worker: WorkerReference) {
  return { id: worker.id, name: worker.name, role: worker.role, side: worker.side };
}

function canonicalMatch(match: MatchRecord) {
  return {
    id: match.id,
    showId: match.showId,
    description: match.description,
    rating: match.rating,
    winner: match.winner,
    matchTime: match.matchTime,
    notes: match.notes,
    placement: match.placement,
    workers: stableSort(match.workers.map(canonicalWorker), (worker) => `${worker.id}:${worker.name}:${worker.role}:${worker.side}`),
  };
}

function canonicalShow(show: ShowRecord) {
  return {
    id: show.id,
    name: show.name,
    date: show.date,
    rating: show.rating,
    attendance: show.attendance,
    venue: show.venue,
    company: show.company,
    broadcast: show.broadcast,
    matches: stableSort(show.matches.map(canonicalMatch), (match) => match.id),
  };
}

function canonicalStoryline(storyline: StorylineRecord) {
  return {
    id: storyline.id,
    name: storyline.name,
    description: storyline.description,
    status: storyline.status,
    heat: storyline.heat,
    sourceTable: storyline.sourceTable,
    workers: stableSort(storyline.workers.map(canonicalWorker), (worker) => `${worker.id}:${worker.name}:${worker.role}`),
  };
}

function fingerprintPayload(snapshot: TewSnapshot): string {
  return JSON.stringify({
    databaseCreatedAt: snapshot.databaseCreatedAt,
    tables: stableSort(snapshot.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      columns: [...table.columns].sort(),
      loaded: table.loaded,
      truncated: table.truncated,
    })), (table) => table.name),
    workers: stableSort(snapshot.workers.map(canonicalWorker), (worker) => `${worker.id}:${worker.name}`),
    shows: stableSort(snapshot.shows.map(canonicalShow), (show) => `${show.id}:${show.date}:${show.name}`),
    storylines: stableSort(snapshot.storylines.map(canonicalStoryline), (storyline) => `${storyline.sourceTable}:${storyline.id}:${storyline.name}`),
    diagnostics: {
      matchedTables: Object.fromEntries(Object.entries(snapshot.diagnostics.matchedTables).sort(([left], [right]) => left.localeCompare(right))),
      warnings: [...snapshot.diagnostics.warnings].sort(),
      orphanMatchCount: snapshot.diagnostics.orphanMatchCount,
      unresolvedWorkerCount: snapshot.diagnostics.unresolvedWorkerCount,
    },
  });
}

function hashString(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function snapshotFingerprint(snapshot: TewSnapshot): string {
  return hashString(fingerprintPayload(snapshot));
}

export function snapshotEstimatedBytes(snapshot: TewSnapshot): number {
  return JSON.stringify(snapshot).length * 2;
}

function mappingConfidence(snapshot: TewSnapshot): SnapshotMappingConfidence {
  const mapped = Object.values(snapshot.diagnostics.matchedTables).filter(Boolean).length;
  const supportedHistory = snapshot.shows.length > 0 || snapshot.workers.length > 0 || snapshot.storylines.length > 0;
  if (supportedHistory && mapped >= 3 && snapshot.diagnostics.warnings.length <= 3) return "Good";
  if (supportedHistory && mapped >= 1) return "Limited";
  return "Poor";
}

export function createSnapshotManifest(
  snapshot: TewSnapshot,
  role: SnapshotRole = "Unclassified",
  notes = "",
  existing?: SnapshotManifestRecord,
): SnapshotManifestRecord {
  const timestamp = now();
  const mappedTableCount = Object.values(snapshot.diagnostics.matchedTables).filter(Boolean).length;
  return {
    id: existing?.id ?? snapshotVaultId("snapshot"),
    fingerprint: snapshotFingerprint(snapshot),
    fileName: snapshot.fileName,
    fileSize: snapshot.fileSize,
    databaseCreatedAt: snapshot.databaseCreatedAt,
    importedAt: snapshot.importedAt,
    role,
    notes,
    tableCount: snapshot.tables.length,
    mappedTableCount,
    workerCount: snapshot.workers.length,
    showCount: snapshot.shows.length,
    matchCount: snapshot.shows.reduce((total, show) => total + show.matches.length, 0),
    storylineCount: snapshot.storylines.length,
    warningCount: snapshot.diagnostics.warnings.length,
    mappingConfidence: mappingConfidence(snapshot),
    estimatedBytes: snapshotEstimatedBytes(snapshot),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastActivatedAt: existing?.lastActivatedAt ?? timestamp,
  };
}

function emptyPromotion(): PromotionIdentity {
  return {
    status: "Not Reviewed",
    promotionName: "",
    abbreviation: "",
    defaultBrand: "",
    defaultWeeklyShow: "",
    defaultShowLength: 60,
    calendarStartDate: "",
    activeSnapshotId: "",
    createdAt: "",
    updatedAt: "",
    completedAt: "",
  };
}

export function emptySnapshotVaultUniverse(): SnapshotVaultUniverse {
  return {
    manifest: [],
    activeSnapshotId: "",
    baselineSnapshotId: "",
    lastPostShowSnapshotId: "",
    lastReconciliationSnapshotId: "",
    lastComparisonId: "",
    comparisons: [],
    promotion: emptyPromotion(),
    workerDecisions: [],
    storylineDecisions: [],
    home: {
      activeTab: "home",
      lastSelectedHistoricalShowId: "",
      lastSelectedTewStorylineId: "",
      compareBeforeSnapshotId: "",
      compareAfterSnapshotId: "",
      lastPrimaryAction: "",
      updatedAt: "",
    },
    dataCenter: {
      retentionLimit: 12,
      storageWarningMegabytes: 80,
      lastCompleteBackupAt: "",
      lastVaultExportAt: "",
      lastRestoreAt: "",
      lastPreRestoreSafetyAt: "",
    },
  };
}

function showKey(show: ShowRecord): string {
  return show.id || `${normalizeSnapshotName(show.name)}:${show.date}`;
}

function matchKey(show: ShowRecord, match: MatchRecord): string {
  return `${showKey(show)}:${match.id || normalizeSnapshotName(match.description)}`;
}

function storylineKey(storyline: StorylineRecord): string {
  return `${storyline.sourceTable}:${storyline.id || normalizeSnapshotName(storyline.name)}`;
}

function compact(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function comparisonChange(
  kind: SnapshotComparisonChange["kind"],
  entityId: string,
  title: string,
  beforeValue: string,
  afterValue: string,
  detail: string,
): SnapshotComparisonChange {
  return { id: snapshotVaultId("snapshot-change"), kind, entityId, title, beforeValue, afterValue, detail };
}

export function compareTewSnapshots(
  beforeRecord: StoredSnapshotRecord,
  afterRecord: StoredSnapshotRecord,
): SnapshotComparisonRecord {
  const before = beforeRecord.snapshot;
  const after = afterRecord.snapshot;
  const changes: SnapshotComparisonChange[] = [];

  const beforeShows = new Map(before.shows.map((show) => [showKey(show), show]));
  const afterShows = new Map(after.shows.map((show) => [showKey(show), show]));
  for (const [key, show] of afterShows) {
    const previous = beforeShows.get(key);
    if (!previous) {
      changes.push(comparisonChange("New Show", show.id, show.name, "Not present", `${show.date} · ${show.matches.length} matches`, "A completed show is newly available in the later snapshot."));
      continue;
    }
    const fields = changedFields(
      { rating: previous.rating, attendance: previous.attendance, venue: previous.venue, company: previous.company, broadcast: previous.broadcast },
      { rating: show.rating, attendance: show.attendance, venue: show.venue, company: show.company, broadcast: show.broadcast },
    );
    if (fields.length) changes.push(comparisonChange("Changed Show", show.id, show.name, fields.map((field) => `${field}: ${compact((previous as unknown as Record<string, unknown>)[field])}`).join(" · "), fields.map((field) => `${field}: ${compact((show as unknown as Record<string, unknown>)[field])}`).join(" · "), `Changed supported show fields: ${fields.join(", ")}.`));
  }
  for (const [key, show] of beforeShows) if (!afterShows.has(key)) changes.push(comparisonChange("Removed Show", show.id, show.name, `${show.date} · ${show.matches.length} matches`, "Not detected", "The later snapshot no longer exposes this supported historical show record."));

  const beforeMatches = new Map(before.shows.flatMap((show) => show.matches.map((match) => [matchKey(show, match), { show, match }] as const)));
  const afterMatches = new Map(after.shows.flatMap((show) => show.matches.map((match) => [matchKey(show, match), { show, match }] as const)));
  for (const [key, current] of afterMatches) {
    const previous = beforeMatches.get(key);
    if (!previous) {
      changes.push(comparisonChange("New Match", current.match.id, current.match.description, "Not present", `${current.match.winner || "Winner unavailable"} · ${current.match.rating ?? "Unrated"}`, `New match history detected on ${current.show.name}.`));
      continue;
    }
    const fields = changedFields(
      { winner: previous.match.winner, rating: previous.match.rating, matchTime: previous.match.matchTime, notes: previous.match.notes, description: previous.match.description },
      { winner: current.match.winner, rating: current.match.rating, matchTime: current.match.matchTime, notes: current.match.notes, description: current.match.description },
    );
    if (fields.length) changes.push(comparisonChange("Changed Match", current.match.id, current.match.description, fields.map((field) => `${field}: ${compact((previous.match as unknown as Record<string, unknown>)[field])}`).join(" · "), fields.map((field) => `${field}: ${compact((current.match as unknown as Record<string, unknown>)[field])}`).join(" · "), `Changed supported match fields: ${fields.join(", ")}.`));
  }
  for (const [key, previous] of beforeMatches) if (!afterMatches.has(key)) changes.push(comparisonChange("Removed Match", previous.match.id, previous.match.description, `${previous.match.winner || "Winner unavailable"} · ${previous.match.rating ?? "Unrated"}`, "Not detected", `The later snapshot no longer exposes this match from ${previous.show.name}.`));

  const beforeWorkers = new Map(before.workers.map((worker) => [worker.id || normalizeSnapshotName(worker.name), worker]));
  const afterWorkers = new Map(after.workers.map((worker) => [worker.id || normalizeSnapshotName(worker.name), worker]));
  for (const [key, worker] of afterWorkers) if (!beforeWorkers.has(key)) changes.push(comparisonChange("New Worker", worker.id, worker.name, "Not detected", `${worker.role || "Role unavailable"}`, "A worker identity is newly available."));
  for (const [key, worker] of beforeWorkers) if (!afterWorkers.has(key)) changes.push(comparisonChange("Missing Worker", worker.id, worker.name, `${worker.role || "Role unavailable"}`, "Not detected", "The worker was not detected in the later snapshot. No tracker profile is deleted."));

  const beforeStorylines = new Map(before.storylines.map((storyline) => [storylineKey(storyline), storyline]));
  const afterStorylines = new Map(after.storylines.map((storyline) => [storylineKey(storyline), storyline]));
  for (const [key, storyline] of afterStorylines) {
    const previous = beforeStorylines.get(key);
    if (!previous) {
      changes.push(comparisonChange("New Storyline", storyline.id, storyline.name, "Not detected", `${storyline.status || "Status unavailable"} · Heat ${storyline.heat ?? "—"}`, `New storyline record detected in ${storyline.sourceTable}.`));
      continue;
    }
    const beforeParticipants = stableSort(previous.workers.map((worker) => `${worker.id}:${worker.name}:${worker.role}`), (value) => value);
    const afterParticipants = stableSort(storyline.workers.map((worker) => `${worker.id}:${worker.name}:${worker.role}`), (value) => value);
    const fields = changedFields(
      { name: previous.name, description: previous.description, status: previous.status, heat: previous.heat, participants: beforeParticipants },
      { name: storyline.name, description: storyline.description, status: storyline.status, heat: storyline.heat, participants: afterParticipants },
    );
    if (fields.length) changes.push(comparisonChange("Changed Storyline", storyline.id, storyline.name, fields.map((field) => `${field}: ${compact(field === "participants" ? beforeParticipants : (previous as unknown as Record<string, unknown>)[field])}`).join(" · "), fields.map((field) => `${field}: ${compact(field === "participants" ? afterParticipants : (storyline as unknown as Record<string, unknown>)[field])}`).join(" · "), `Changed supported storyline fields: ${fields.join(", ")}.`));
  }
  for (const [key, storyline] of beforeStorylines) if (!afterStorylines.has(key)) changes.push(comparisonChange("Missing Storyline", storyline.id, storyline.name, storyline.status || "Status unavailable", "Not detected", "The storyline was not detected in the later snapshot. No tracker storyline is deleted."));

  const mappingKeys = new Set([...Object.keys(before.diagnostics.matchedTables), ...Object.keys(after.diagnostics.matchedTables)]);
  for (const key of mappingKeys) {
    const previous = before.diagnostics.matchedTables[key] ?? null;
    const current = after.diagnostics.matchedTables[key] ?? null;
    if (previous !== current) changes.push(comparisonChange("Mapping Changed", key, key, compact(previous), compact(current), "A supported mapper table changed between snapshots."));
  }
  const beforeWarnings = new Set(before.diagnostics.warnings);
  const afterWarnings = new Set(after.diagnostics.warnings);
  for (const warning of afterWarnings) if (!beforeWarnings.has(warning)) changes.push(comparisonChange("Warning Added", hashString(warning), "New mapping warning", "Not present", warning, "The later snapshot introduced a mapper or import warning."));
  for (const warning of beforeWarnings) if (!afterWarnings.has(warning)) changes.push(comparisonChange("Warning Resolved", hashString(warning), "Resolved mapping warning", warning, "No longer present", "A warning from the earlier snapshot is no longer present."));

  return {
    id: snapshotVaultId("snapshot-comparison"),
    beforeSnapshotId: beforeRecord.id,
    afterSnapshotId: afterRecord.id,
    beforeFileName: before.fileName,
    afterFileName: after.fileName,
    createdAt: now(),
    newShowIds: changes.filter((change) => change.kind === "New Show").map((change) => change.entityId),
    changedShowIds: changes.filter((change) => change.kind === "Changed Show").map((change) => change.entityId),
    newMatchIds: changes.filter((change) => change.kind === "New Match").map((change) => change.entityId),
    changedMatchIds: changes.filter((change) => change.kind === "Changed Match").map((change) => change.entityId),
    newWorkerIds: changes.filter((change) => change.kind === "New Worker").map((change) => change.entityId),
    missingWorkerIds: changes.filter((change) => change.kind === "Missing Worker").map((change) => change.entityId),
    newStorylineIds: changes.filter((change) => change.kind === "New Storyline").map((change) => change.entityId),
    changedStorylineIds: changes.filter((change) => change.kind === "Changed Storyline").map((change) => change.entityId),
    mappingChangeCount: changes.filter((change) => change.kind === "Mapping Changed").length,
    warningChangeCount: changes.filter((change) => change.kind === "Warning Added" || change.kind === "Warning Resolved").length,
    changes,
  };
}

export function updateSnapshotManifest(
  universe: SnapshotVaultUniverse,
  snapshotId: string,
  patch: Partial<Pick<SnapshotManifestRecord, "role" | "notes" | "lastActivatedAt">>,
): SnapshotVaultUniverse {
  const timestamp = now();
  const manifest = universe.manifest.map((record) => record.id === snapshotId ? { ...record, ...patch, updatedAt: timestamp } : record);
  const role = patch.role;
  return {
    ...universe,
    manifest,
    baselineSnapshotId: role === "Baseline" ? snapshotId : universe.baselineSnapshotId,
    lastPostShowSnapshotId: role === "After Show" ? snapshotId : universe.lastPostShowSnapshotId,
  };
}

export function setActiveSnapshot(universe: SnapshotVaultUniverse, snapshotId: string): SnapshotVaultUniverse {
  if (!universe.manifest.some((record) => record.id === snapshotId)) return universe;
  const timestamp = now();
  return {
    ...universe,
    activeSnapshotId: snapshotId,
    manifest: universe.manifest.map((record) => record.id === snapshotId ? { ...record, lastActivatedAt: timestamp, updatedAt: timestamp } : record),
    promotion: { ...universe.promotion, activeSnapshotId: snapshotId, updatedAt: timestamp },
  };
}

export function promotionCompanyCandidates(snapshot: TewSnapshot | null): Array<{ name: string; showCount: number }> {
  if (!snapshot) return [];
  const counts = new Map<string, { name: string; showCount: number }>();
  for (const show of snapshot.shows) {
    const normalized = normalizeSnapshotName(show.company);
    if (!normalized) continue;
    const existing = counts.get(normalized);
    if (existing) existing.showCount += 1;
    else counts.set(normalized, { name: show.company, showCount: 1 });
  }
  return [...counts.values()].sort((left, right) => right.showCount - left.showCount || left.name.localeCompare(right.name));
}

export function buildWorkerIdentityCandidates(snapshot: TewSnapshot | null, profiles: MatchEngineProfile[]): WorkerIdentityCandidate[] {
  if (!snapshot) return [];
  return snapshot.workers.map((worker) => {
    const exactIdProfileKeys = profiles.filter((profile) => profile.workerSource === "tew" && profile.workerId === worker.id).map((profile) => profile.workerKey);
    const exactNameProfileKeys = profiles.filter((profile) => normalizeSnapshotName(profile.workerName) === normalizeSnapshotName(worker.name)).map((profile) => profile.workerKey);
    const candidateProfileKeys = [...new Set([...exactIdProfileKeys, ...exactNameProfileKeys])];
    const conflict = exactIdProfileKeys.length > 1 || (exactIdProfileKeys.length === 0 && exactNameProfileKeys.length > 1);
    return {
      tewWorkerId: worker.id,
      tewWorkerName: worker.name,
      exactIdProfileKeys,
      exactNameProfileKeys,
      candidateProfileKeys,
      recommendedDecision: conflict ? "Ambiguous" : exactIdProfileKeys.length === 1 ? "Confirmed Existing Link" : exactNameProfileKeys.length === 1 ? "Linked Existing Profile" : "Created Identity-Only Profile",
      conflict,
    };
  }).sort((left, right) => left.tewWorkerName.localeCompare(right.tewWorkerName));
}

export function buildStorylineIdentityCandidates(snapshot: TewSnapshot | null, storylines: TrackerStoryline[]): StorylineIdentityCandidate[] {
  if (!snapshot) return [];
  return snapshot.storylines.map((storyline) => {
    const linkedTrackerStorylineIds = storylines.filter((tracker) => tracker.referenceLinks.some((link) => link.source === "tew" && link.referenceId === storyline.id)).map((tracker) => tracker.id);
    const exactNameStorylineIds = storylines.filter((tracker) => normalizeSnapshotName(tracker.name) === normalizeSnapshotName(storyline.name)).map((tracker) => tracker.id);
    const candidateStorylineIds = [...new Set([...linkedTrackerStorylineIds, ...exactNameStorylineIds])];
    const conflict = linkedTrackerStorylineIds.length > 1 || (linkedTrackerStorylineIds.length === 0 && exactNameStorylineIds.length > 1);
    return {
      tewStorylineId: storyline.id,
      tewStorylineName: storyline.name,
      linkedTrackerStorylineIds,
      exactNameStorylineIds,
      candidateStorylineIds,
      recommendedDecision: conflict ? "Ambiguous" : linkedTrackerStorylineIds.length === 1 || exactNameStorylineIds.length === 1 ? "Linked Existing Storyline" : "Created Tracker Storyline",
      conflict,
    };
  }).sort((left, right) => left.tewStorylineName.localeCompare(right.tewStorylineName));
}

export function upsertWorkerIdentityDecision(universe: SnapshotVaultUniverse, decision: WorkerIdentityDecision): SnapshotVaultUniverse {
  return {
    ...universe,
    workerDecisions: universe.workerDecisions.some((item) => item.snapshotId === decision.snapshotId && item.tewWorkerId === decision.tewWorkerId)
      ? universe.workerDecisions.map((item) => item.snapshotId === decision.snapshotId && item.tewWorkerId === decision.tewWorkerId ? decision : item)
      : [decision, ...universe.workerDecisions],
  };
}

export function upsertStorylineIdentityDecision(universe: SnapshotVaultUniverse, decision: StorylineIdentityDecision): SnapshotVaultUniverse {
  return {
    ...universe,
    storylineDecisions: universe.storylineDecisions.some((item) => item.snapshotId === decision.snapshotId && item.tewStorylineId === decision.tewStorylineId)
      ? universe.storylineDecisions.map((item) => item.snapshotId === decision.snapshotId && item.tewStorylineId === decision.tewStorylineId ? decision : item)
      : [decision, ...universe.storylineDecisions],
  };
}

export function createWorkerIdentityDecision(input: Omit<WorkerIdentityDecision, "id" | "createdAt" | "updatedAt">, existing?: WorkerIdentityDecision): WorkerIdentityDecision {
  const timestamp = now();
  return { ...input, id: existing?.id ?? snapshotVaultId("worker-link"), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
}

export function createStorylineIdentityDecision(input: Omit<StorylineIdentityDecision, "id" | "createdAt" | "updatedAt">, existing?: StorylineIdentityDecision): StorylineIdentityDecision {
  const timestamp = now();
  return { ...input, id: existing?.id ?? snapshotVaultId("storyline-link"), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
}

export function buildSnapshotSafetyWarnings(
  active: StoredSnapshotRecord | null,
  universe: SnapshotVaultUniverse,
  plannedShows: PlannedShow[],
): SnapshotSafetyWarning[] {
  if (!active) return [{ id: "no-active-snapshot", severity: "Important", title: "No active TEW snapshot", detail: "Import or activate a parsed read-only TEW snapshot before using history-dependent workflows.", snapshotId: "", showId: "" }];
  const warnings: SnapshotSafetyWarning[] = [];
  const snapshot = active.snapshot;
  if (snapshot.shows.length === 0) warnings.push({ id: "no-history", severity: "Blocking", title: "Active snapshot has no supported show history", detail: "Result intake cannot use this snapshot until a supported show-history table is mapped.", snapshotId: active.id, showId: "" });
  if (snapshot.diagnostics.warnings.length > 0) warnings.push({ id: "mapping-warnings", severity: snapshot.diagnostics.warnings.length >= 5 ? "Important" : "Informational", title: `${snapshot.diagnostics.warnings.length} snapshot mapping warning${snapshot.diagnostics.warnings.length === 1 ? "" : "s"}`, detail: snapshot.diagnostics.warnings.slice(0, 3).join(" · "), snapshotId: active.id, showId: "" });
  const importedTime = new Date(snapshot.importedAt).getTime();
  for (const show of plannedShows.filter((item) => item.reconciliation)) {
    const showTime = new Date(`${show.date}T23:59:59Z`).getTime();
    if (Number.isFinite(importedTime) && Number.isFinite(showTime) && importedTime < showTime) warnings.push({ id: `snapshot-predates-show:${show.id}`, severity: "Blocking", title: `Snapshot predates ${show.name}`, detail: "Use a TEW snapshot created after the show before confirming results or Wrap-Up history.", snapshotId: active.id, showId: show.id });
    const sourceFile = show.reconciliation?.actualShow.sourceFile;
    if (sourceFile && sourceFile !== snapshot.fileName) warnings.push({ id: `different-reconciliation-source:${show.id}`, severity: "Informational", title: `${show.name} was reconciled from a different snapshot`, detail: `Stored source: ${sourceFile}. Active snapshot: ${snapshot.fileName}.`, snapshotId: active.id, showId: show.id });
  }
  const latestComparison = universe.comparisons.find((comparison) => comparison.id === universe.lastComparisonId);
  if (latestComparison?.changedMatchIds.length) warnings.push({ id: "changed-history", severity: "Important", title: `${latestComparison.changedMatchIds.length} previously detected match result${latestComparison.changedMatchIds.length === 1 ? " changed" : "s changed"}`, detail: "Review the latest snapshot comparison before relying on existing planned-versus-actual records.", snapshotId: active.id, showId: "" });
  const manifest = universe.manifest.find((record) => record.id === active.id);
  if (manifest && manifest.estimatedBytes >= universe.dataCenter.storageWarningMegabytes * 1024 * 1024) warnings.push({ id: "snapshot-large", severity: "Informational", title: "Active parsed snapshot is large", detail: `This parsed snapshot is approximately ${(manifest.estimatedBytes / 1024 / 1024).toFixed(1)} MB. Review Snapshot Vault retention settings.`, snapshotId: active.id, showId: "" });
  return warnings;
}

export function updatePromotionIdentity(universe: SnapshotVaultUniverse, patch: Partial<PromotionIdentity>, complete = false): SnapshotVaultUniverse {
  const timestamp = now();
  return {
    ...universe,
    promotion: {
      ...universe.promotion,
      ...patch,
      status: complete ? "Completed" : universe.promotion.status === "Not Reviewed" ? "In Progress" : universe.promotion.status,
      createdAt: universe.promotion.createdAt || timestamp,
      updatedAt: timestamp,
      completedAt: complete ? timestamp : universe.promotion.completedAt,
    },
  };
}
