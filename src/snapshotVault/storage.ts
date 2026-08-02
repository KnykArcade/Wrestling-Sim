import type { TewSnapshot } from "../tew/types";
import {
  compareTewSnapshots,
  createSnapshotManifest,
  emptySnapshotVaultUniverse,
  setActiveSnapshot,
  snapshotFingerprint,
} from "./model";
import type {
  SnapshotComparisonRecord,
  SnapshotManifestRecord,
  SnapshotRole,
  SnapshotVaultImportResult,
  SnapshotVaultPackage,
  SnapshotVaultStorageEstimate,
  SnapshotVaultUniverse,
  StoredSnapshotRecord,
  StorylineIdentityDecision,
  WorkerIdentityDecision,
} from "./types";

export const SNAPSHOT_VAULT_STORAGE_KEY = "tew-story-tracker:snapshot-vault-manifest:v1";
export const PRE_RESTORE_SAFETY_KEY = "tew-story-tracker:pre-restore-safety:v1";
const DB_NAME = "tew-story-tracker-snapshot-vault";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";

export interface SnapshotStore {
  put(record: StoredSnapshotRecord): Promise<void>;
  get(id: string): Promise<StoredSnapshotRecord | null>;
  getAll(): Promise<StoredSnapshotRecord[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser could not open the TEW Snapshot Vault."));
    request.onblocked = () => reject(new Error("The TEW Snapshot Vault is blocked by another browser tab."));
  });
  return databasePromise;
}

class IndexedDbSnapshotStore implements SnapshotStore {
  async put(record: StoredSnapshotRecord): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }

  async get(id: string): Promise<StoredSnapshotRecord | null> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestValue(transaction.objectStore(STORE_NAME).get(id));
    await transactionDone(transaction);
    return (value as StoredSnapshotRecord | undefined) ?? null;
  }

  async getAll(): Promise<StoredSnapshotRecord[]> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const values = await requestValue(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return (values as StoredSnapshotRecord[]).sort((left, right) => right.manifest.importedAt.localeCompare(left.manifest.importedAt));
  }

  async delete(id: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  }
}

export function createMemorySnapshotStore(initial: StoredSnapshotRecord[] = []): SnapshotStore {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  return {
    async put(record) { records.set(record.id, structuredClone(record)); },
    async get(id) { const record = records.get(id); return record ? structuredClone(record) : null; },
    async getAll() { return [...records.values()].map((record) => structuredClone(record)); },
    async delete(id) { records.delete(id); },
    async clear() { records.clear(); },
  };
}

let defaultStore: SnapshotStore | null = null;

export function browserSnapshotStore(): SnapshotStore {
  if (!defaultStore) defaultStore = typeof indexedDB === "undefined" ? createMemorySnapshotStore() : new IndexedDbSnapshotStore();
  return defaultStore;
}

function normalizeManifest(value: unknown): SnapshotManifestRecord | null {
  if (!isRecord(value) || !text(value.id) || !text(value.fingerprint)) return null;
  const roles: SnapshotRole[] = ["Current TEW Save", "Baseline", "Before Show", "After Show", "Historical Reference", "Unclassified"];
  const confidence: SnapshotManifestRecord["mappingConfidence"][] = ["Good", "Limited", "Poor"];
  return {
    id: text(value.id),
    fingerprint: text(value.fingerprint),
    fileName: text(value.fileName),
    fileSize: Math.max(0, numberValue(value.fileSize)),
    databaseCreatedAt: text(value.databaseCreatedAt),
    importedAt: text(value.importedAt),
    role: enumValue(value.role, roles, "Unclassified"),
    notes: text(value.notes),
    tableCount: Math.max(0, numberValue(value.tableCount)),
    mappedTableCount: Math.max(0, numberValue(value.mappedTableCount)),
    workerCount: Math.max(0, numberValue(value.workerCount)),
    showCount: Math.max(0, numberValue(value.showCount)),
    matchCount: Math.max(0, numberValue(value.matchCount)),
    storylineCount: Math.max(0, numberValue(value.storylineCount)),
    warningCount: Math.max(0, numberValue(value.warningCount)),
    mappingConfidence: enumValue(value.mappingConfidence, confidence, "Poor"),
    estimatedBytes: Math.max(0, numberValue(value.estimatedBytes)),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
    lastActivatedAt: text(value.lastActivatedAt),
  };
}

