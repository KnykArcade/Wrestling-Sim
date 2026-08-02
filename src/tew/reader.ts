import { Buffer } from "buffer";
import processShim from "process";
import { mapTewTables, relevantTableCandidates } from "./mapper";
import type { LoadedTable, TableSummary, TewResearchSnapshot, TewResearchTable, TewSnapshot } from "./types";

const MAX_FILE_SIZE = 256 * 1024 * 1024;
const MAX_ROWS_PER_RELEVANT_TABLE = 100_000;
const MAX_RESEARCH_TABLES = 20;
const DEFAULT_RESEARCH_ROW_LIMIT = 500;
const MAX_RESEARCH_ROW_LIMIT = 2_000;

type MdbReaderInstance = InstanceType<(typeof import("mdb-reader"))["default"]>;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The database could not be read.";
}

function installBrowserCompatibility(): void {
  const runtime = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
    global?: typeof globalThis;
    process?: typeof processShim;
  };

  runtime.Buffer ??= Buffer;
  runtime.global ??= globalThis;
  runtime.process ??= processShim;
}

function validateAccessFile(file: File): void {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "mdb" && extension !== "accdb") {
    throw new Error("Choose a Microsoft Access .mdb or .accdb file.");
  }
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("The selected database is larger than the 256 MB safety limit.");
  }
}

async function openAccessDatabase(file: File): Promise<MdbReaderInstance> {
  const arrayBuffer = await file.arrayBuffer();

  // mdb-reader and its browser crypto dependencies still expect the Node-style
  // Buffer, global, and process objects. They must exist before the parser
  // module is evaluated.
  installBrowserCompatibility();
  const { default: MDBReader } = await import("mdb-reader");

  return new MDBReader(Buffer.from(arrayBuffer));
}

function serializedCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    if (Buffer.isBuffer(value)) return `buffer:${value.toString("hex")}`;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function serializeRow(row: Record<string, unknown>, columns: string[]): Record<string, string> {
  return Object.fromEntries(columns.map((column) => [column, serializedCell(row[column])]));
}

function identityCandidates(columns: string[]): string[] {
  const scored = columns.map((column) => {
    const normalized = normalizeName(column);
    let score = 0;
    if (normalized === "id" || normalized.endsWith("id")) score += 10;
    if (normalized.includes("uid") || normalized.includes("guid")) score += 9;
    if (normalized.includes("key")) score += 7;
    if (normalized.includes("number") || normalized.endsWith("num")) score += 5;
    if (normalized.includes("name")) score += 2;
    return { column, score };
  });
  return scored.filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.column.localeCompare(right.column)).map((item) => item.column);
}

export async function readTewSnapshot(file: File): Promise<TewSnapshot> {
  validateAccessFile(file);

  let reader: MdbReaderInstance;
  try {
    reader = await openAccessDatabase(file);
  } catch (error) {
    throw new Error(`Unable to open the Access database: ${formatError(error)}`);
  }

  const tableNames = reader.getTableNames({
    normalTables: true,
    systemTables: false,
    linkedTables: true,
  });
  const relevantNames = new Set(relevantTableCandidates.map(normalizeName));
  const loadedTables: LoadedTable[] = [];
  const tableSummaries: TableSummary[] = [];
  const importWarnings: string[] = [];

  for (const tableName of tableNames) {
    try {
      const table = reader.getTable(tableName);
      const shouldLoad = relevantNames.has(normalizeName(tableName));
      const truncated = shouldLoad && table.rowCount > MAX_ROWS_PER_RELEVANT_TABLE;

      tableSummaries.push({
        name: tableName,
        rowCount: table.rowCount,
        columnCount: table.columnCount,
        columns: table.getColumnNames(),
        loaded: shouldLoad,
        truncated,
      });

      if (shouldLoad) {
        const rows = table.getData({
          rowLimit: MAX_ROWS_PER_RELEVANT_TABLE,
        }) as unknown as LoadedTable["rows"];
        loadedTables.push({ name: tableName, rows });
        if (truncated) {
          importWarnings.push(
            `${tableName} contains more than ${MAX_ROWS_PER_RELEVANT_TABLE.toLocaleString()} rows and was truncated for this prototype.`,
          );
        }
      }
    } catch (error) {
      importWarnings.push(`${tableName} could not be inspected: ${formatError(error)}`);
    }
  }

  const mapped = mapTewTables(loadedTables);
  const creationDate = reader.getCreationDate();

  return {
    fileName: file.name,
    fileSize: file.size,
    databaseCreatedAt: creationDate ? creationDate.toISOString() : "",
    importedAt: new Date().toISOString(),
    tables: tableSummaries.sort((left, right) => left.name.localeCompare(right.name)),
    workers: mapped.workers,
    shows: mapped.shows,
    storylines: mapped.storylines,
    diagnostics: {
      ...mapped.diagnostics,
      warnings: [...importWarnings, ...mapped.diagnostics.warnings],
    },
  };
}

export async function readTewResearchTables(
  file: File,
  selectedTableNames: string[],
  requestedRowLimit = DEFAULT_RESEARCH_ROW_LIMIT,
): Promise<TewResearchSnapshot> {
  validateAccessFile(file);
  const uniqueNames = [...new Set(selectedTableNames.map((name) => name.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) throw new Error("Select at least one candidate table for raw evidence research.");
  if (uniqueNames.length > MAX_RESEARCH_TABLES) throw new Error(`Select no more than ${MAX_RESEARCH_TABLES} tables in one research session.`);
  const rowLimit = Math.min(MAX_RESEARCH_ROW_LIMIT, Math.max(1, Math.floor(requestedRowLimit)));

  let reader: MdbReaderInstance;
  try {
    reader = await openAccessDatabase(file);
  } catch (error) {
    throw new Error(`Unable to open the Access database for raw research: ${formatError(error)}`);
  }

  const availableNames = reader.getTableNames({ normalTables: true, systemTables: false, linkedTables: true });
  const availableByNormalized = new Map(availableNames.map((name) => [normalizeName(name), name]));
  const tables: TewResearchTable[] = [];
  const warnings: string[] = [];

  for (const requestedName of uniqueNames) {
    const actualName = availableByNormalized.get(normalizeName(requestedName));
    if (!actualName) {
      warnings.push(`${requestedName} was not found in ${file.name}.`);
      continue;
    }
    try {
      const table = reader.getTable(actualName);
      const columns = table.getColumnNames();
      const rows = table.getData({ rowLimit }) as unknown as Array<Record<string, unknown>>;
      tables.push({
        name: actualName,
        columns,
        rowCount: table.rowCount,
        sampledRows: rows.length,
        identityCandidates: identityCandidates(columns),
        truncated: table.rowCount > rowLimit,
        rows: rows.map((row) => serializeRow(row, columns)),
      });
    } catch (error) {
      warnings.push(`${actualName} could not be sampled: ${formatError(error)}`);
    }
  }

  return { fileName: file.name, importedAt: new Date().toISOString(), rowLimit, tables, warnings };
}
