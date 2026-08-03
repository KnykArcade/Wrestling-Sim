import { strFromU8, unzipSync } from "fflate";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { StartingUniverseImportFormat } from "./types";

export type RawTewValue = string | number | null;
export type RawTewRow = Record<string, RawTewValue>;
export type RawTewTables = Record<string, RawTewRow[]>;

export interface ParsedTewExport {
  format: StartingUniverseImportFormat;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  tableNames: string[];
  tables: RawTewTables;
  warnings: string[];
}

const IMPORT_TABLES = [
  "Database_Info",
  "Save_Game_Info",
  "Companies",
  "Workers",
  "Contracts",
  "Title_Belts",
  "TV_Shows",
  "Tag_Teams",
  "Stables",
  "Worker_Relationships",
  "Attributes",
] as const;

let sqlPromise: Promise<SqlJsStatic> | null = null;

function sqlRuntime(): Promise<SqlJsStatic> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

function extension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function normalizeTableName(value: string): string {
  return value.replace(/\.csv$/i, "").trim();
}

function decodeCsv(bytes: Uint8Array): string {
  const decoded = strFromU8(bytes);
  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}

export function parseCsvRows(text: string): RawTewRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as RawTewRow);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlValue(value: SqlValue): RawTewValue {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return Array.from(value as Uint8Array).join(",");
}

function queryRows(database: Database, tableName: string): RawTewRow[] {
  const statement = database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`);
  const rows: RawTewRow[] = [];
  try {
    while (statement.step()) {
      const source = statement.getAsObject();
      rows.push(Object.fromEntries(Object.entries(source).map(([key, value]) => [key, sqlValue(value)])) as RawTewRow);
    }
  } finally {
    statement.free();
  }
  return rows;
}

async function parseSqlite(bytes: Uint8Array): Promise<{ tables: RawTewTables; tableNames: string[]; warnings: string[] }> {
  const SQL = await sqlRuntime();
  const database = new SQL.Database(bytes);
  try {
    const tableResult = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tableResult[0]?.values.map((row) => String(row[0])) ?? [];
    const available = new Set(tableNames.map((name) => name.toLowerCase()));
    const tables: RawTewTables = {};
    const warnings: string[] = [];
    for (const requested of IMPORT_TABLES) {
      const actual = tableNames.find((name) => name.toLowerCase() === requested.toLowerCase());
      if (!actual) {
        warnings.push(`The SQLite export does not contain ${requested}.`);
        tables[requested] = [];
        continue;
      }
      tables[requested] = queryRows(database, actual);
    }
    if (!available.has("companies") || !available.has("workers") || !available.has("contracts")) throw new Error("The SQLite file does not contain the Companies, Workers, and Contracts tables required for a TEW starting universe.");
    return { tables, tableNames, warnings };
  } finally {
    database.close();
  }
}

function parseZip(bytes: Uint8Array): { tables: RawTewTables; tableNames: string[]; warnings: string[] } {
  const files = unzipSync(bytes);
  const fileNames = Object.keys(files);
  const tableNames = fileNames.filter((name) => name.toLowerCase().endsWith(".csv")).map(normalizeTableName).sort();
  const byNormalized = new Map(fileNames.map((name) => [normalizeTableName(name).toLowerCase(), name]));
  const tables: RawTewTables = {};
  const warnings: string[] = [];
  for (const requested of IMPORT_TABLES) {
    const fileName = byNormalized.get(requested.toLowerCase());
    if (!fileName) {
      warnings.push(`The ZIP export does not contain ${requested}.csv.`);
      tables[requested] = [];
      continue;
    }
    tables[requested] = parseCsvRows(decodeCsv(files[fileName]));
  }
  if (!byNormalized.has("companies") || !byNormalized.has("workers") || !byNormalized.has("contracts")) throw new Error("The ZIP file does not contain Companies.csv, Workers.csv, and Contracts.csv required for a TEW starting universe.");
  return { tables, tableNames, warnings };
}

export async function readTewStartingUniverseBytes(
  bytes: Uint8Array,
  fileName: string,
): Promise<ParsedTewExport> {
  const suffix = extension(fileName);
  const format: StartingUniverseImportFormat = suffix === ".zip" ? "TEW ZIP CSV" : suffix === ".sqlite" || suffix === ".db" ? "TEW SQLite" : (() => { throw new Error("Choose a TEW SQLite export (.sqlite or .db) or the matching ZIP of CSV tables."); })();
  const parsed = format === "TEW ZIP CSV" ? parseZip(bytes) : await parseSqlite(bytes);
  return {
    format,
    fileName,
    fileSize: bytes.byteLength,
    fingerprint: await sha256(bytes),
    tableNames: parsed.tableNames,
    tables: parsed.tables,
    warnings: parsed.warnings,
  };
}

export async function readTewStartingUniverseFile(file: File): Promise<ParsedTewExport> {
  return readTewStartingUniverseBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