function normalizeComparisonChange(value: unknown): SnapshotComparisonRecord["changes"][number] | null {
  if (!isRecord(value) || !text(value.id) || !text(value.kind)) return null;
  const kinds: SnapshotComparisonRecord["changes"][number]["kind"][] = ["New Show", "Removed Show", "Changed Show", "New Match", "Removed Match", "Changed Match", "New Worker", "Missing Worker", "New Storyline", "Missing Storyline", "Changed Storyline", "Mapping Changed", "Warning Added", "Warning Resolved"];
  if (!kinds.includes(value.kind as SnapshotComparisonRecord["changes"][number]["kind"])) return null;
  return {
    id: text(value.id),
    kind: value.kind as SnapshotComparisonRecord["changes"][number]["kind"],
    entityId: text(value.entityId),
    title: text(value.title),
    beforeValue: text(value.beforeValue),
    afterValue: text(value.afterValue),
    detail: text(value.detail),
  };
}

function normalizeComparison(value: unknown): SnapshotComparisonRecord | null {
  if (!isRecord(value) || !text(value.id) || !text(value.beforeSnapshotId) || !text(value.afterSnapshotId)) return null;
  return {
    id: text(value.id),
    beforeSnapshotId: text(value.beforeSnapshotId),
    afterSnapshotId: text(value.afterSnapshotId),
    beforeFileName: text(value.beforeFileName),
    afterFileName: text(value.afterFileName),
    createdAt: text(value.createdAt),
    newShowIds: stringArray(value.newShowIds),
    changedShowIds: stringArray(value.changedShowIds),
    newMatchIds: stringArray(value.newMatchIds),
    changedMatchIds: stringArray(value.changedMatchIds),
    newWorkerIds: stringArray(value.newWorkerIds),
    missingWorkerIds: stringArray(value.missingWorkerIds),
    newStorylineIds: stringArray(value.newStorylineIds),
    changedStorylineIds: stringArray(value.changedStorylineIds),
    mappingChangeCount: Math.max(0, numberValue(value.mappingChangeCount)),
    warningChangeCount: Math.max(0, numberValue(value.warningChangeCount)),
    changes: Array.isArray(value.changes) ? value.changes.map(normalizeComparisonChange).filter((item): item is SnapshotComparisonRecord["changes"][number] => item !== null) : [],
  };
}

