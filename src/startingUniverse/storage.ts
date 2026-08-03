import { startingUniverseManifest } from "./model";
import type {
  StartingUniverseManifestRecord,
  StartingUniversePackage,
  StartingUniverseRecord,
  StartingUniverseReviewTab,
  StartingUniverseState,
} from "./types";

export const STARTING_UNIVERSE_STATE_KEY = "wrestling-sim:starting-universe-state:v1";
const DATABASE_NAME = "wrestling-sim-starting-universe";
const DATABASE_VERSION = 1;
const STORE_NAME = "universes";

export interface StartingUniverseStore {
  put(record: StartingUniverseRecord): Promise<void>;
  get(id: string): Promise<StartingUniverseRecord | null>;
  getAll(): Promise<StartingUniverseRecord[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Starting Universe IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Starting Universe IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Starting Universe IndexedDB transaction was aborted."));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser could not open Starting Universe storage."));
    request.onblocked = () => reject(new Error("Starting Universe storage is blocked by another browser tab."));
  });
  return databasePromise;
}

class IndexedDbStartingUniverseStore implements StartingUniverseStore {
  async put(record: StartingUniverseRecord): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }

  async get(id: string): Promise<StartingUniverseRecord | null> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestValue(transaction.objectStore(STORE_NAME).get(id));
    await transactionDone(transaction);
    return (result as StartingUniverseRecord | undefined) ?? null;
  }

  async getAll(): Promise<StartingUniverseRecord[]> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestValue(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return (result as StartingUniverseRecord[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

export function createMemoryStartingUniverseStore(initial: StartingUniverseRecord[] = []): StartingUniverseStore {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  return {
    async put(record) { records.set(record.id, structuredClone(record)); },
    async get(id) { const record = records.get(id); return record ? structuredClone(record) : null; },
    async getAll() { return [...records.values()].map((record) => structuredClone(record)); },
    async delete(id) { records.delete(id); },
    async clear() { records.clear(); },
  };
}

let defaultStore: StartingUniverseStore | null = null;

export function browserStartingUniverseStore(): StartingUniverseStore {
  if (!defaultStore) defaultStore = typeof indexedDB === "undefined" ? createMemoryStartingUniverseStore() : new IndexedDbStartingUniverseStore();
  return defaultStore;
}

export function emptyStartingUniverseState(): StartingUniverseState {
  return { manifest: [], activeUniverseId: "", selectedTab: "source", lastExportedAt: "", lastImportedAt: "" };
}

function normalizeManifest(value: unknown): StartingUniverseManifestRecord | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return value as unknown as StartingUniverseManifestRecord;
}

export function parseStartingUniverseState(value: unknown): StartingUniverseState {
  if (!isRecord(value)) return emptyStartingUniverseState();
  const tabs: StartingUniverseReviewTab[] = ["source", "company", "roster", "titles", "teams", "formulas", "confirm"];
  return {
    manifest: Array.isArray(value.manifest) ? value.manifest.map(normalizeManifest).filter((item): item is StartingUniverseManifestRecord => item !== null) : [],
    activeUniverseId: text(value.activeUniverseId),
    selectedTab: tabs.includes(value.selectedTab as StartingUniverseReviewTab) ? value.selectedTab as StartingUniverseReviewTab : "source",
    lastExportedAt: text(value.lastExportedAt),
    lastImportedAt: text(value.lastImportedAt),
  };
}

export function loadStartingUniverseState(storage: Pick<Storage, "getItem">): StartingUniverseState {
  const raw = storage.getItem(STARTING_UNIVERSE_STATE_KEY);
  if (!raw) return emptyStartingUniverseState();
  try { return parseStartingUniverseState(JSON.parse(raw) as unknown); } catch { return emptyStartingUniverseState(); }
}

export function saveStartingUniverseState(storage: Pick<Storage, "setItem">, state: StartingUniverseState): void {
  storage.setItem(STARTING_UNIVERSE_STATE_KEY, JSON.stringify(state));
}

export async function saveStartingUniverseRecord(
  record: StartingUniverseRecord,
  state: StartingUniverseState,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<StartingUniverseState> {
  await store.put(record);
  const manifest = startingUniverseManifest(record);
  return {
    ...state,
    manifest: state.manifest.some((item) => item.id === record.id)
      ? state.manifest.map((item) => item.id === record.id ? manifest : item)
      : [manifest, ...state.manifest],
    activeUniverseId: record.id,
  };
}

export async function loadActiveStartingUniverse(
  state: StartingUniverseState,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<StartingUniverseRecord | null> {
  return state.activeUniverseId ? store.get(state.activeUniverseId) : null;
}

export async function activateStartingUniverse(
  id: string,
  state: StartingUniverseState,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<{ state: StartingUniverseState; record: StartingUniverseRecord | null }> {
  const record = await store.get(id);
  return { state: record ? { ...state, activeUniverseId: id } : state, record };
}

export async function removeStartingUniverse(
  id: string,
  state: StartingUniverseState,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<StartingUniverseState> {
  await store.delete(id);
  const manifest = state.manifest.filter((item) => item.id !== id);
  return { ...state, manifest, activeUniverseId: state.activeUniverseId === id ? manifest[0]?.id ?? "" : state.activeUniverseId };
}

export async function exportStartingUniversePackage(
  state: StartingUniverseState,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<StartingUniversePackage> {
  return { product: "Wrestling Sim Starting Universe", version: 1, exportedAt: new Date().toISOString(), state, records: await store.getAll() };
}

export function parseStartingUniversePackage(textValue: string): StartingUniversePackage {
  let value: unknown;
  try { value = JSON.parse(textValue) as unknown; } catch { throw new Error("The selected Starting Universe package is not valid JSON."); }
  if (!isRecord(value) || value.product !== "Wrestling Sim Starting Universe" || value.version !== 1 || !Array.isArray(value.records)) throw new Error("The selected file is not a supported Wrestling Sim Starting Universe package.");
  const records = value.records.filter((record): record is StartingUniverseRecord => isRecord(record) && typeof record.id === "string" && Array.isArray(record.companies) && Array.isArray(record.workers) && Array.isArray(record.contracts));
  if (records.length !== value.records.length) throw new Error("The Starting Universe package contains an unsupported universe record.");
  return { product: "Wrestling Sim Starting Universe", version: 1, exportedAt: text(value.exportedAt), state: parseStartingUniverseState(value.state), records };
}

export async function importStartingUniversePackage(
  packageValue: StartingUniversePackage,
  store: StartingUniverseStore = browserStartingUniverseStore(),
): Promise<StartingUniverseState> {
  await store.clear();
  for (const record of packageValue.records) await store.put(record);
  const ids = new Set(packageValue.records.map((record) => record.id));
  return {
    ...packageValue.state,
    manifest: packageValue.state.manifest.filter((manifest) => ids.has(manifest.id)),
    activeUniverseId: ids.has(packageValue.state.activeUniverseId) ? packageValue.state.activeUniverseId : packageValue.records[0]?.id ?? "",
    lastImportedAt: new Date().toISOString(),
  };
}
