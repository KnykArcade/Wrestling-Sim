import { Buffer } from "buffer/";
import MDBReader from "mdb-reader";
import { mapTewTables, relevantTableCandidates } from "./mapper";
import type { LoadedTable, TableSummary, TewSnapshot } from "./types";

const MAX_FILE_SIZE = 256 * 1024 * 1024;
const MAX_ROWS_PER_RELEVANT_TABLE = 100_000;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The database could not be read.";
}

export async function readTewSnapshot(file: File): Promise<TewSnapshot> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "mdb" && extension !== "accdb") {
    throw new Error("Choose a Microsoft Access .mdb or .accdb file.");
  }
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("The selected database is larger than the 256 MB Phase 1 safety limit.");
  }

  let reader: MDBReader;
  try {
    const arrayBuffer = await file.arrayBuffer();
    reader = new MDBReader(Buffer.from(arrayBuffer));
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
    shows: mapped.shows,
    storylines: mapped.storylines,
    diagnostics: {
      ...mapped.diagnostics,
      warnings: [...importWarnings, ...mapped.diagnostics.warnings],
    },
  };
}
