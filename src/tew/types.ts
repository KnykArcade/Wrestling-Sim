export type RawRow = Record<string, unknown>;

export interface TableSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  loaded: boolean;
  truncated: boolean;
}

export interface WorkerReference {
  id: string;
  name: string;
  role: string;
  side: string;
}

export interface MatchRecord {
  id: string;
  showId: string;
  description: string;
  rating: number | null;
  winner: string;
  matchTime: string;
  notes: string;
  placement: "Pre-Show" | "Main Show" | "Post-Show";
  workers: WorkerReference[];
}

export interface ShowRecord {
  id: string;
  name: string;
  date: string;
  rating: number | null;
  attendance: number | null;
  venue: string;
  company: string;
  broadcast: string;
  matches: MatchRecord[];
}

export interface StorylineRecord {
  id: string;
  name: string;
  description: string;
  status: string;
  heat: number | null;
  workers: WorkerReference[];
  sourceTable: string;
}

export interface MappingDiagnostics {
  matchedTables: Record<string, string | null>;
  warnings: string[];
  orphanMatchCount: number;
  unresolvedWorkerCount: number;
}

export interface TewSnapshot {
  fileName: string;
  fileSize: number;
  databaseCreatedAt: string;
  importedAt: string;
  tables: TableSummary[];
  workers: WorkerReference[];
  shows: ShowRecord[];
  storylines: StorylineRecord[];
  diagnostics: MappingDiagnostics;
}

export interface LoadedTable {
  name: string;
  rows: RawRow[];
}

export interface TewResearchTable {
  name: string;
  columns: string[];
  rowCount: number;
  sampledRows: number;
  identityCandidates: string[];
  truncated: boolean;
  rows: Array<Record<string, string>>;
}

export interface TewResearchSnapshot {
  fileName: string;
  importedAt: string;
  rowLimit: number;
  tables: TewResearchTable[];
  warnings: string[];
}
