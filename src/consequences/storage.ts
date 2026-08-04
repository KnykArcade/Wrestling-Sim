import { emptyResultConsequenceUniverse } from "./model";
import type {
  ChampionshipConsequenceProposal,
  CompetitionConsequenceProposal,
  ConsequenceAuditEntry,
  FutureBookingConflict,
  GroundedBookingPrompt,
  ResultConsequenceApplication,
  ResultConsequenceUniverse,
  StandaloneWorkerRecord,
  StandaloneTeamRecord,
} from "./types";

export const RESULT_CONSEQUENCE_STORAGE_KEY = "wrestling-sim:result-consequences:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function records<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(isRecord) as unknown as T[] : [];
}

function workerRecord(value: unknown): StandaloneWorkerRecord | null {
  if (!isRecord(value) || !text(value.workerKey) || !text(value.workerName)) return null;
  return value as unknown as StandaloneWorkerRecord;
}

function teamRecord(value: unknown): StandaloneTeamRecord | null {
  if (!isRecord(value) || !text(value.teamKey) || !text(value.teamName)) return null;
  return value as unknown as StandaloneTeamRecord;
}

function application(value: unknown): ResultConsequenceApplication | null {
  if (!isRecord(value) || !text(value.id) || !text(value.resolutionAttemptId)) return null;
  return value as unknown as ResultConsequenceApplication;
}

function championshipProposal(value: unknown): ChampionshipConsequenceProposal | null {
  if (!isRecord(value) || !text(value.id) || !text(value.applicationId)) return null;
  return value as unknown as ChampionshipConsequenceProposal;
}

function competitionProposal(value: unknown): CompetitionConsequenceProposal | null {
  if (!isRecord(value) || !text(value.id) || !text(value.applicationId)) return null;
  return value as unknown as CompetitionConsequenceProposal;
}

function conflict(value: unknown): FutureBookingConflict | null {
  if (!isRecord(value) || !text(value.id) || !text(value.futureShowId)) return null;
  return value as unknown as FutureBookingConflict;
}

function prompt(value: unknown): GroundedBookingPrompt | null {
  if (!isRecord(value) || !text(value.id) || !text(value.kind)) return null;
  return value as unknown as GroundedBookingPrompt;
}

function audit(value: unknown): ConsequenceAuditEntry | null {
  if (!isRecord(value) || !text(value.id) || !text(value.action)) return null;
  return value as unknown as ConsequenceAuditEntry;
}

export function parseResultConsequenceUniverse(value: unknown): ResultConsequenceUniverse {
  if (!isRecord(value)) return emptyResultConsequenceUniverse();
  const settings = isRecord(value.settings) ? value.settings : {};
  const tabs: ResultConsequenceUniverse["settings"]["activeTab"][] = ["overview", "records", "decisions", "future", "audit"];
  return {
    workerRecords: Array.isArray(value.workerRecords) ? value.workerRecords.map(workerRecord).filter((item): item is StandaloneWorkerRecord => item !== null) : [],
    teamRecords: Array.isArray(value.teamRecords) ? value.teamRecords.map(teamRecord).filter((item): item is StandaloneTeamRecord => item !== null) : [],
    applications: Array.isArray(value.applications) ? value.applications.map(application).filter((item): item is ResultConsequenceApplication => item !== null) : [],
    championshipProposals: Array.isArray(value.championshipProposals) ? value.championshipProposals.map(championshipProposal).filter((item): item is ChampionshipConsequenceProposal => item !== null) : [],
    competitionProposals: Array.isArray(value.competitionProposals) ? value.competitionProposals.map(competitionProposal).filter((item): item is CompetitionConsequenceProposal => item !== null) : [],
    futureConflicts: Array.isArray(value.futureConflicts) ? value.futureConflicts.map(conflict).filter((item): item is FutureBookingConflict => item !== null) : [],
    prompts: Array.isArray(value.prompts) ? value.prompts.map(prompt).filter((item): item is GroundedBookingPrompt => item !== null) : [],
    audit: Array.isArray(value.audit) ? value.audit.map(audit).filter((item): item is ConsequenceAuditEntry => item !== null).slice(0, 1000) : [],
    settings: {
      activeTab: tabs.includes(settings.activeTab as ResultConsequenceUniverse["settings"]["activeTab"]) ? settings.activeTab as ResultConsequenceUniverse["settings"]["activeTab"] : "overview",
      selectedApplicationId: text(settings.selectedApplicationId),
      selectedWorkerKey: text(settings.selectedWorkerKey),
    },
  };
}

export function loadResultConsequenceUniverse(storage: Pick<Storage, "getItem">): ResultConsequenceUniverse {
  const raw = storage.getItem(RESULT_CONSEQUENCE_STORAGE_KEY);
  if (!raw) return emptyResultConsequenceUniverse();
  try { return parseResultConsequenceUniverse(JSON.parse(raw) as unknown); } catch { return emptyResultConsequenceUniverse(); }
}

export function saveResultConsequenceUniverse(storage: Pick<Storage, "setItem">, universe: ResultConsequenceUniverse): void {
  storage.setItem(RESULT_CONSEQUENCE_STORAGE_KEY, JSON.stringify(universe));
}
