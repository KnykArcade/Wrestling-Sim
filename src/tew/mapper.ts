import type {
  LoadedTable,
  MappingDiagnostics,
  MatchRecord,
  RawRow,
  ShowRecord,
  StorylineRecord,
  WorkerReference,
} from "./types";

const TABLE_CANDIDATES = {
  shows: ["Previous_Shows", "PreviousShows", "tblPreviousShows"],
  matches: ["Match_Histories", "MatchHistories", "tblMatchHistories"],
  matchWorkers: [
    "Match_Histories_Wrestlers",
    "MatchHistoryWrestlers",
    "Match_History_Wrestlers",
    "tblMatchHistoryWrestlers",
  ],
  playerStorylines: ["Player_Storylines", "PlayerStorylines"],
  databaseStorylines: ["tblStoryline", "Storylines", "Storyline"],
  storylineWorkers: [
    "tblStorylineInvolved",
    "Storyline_Involved",
    "StorylineInvolved",
    "Player_Storyline_Involved",
  ],
  workers: ["Workers", "tblWorker", "tblWorkers", "Worker_Names", "WorkerNames"],
} as const;

const FIELD_ALIASES = {
  genericId: ["UID", "ID", "Id"],
  showId: ["PreviousShowUID", "Previous_Show_UID", "ShowUID", "Show_ID", "ShowID"],
  showName: ["Show_Name", "ShowName", "Name", "Event_Name", "EventName", "Show"],
  showDate: ["Show_Date", "ShowDate", "Date", "Event_Date", "EventDate", "Held_On"],
  showRating: ["Show_Rating", "ShowRating", "Rating"],
  attendance: ["Attendance", "Crowd", "Crowd_Size"],
  venue: ["Venue", "Venue_Name", "Location", "Held_At"],
  company: ["Company", "Company_Name", "Company_Initials", "Promoted_By", "Promotion"],
  broadcast: ["Broadcast", "Broadcaster", "Network", "TV", "Broadcast_Details"],
  matchId: ["MatchHistoryUID", "Match_History_UID", "MatchUID", "Match_UID", "UID", "ID"],
  matchDescription: ["Match_Description", "MatchDescription", "Description", "Result", "Match_Result"],
  matchRating: ["Match_Rating", "MatchRating", "Rating"],
  matchWinner: ["Which_Side_Won", "WhichSideWon", "Winner", "Winning_Side", "WinningSide"],
  matchNotes: ["Extra_Notes", "ExtraNotes", "Notes", "Road_Agent_Notes", "RoadAgentNotes"],
  matchTime: ["Match_Time", "MatchTime", "Time", "Length", "Duration"],
  preShow: ["Pre_Show", "PreShow", "Is_Pre_Show"],
  postShow: ["Post_Show", "PostShow", "Is_Post_Show"],
  workerId: ["WorkerUID", "Worker_UID", "WorkerID", "Worker_ID", "UID", "ID"],
  workerName: ["Worker_Name", "WorkerName", "Database_Name", "DatabaseName", "Name", "Short_Name"],
  workerRole: ["Role", "Match_Role", "MatchRole", "Storyline_Role", "StorylineRole"],
  workerSide: ["Side", "Match_Side", "MatchSide", "Team", "Which_Side", "WhichSide"],
  storylineId: ["StorylineUID", "Storyline_UID", "StorylineID", "Storyline_ID", "UID", "ID"],
  storylineName: ["Storyline_Name", "StorylineName", "Name", "Title"],
  storylineDescription: ["Description", "Summary", "Notes", "Story", "Storyline_Description"],
  storylineStatus: ["Status", "Active", "Completed", "State"],
  storylineHeat: ["Heat", "Rating", "Success", "Momentum"],
} as const;

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tableMap(tables: LoadedTable[]): Map<string, LoadedTable> {
  return new Map(tables.map((table) => [normalizeKey(table.name), table]));
}

function findTable(tables: Map<string, LoadedTable>, candidates: readonly string[]): LoadedTable | null {
  for (const candidate of candidates) {
    const table = tables.get(normalizeKey(candidate));
    if (table) {
      return table;
    }
  }
  return null;
}

function findValue(row: RawRow, aliases: readonly string[]): unknown {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function toText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function toIdentifier(value: unknown, fallback: string): string {
  const text = toText(value);
  return text || fallback;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["true", "yes", "y", "1", "-1"].includes(value.trim().toLowerCase());
  }
  return false;
}