function normalizeWorkerDecision(value: unknown): WorkerIdentityDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.snapshotId) || !text(value.tewWorkerId)) return null;
  const decisions: WorkerIdentityDecision["decision"][] = ["Confirmed Existing Link", "Linked Existing Profile", "Created Identity-Only Profile", "Ignored", "Ambiguous", "Unresolved", "Preserve Tracker Name", "Update TEW Display Name"];
  return {
    id: text(value.id),
    snapshotId: text(value.snapshotId),
    tewWorkerId: text(value.tewWorkerId),
    tewWorkerName: text(value.tewWorkerName),
    decision: enumValue(value.decision, decisions, "Unresolved"),
    profileKey: text(value.profileKey),
    candidateProfileKeys: stringArray(value.candidateProfileKeys),
    note: text(value.note),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

function normalizeStorylineDecision(value: unknown): StorylineIdentityDecision | null {
  if (!isRecord(value) || !text(value.id) || !text(value.snapshotId) || !text(value.tewStorylineId)) return null;
  const decisions: StorylineIdentityDecision["decision"][] = ["Linked Existing Storyline", "Created Tracker Storyline", "Ignored", "Historical Only", "Ambiguous", "Unresolved", "Preserve Tracker Details", "Update Imported Fields"];
  return {
    id: text(value.id),
    snapshotId: text(value.snapshotId),
    tewStorylineId: text(value.tewStorylineId),
    tewStorylineName: text(value.tewStorylineName),
    decision: enumValue(value.decision, decisions, "Unresolved"),
    trackerStorylineId: text(value.trackerStorylineId),
    candidateStorylineIds: stringArray(value.candidateStorylineIds),
    importedStatus: text(value.importedStatus),
    importedHeat: typeof value.importedHeat === "number" && Number.isFinite(value.importedHeat) ? value.importedHeat : null,
    note: text(value.note),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  };
}

export function parseSnapshotVaultUniverse(value: unknown): SnapshotVaultUniverse {
  const defaults = emptySnapshotVaultUniverse();
  if (!isRecord(value)) return defaults;
  const promotion = isRecord(value.promotion) ? value.promotion : {};
  const home = isRecord(value.home) ? value.home : {};
  const dataCenter = isRecord(value.dataCenter) ? value.dataCenter : {};
  const tabs: SnapshotVaultUniverse["home"]["activeTab"][] = ["home", "vault", "onboarding", "data"];
  const onboardingStatuses: SnapshotVaultUniverse["promotion"]["status"][] = ["Not Reviewed", "In Progress", "Completed"];
  return {
    manifest: Array.isArray(value.manifest) ? value.manifest.map(normalizeManifest).filter((item): item is SnapshotManifestRecord => item !== null) : [],
    activeSnapshotId: text(value.activeSnapshotId),
    baselineSnapshotId: text(value.baselineSnapshotId),
    lastPostShowSnapshotId: text(value.lastPostShowSnapshotId),
    lastReconciliationSnapshotId: text(value.lastReconciliationSnapshotId),
    lastComparisonId: text(value.lastComparisonId),
    comparisons: Array.isArray(value.comparisons) ? value.comparisons.map(normalizeComparison).filter((item): item is SnapshotComparisonRecord => item !== null).slice(0, 80) : [],
    promotion: {
      status: enumValue(promotion.status, onboardingStatuses, defaults.promotion.status),
      promotionName: text(promotion.promotionName),
      abbreviation: text(promotion.abbreviation),
      defaultBrand: text(promotion.defaultBrand),
      defaultWeeklyShow: text(promotion.defaultWeeklyShow),
      defaultShowLength: Math.max(15, numberValue(promotion.defaultShowLength, 60)),
      calendarStartDate: text(promotion.calendarStartDate),
      activeSnapshotId: text(promotion.activeSnapshotId),
      createdAt: text(promotion.createdAt),
      updatedAt: text(promotion.updatedAt),
      completedAt: text(promotion.completedAt),
    },
    workerDecisions: Array.isArray(value.workerDecisions) ? value.workerDecisions.map(normalizeWorkerDecision).filter((item): item is WorkerIdentityDecision => item !== null) : [],
    storylineDecisions: Array.isArray(value.storylineDecisions) ? value.storylineDecisions.map(normalizeStorylineDecision).filter((item): item is StorylineIdentityDecision => item !== null) : [],
    home: {
      activeTab: enumValue(home.activeTab, tabs, defaults.home.activeTab),
      lastSelectedHistoricalShowId: text(home.lastSelectedHistoricalShowId),
      lastSelectedTewStorylineId: text(home.lastSelectedTewStorylineId),
      compareBeforeSnapshotId: text(home.compareBeforeSnapshotId),
      compareAfterSnapshotId: text(home.compareAfterSnapshotId),
      lastPrimaryAction: text(home.lastPrimaryAction),
      updatedAt: text(home.updatedAt),
    },
    dataCenter: {
      retentionLimit: Math.max(1, Math.min(100, Math.floor(numberValue(dataCenter.retentionLimit, 12)))),
      storageWarningMegabytes: Math.max(5, Math.min(2048, numberValue(dataCenter.storageWarningMegabytes, 80))),
      lastCompleteBackupAt: text(dataCenter.lastCompleteBackupAt),
      lastVaultExportAt: text(dataCenter.lastVaultExportAt),
      lastRestoreAt: text(dataCenter.lastRestoreAt),
      lastPreRestoreSafetyAt: text(dataCenter.lastPreRestoreSafetyAt),
    },
  };
}

export function loadSnapshotVaultUniverse(storage: Pick<Storage, "getItem">): SnapshotVaultUniverse {
  const raw = storage.getItem(SNAPSHOT_VAULT_STORAGE_KEY);
  if (!raw) return emptySnapshotVaultUniverse();
  try { return parseSnapshotVaultUniverse(JSON.parse(raw) as unknown); } catch { return emptySnapshotVaultUniverse(); }
}

export function saveSnapshotVaultUniverse(storage: Pick<Storage, "setItem">, universe: SnapshotVaultUniverse): void {
  storage.setItem(SNAPSHOT_VAULT_STORAGE_KEY, JSON.stringify(universe));
}

function isTewSnapshot(value: unknown): value is TewSnapshot {
  return isRecord(value) && typeof value.fileName === "string" && typeof value.fileSize === "number" && Array.isArray(value.tables) && Array.isArray(value.workers) && Array.isArray(value.shows) && Array.isArray(value.storylines) && isRecord(value.diagnostics);
}

function normalizeStoredRecord(value: unknown): StoredSnapshotRecord | null {
  if (!isRecord(value) || !text(value.id) || !isTewSnapshot(value.snapshot)) return null;
  const manifest = normalizeManifest(value.manifest) ?? createSnapshotManifest(value.snapshot, "Unclassified", "", { id: text(value.id) } as SnapshotManifestRecord);
  return { id: text(value.id), manifest, snapshot: value.snapshot };
}

export function parseSnapshotVaultPackage(textValue: string): SnapshotVaultPackage {
  let value: unknown;
  try { value = JSON.parse(textValue) as unknown; } catch { throw new Error("The selected Snapshot Vault package is not valid JSON."); }
  if (!isRecord(value) || value.product !== "TEW IX Snapshot Vault" || value.version !== 1 || !Array.isArray(value.records)) throw new Error("The selected file is not a supported TEW Snapshot Vault package.");
  const records = value.records.map(normalizeStoredRecord);
  if (records.some((record) => record === null)) throw new Error("The Snapshot Vault package contains an unsupported parsed snapshot record.");
  const universe = parseSnapshotVaultUniverse(value.universe);
  return { product: "TEW IX Snapshot Vault", version: 1, exportedAt: text(value.exportedAt), universe, records: records as StoredSnapshotRecord[] };
}

async function enforceRetention(universe: SnapshotVaultUniverse, store: SnapshotStore): Promise<SnapshotVaultUniverse> {
  const limit = Math.max(1, universe.dataCenter.retentionLimit);
  if (universe.manifest.length <= limit) return universe;
  const protectedIds = new Set([universe.activeSnapshotId, universe.baselineSnapshotId, universe.lastPostShowSnapshotId, universe.lastReconciliationSnapshotId].filter(Boolean));
  const candidates = [...universe.manifest].sort((left, right) => left.lastActivatedAt.localeCompare(right.lastActivatedAt) || left.importedAt.localeCompare(right.importedAt)).filter((record) => !protectedIds.has(record.id));
  const removeCount = Math.max(0, universe.manifest.length - limit);
  const removing = candidates.slice(0, removeCount);
  for (const record of removing) await store.delete(record.id);
  const removedIds = new Set(removing.map((record) => record.id));
  return { ...universe, manifest: universe.manifest.filter((record) => !removedIds.has(record.id)) };
}

export async function importTewSnapshotToVault(
  snapshot: TewSnapshot,
  universe: SnapshotVaultUniverse,
  role: SnapshotRole = universe.manifest.length === 0 ? "Current TEW Save" : "After Show",
  notes = "",
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultImportResult> {
  const fingerprint = snapshotFingerprint(snapshot);
  const duplicateManifest = universe.manifest.find((record) => record.fingerprint === fingerprint);
  if (duplicateManifest) {
    const existing = await store.get(duplicateManifest.id);
    const manifest = createSnapshotManifest(snapshot, role || duplicateManifest.role, notes || duplicateManifest.notes, duplicateManifest);
    const record = { id: duplicateManifest.id, manifest, snapshot };
    await store.put(record);
    let nextUniverse = setActiveSnapshot({ ...universe, manifest: universe.manifest.map((item) => item.id === manifest.id ? manifest : item) }, manifest.id);
    if (role === "Baseline") nextUniverse = { ...nextUniverse, baselineSnapshotId: manifest.id };
    if (role === "After Show") nextUniverse = { ...nextUniverse, lastPostShowSnapshotId: manifest.id };
    return { universe: nextUniverse, record: existing ? { ...existing, manifest, snapshot } : record, duplicate: true, comparison: null };
  }

  const manifest = createSnapshotManifest(snapshot, role, notes);
  const record: StoredSnapshotRecord = { id: manifest.id, manifest, snapshot };
  const previous = universe.activeSnapshotId ? await store.get(universe.activeSnapshotId) : null;
  await store.put(record);
  const comparison = previous ? compareTewSnapshots(previous, record) : null;
  let nextUniverse: SnapshotVaultUniverse = {
    ...universe,
    manifest: [manifest, ...universe.manifest],
    activeSnapshotId: manifest.id,
    baselineSnapshotId: role === "Baseline" || !universe.baselineSnapshotId ? manifest.id : universe.baselineSnapshotId,
    lastPostShowSnapshotId: role === "After Show" ? manifest.id : universe.lastPostShowSnapshotId,
    lastComparisonId: comparison?.id ?? universe.lastComparisonId,
    comparisons: comparison ? [comparison, ...universe.comparisons].slice(0, 80) : universe.comparisons,
    promotion: { ...universe.promotion, activeSnapshotId: manifest.id, updatedAt: new Date().toISOString() },
    home: {
      ...universe.home,
      compareBeforeSnapshotId: previous?.id ?? universe.home.compareBeforeSnapshotId,
      compareAfterSnapshotId: manifest.id,
      updatedAt: new Date().toISOString(),
    },
  };
  nextUniverse = await enforceRetention(nextUniverse, store);
  return { universe: nextUniverse, record, duplicate: false, comparison };
}

export async function activateStoredSnapshot(
  snapshotId: string,
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<{ universe: SnapshotVaultUniverse; record: StoredSnapshotRecord | null }> {
  const record = await store.get(snapshotId);
  return { universe: record ? setActiveSnapshot(universe, snapshotId) : universe, record };
}

export async function updateStoredSnapshotManifest(
  universe: SnapshotVaultUniverse,
  snapshotId: string,
  patch: Partial<Pick<SnapshotManifestRecord, "role" | "notes">>,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultUniverse> {
  const current = universe.manifest.find((record) => record.id === snapshotId);
  if (!current) return universe;
  const manifest: SnapshotManifestRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const stored = await store.get(snapshotId);
  if (stored) await store.put({ ...stored, manifest });
  return {
    ...universe,
    manifest: universe.manifest.map((record) => record.id === snapshotId ? manifest : record),
    baselineSnapshotId: manifest.role === "Baseline" ? snapshotId : universe.baselineSnapshotId === snapshotId && manifest.role !== "Baseline" ? "" : universe.baselineSnapshotId,
    lastPostShowSnapshotId: manifest.role === "After Show" ? snapshotId : universe.lastPostShowSnapshotId,
  };
}

export async function compareStoredSnapshots(
  beforeSnapshotId: string,
  afterSnapshotId: string,
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<{ universe: SnapshotVaultUniverse; comparison: SnapshotComparisonRecord }> {
  if (!beforeSnapshotId || !afterSnapshotId || beforeSnapshotId === afterSnapshotId) throw new Error("Choose two different stored snapshots to compare.");
  const [before, after] = await Promise.all([store.get(beforeSnapshotId), store.get(afterSnapshotId)]);
  if (!before || !after) throw new Error("One or both parsed snapshots are missing from IndexedDB. Restore the Snapshot Vault package before comparing them.");
  const comparison = compareTewSnapshots(before, after);
  return {
    comparison,
    universe: {
      ...universe,
      lastComparisonId: comparison.id,
      comparisons: [comparison, ...universe.comparisons].slice(0, 80),
      home: { ...universe.home, compareBeforeSnapshotId: beforeSnapshotId, compareAfterSnapshotId: afterSnapshotId, updatedAt: new Date().toISOString() },
    },
  };
}

export async function removeStoredSnapshot(
  snapshotId: string,
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultUniverse> {
  await store.delete(snapshotId);
  const manifest = universe.manifest.filter((record) => record.id !== snapshotId);
  const nextActive = universe.activeSnapshotId === snapshotId ? manifest[0]?.id ?? "" : universe.activeSnapshotId;
  return {
    ...universe,
    manifest,
    activeSnapshotId: nextActive,
    baselineSnapshotId: universe.baselineSnapshotId === snapshotId ? "" : universe.baselineSnapshotId,
    lastPostShowSnapshotId: universe.lastPostShowSnapshotId === snapshotId ? "" : universe.lastPostShowSnapshotId,
    lastReconciliationSnapshotId: universe.lastReconciliationSnapshotId === snapshotId ? "" : universe.lastReconciliationSnapshotId,
    promotion: { ...universe.promotion, activeSnapshotId: universe.promotion.activeSnapshotId === snapshotId ? nextActive : universe.promotion.activeSnapshotId },
  };
}

export async function clearStoredSnapshots(
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultUniverse> {
  await store.clear();
  return {
    ...universe,
    manifest: [],
    activeSnapshotId: "",
    baselineSnapshotId: "",
    lastPostShowSnapshotId: "",
    lastReconciliationSnapshotId: "",
    lastComparisonId: "",
    comparisons: [],
    promotion: { ...universe.promotion, activeSnapshotId: "", updatedAt: new Date().toISOString() },
  };
}

export async function exportSnapshotVaultPackage(
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultPackage> {
  const records = await store.getAll();
  const included = new Set(universe.manifest.map((record) => record.id));
  return {
    product: "TEW IX Snapshot Vault",
    version: 1,
    exportedAt: new Date().toISOString(),
    universe,
    records: records.filter((record) => included.has(record.id)),
  };
}

export async function importSnapshotVaultPackage(
  packageValue: SnapshotVaultPackage,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultUniverse> {
  await store.clear();
  for (const record of packageValue.records) await store.put(record);
  const recordIds = new Set(packageValue.records.map((record) => record.id));
  return {
    ...packageValue.universe,
    manifest: packageValue.universe.manifest.filter((manifest) => recordIds.has(manifest.id)),
    activeSnapshotId: recordIds.has(packageValue.universe.activeSnapshotId) ? packageValue.universe.activeSnapshotId : packageValue.records[0]?.id ?? "",
  };
}

export async function estimateSnapshotVaultStorage(
  universe: SnapshotVaultUniverse,
  store: SnapshotStore = browserSnapshotStore(),
): Promise<SnapshotVaultStorageEstimate> {
  const records = await store.getAll();
  const manifestBytes = JSON.stringify(universe).length * 2;
  const parsedSnapshotBytes = records.reduce((total, record) => total + JSON.stringify(record.snapshot).length * 2, 0);
  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate();
    quotaBytes = estimate?.quota ?? null;
    usageBytes = estimate?.usage ?? null;
  } catch {
    quotaBytes = null;
    usageBytes = null;
  }
  return { recordCount: records.length, manifestBytes, parsedSnapshotBytes, totalBytes: manifestBytes + parsedSnapshotBytes, quotaBytes, usageBytes };
}

export async function storedSnapshotRecord(snapshotId: string, store: SnapshotStore = browserSnapshotStore()): Promise<StoredSnapshotRecord | null> {
  return snapshotId ? store.get(snapshotId) : null;
}