function toDateText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = toText(value);
  if (!text) {
    return "";
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function determinePlacement(row: RawRow): MatchRecord["placement"] {
  if (toBoolean(findValue(row, FIELD_ALIASES.preShow))) {
    return "Pre-Show";
  }
  if (toBoolean(findValue(row, FIELD_ALIASES.postShow))) {
    return "Post-Show";
  }
  return "Main Show";
}

function mapAllWorkers(workerTable: LoadedTable | null): WorkerReference[] {
  if (!workerTable) {
    return [];
  }
  const seen = new Set<string>();
  return workerTable.rows
    .map((row, index) => {
      const id = toIdentifier(findValue(row, FIELD_ALIASES.workerId), `worker-${index + 1}`);
      const name = toText(findValue(row, FIELD_ALIASES.workerName));
      return { id, name, role: "", side: "" } satisfies WorkerReference;
    })
    .filter((worker) => {
      const key = `${worker.id}:${normalizeKey(worker.name)}`;
      if (!worker.name || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function workerLookup(workers: WorkerReference[]): Map<string, string> {
  return new Map(workers.map((worker) => [worker.id, worker.name]));
}

function mapWorkerReference(
  row: RawRow,
  index: number,
  lookup: Map<string, string>,
): WorkerReference {
  const id = toIdentifier(findValue(row, FIELD_ALIASES.workerId), `worker-${index + 1}`);
  return {
    id,
    name: toText(findValue(row, FIELD_ALIASES.workerName), lookup.get(id) ?? `Worker ${id}`),
    role: toText(findValue(row, FIELD_ALIASES.workerRole)),
    side: toText(findValue(row, FIELD_ALIASES.workerSide)),
  };
}

function mapMatches(
  matchTable: LoadedTable | null,
  matchWorkerTable: LoadedTable | null,
  lookup: Map<string, string>,
): MatchRecord[] {
  if (!matchTable) {
    return [];
  }

  const workersByMatch = new Map<string, WorkerReference[]>();
  matchWorkerTable?.rows.forEach((row, index) => {
    const matchId = toIdentifier(findValue(row, FIELD_ALIASES.matchId), `match-worker-${index + 1}`);
    const current = workersByMatch.get(matchId) ?? [];
    current.push(mapWorkerReference(row, index, lookup));
    workersByMatch.set(matchId, current);
  });

  return matchTable.rows.map((row, index) => {
    const id = toIdentifier(findValue(row, FIELD_ALIASES.matchId), `match-${index + 1}`);
    return {
      id,
      showId: toIdentifier(findValue(row, FIELD_ALIASES.showId), "unknown-show"),
      description: toText(findValue(row, FIELD_ALIASES.matchDescription), `Match ${index + 1}`),
      rating: toNumber(findValue(row, FIELD_ALIASES.matchRating)),
      winner: toText(findValue(row, FIELD_ALIASES.matchWinner)),
      matchTime: toText(findValue(row, FIELD_ALIASES.matchTime)),
      notes: toText(findValue(row, FIELD_ALIASES.matchNotes)),
      placement: determinePlacement(row),
      workers: workersByMatch.get(id) ?? [],
    };
  });
}

function mapShows(showTable: LoadedTable | null, matches: MatchRecord[]): ShowRecord[] {
  if (!showTable) {
    return [];
  }

  const matchesByShow = new Map<string, MatchRecord[]>();
  for (const match of matches) {
    const current = matchesByShow.get(match.showId) ?? [];
    current.push(match);
    matchesByShow.set(match.showId, current);
  }

  return showTable.rows
    .map((row, index) => {
      const id = toIdentifier(findValue(row, FIELD_ALIASES.genericId), `show-${index + 1}`);
      return {
        id,
        name: toText(findValue(row, FIELD_ALIASES.showName), `Show ${index + 1}`),
        date: toDateText(findValue(row, FIELD_ALIASES.showDate)),
        rating: toNumber(findValue(row, FIELD_ALIASES.showRating)),
        attendance: toNumber(findValue(row, FIELD_ALIASES.attendance)),
        venue: toText(findValue(row, FIELD_ALIASES.venue)),
        company: toText(findValue(row, FIELD_ALIASES.company)),
        broadcast: toText(findValue(row, FIELD_ALIASES.broadcast)),
        matches: matchesByShow.get(id) ?? [],
      } satisfies ShowRecord;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.date);
      const rightTime = Date.parse(right.date);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
      }
      return right.id.localeCompare(left.id, undefined, { numeric: true });
    });
}

function mapStorylines(
  sources: Array<LoadedTable | null>,
  storylineWorkerTable: LoadedTable | null,
  lookup: Map<string, string>,
): StorylineRecord[] {
  const workersByStoryline = new Map<string, WorkerReference[]>();
  storylineWorkerTable?.rows.forEach((row, index) => {
    const storylineId = toIdentifier(
      findValue(row, FIELD_ALIASES.storylineId),
      `storyline-worker-${index + 1}`,
    );
    const current = workersByStoryline.get(storylineId) ?? [];
    current.push(mapWorkerReference(row, index, lookup));
    workersByStoryline.set(storylineId, current);
  });

  const storylines = new Map<string, StorylineRecord>();
  for (const source of sources) {
    source?.rows.forEach((row, index) => {
      const id = toIdentifier(findValue(row, FIELD_ALIASES.storylineId), `${source.name}-${index + 1}`);
      const name = toText(findValue(row, FIELD_ALIASES.storylineName), `Storyline ${index + 1}`);
      const dedupeKey = `${normalizeKey(id)}:${normalizeKey(name)}`;
      const mapped: StorylineRecord = {
        id,
        name,
        description: toText(findValue(row, FIELD_ALIASES.storylineDescription)),
        status: toText(findValue(row, FIELD_ALIASES.storylineStatus)),
        heat: toNumber(findValue(row, FIELD_ALIASES.storylineHeat)),
        workers: workersByStoryline.get(id) ?? [],
        sourceTable: source.name,
      };

      const existing = storylines.get(dedupeKey);
      if (!existing || normalizeKey(source.name) === normalizeKey("Player_Storylines")) {
        storylines.set(dedupeKey, mapped);
      }
    });
  }

  return [...storylines.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export interface MappedTewData {
  workers: WorkerReference[];
  shows: ShowRecord[];
  storylines: StorylineRecord[];
  diagnostics: MappingDiagnostics;
}

export function mapTewTables(loadedTables: LoadedTable[]): MappedTewData {
  const tables = tableMap(loadedTables);
  const showTable = findTable(tables, TABLE_CANDIDATES.shows);
  const matchTable = findTable(tables, TABLE_CANDIDATES.matches);
  const matchWorkerTable = findTable(tables, TABLE_CANDIDATES.matchWorkers);
  const playerStorylineTable = findTable(tables, TABLE_CANDIDATES.playerStorylines);
  const databaseStorylineTable = findTable(tables, TABLE_CANDIDATES.databaseStorylines);
  const storylineWorkerTable = findTable(tables, TABLE_CANDIDATES.storylineWorkers);
  const workerTable = findTable(tables, TABLE_CANDIDATES.workers);

  const workers = mapAllWorkers(workerTable);
  const lookup = workerLookup(workers);
  const matches = mapMatches(matchTable, matchWorkerTable, lookup);
  const shows = mapShows(showTable, matches);
  const storylines = mapStorylines(
    [playerStorylineTable, databaseStorylineTable],
    storylineWorkerTable,
    lookup,
  );

  const knownShowIds = new Set(shows.map((show) => show.id));
  const orphanMatchCount = matches.filter((match) => !knownShowIds.has(match.showId)).length;
  const unresolvedWorkerCount = [
    ...matches.flatMap((match) => match.workers),
    ...storylines.flatMap((storyline) => storyline.workers),
  ].filter((worker) => worker.name === `Worker ${worker.id}`).length;

  const warnings: string[] = [];
  if (!showTable) {
    warnings.push("No supported previous-show table was found.");
  }
  if (!matchTable) {
    warnings.push("No supported match-history table was found.");
  }
  if (!matchWorkerTable) {
    warnings.push("No match-participant history table was found; participant names may be unavailable.");
  }
  if (!playerStorylineTable && !databaseStorylineTable) {
    warnings.push("No supported storyline table was found.");
  }
  if (!workerTable) {
    warnings.push("No supported worker table was found; planner worker selection will require manual entry.");
  }
  if (orphanMatchCount > 0) {
    warnings.push(`${orphanMatchCount} match record(s) could not be linked to a previous show.`);
  }
  if (unresolvedWorkerCount > 0) {
    warnings.push(`${unresolvedWorkerCount} worker reference(s) could not be resolved to a name.`);
  }

  return {
    workers,
    shows,
    storylines,
    diagnostics: {
      matchedTables: {
        shows: showTable?.name ?? null,
        matches: matchTable?.name ?? null,
        matchWorkers: matchWorkerTable?.name ?? null,
        playerStorylines: playerStorylineTable?.name ?? null,
        databaseStorylines: databaseStorylineTable?.name ?? null,
        storylineWorkers: storylineWorkerTable?.name ?? null,
        workers: workerTable?.name ?? null,
      },
      warnings,
      orphanMatchCount,
      unresolvedWorkerCount,
    },
  };
}

export const relevantTableCandidates = Object.values(TABLE_CANDIDATES).flat();
