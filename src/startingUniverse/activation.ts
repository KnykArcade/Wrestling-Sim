import { createChampionship, createChampionshipReign } from "../championships/model";
import { loadChampionshipUniverse, saveChampionshipUniverse } from "../championships/storage";
import type { Championship, ChampionshipClassification, ChampionshipDivision, ChampionshipUniverse } from "../championships/types";
import { loadMatchEngineUniverse, saveMatchEngineUniverse } from "../matchEngine/storage";
import type { MatchEngineUniverse } from "../matchEngine/types";
import { createProfileLibraryRecord, synchronizeProfileLibrary } from "../profileLibrary/model";
import { loadProfileLibraryUniverse, saveProfileLibraryUniverse } from "../profileLibrary/storage";
import type { ProfileFieldKey, ProfileFieldProvenance, ProfileLibraryUniverse } from "../profileLibrary/types";
import { createShowSeries } from "../schedule/model";
import { loadPromotionScheduleUniverse, savePromotionScheduleUniverse } from "../schedule/storage";
import type { PromotionScheduleUniverse, ShowSeries } from "../schedule/types";
import { loadSnapshotVaultUniverse, saveSnapshotVaultUniverse } from "../snapshotVault/storage";
import type { PromotionIdentity, SnapshotVaultUniverse } from "../snapshotVault/types";
import { createWorkerProfile, createWorkerRelationship } from "../workers/model";
import { loadWorkerUniverse, saveWorkerUniverse } from "../workers/storage";
import type { WorkerAlignment, WorkerProfile, WorkerRelationship, WorkerRelationshipType, WorkerUniverse } from "../workers/types";
import { applyStartingRosterToMatchEngine } from "./model";
import { ensurePlayableFirstDayInStorage } from "./quickStart";
import type { StartingUniverseContract, StartingUniverseRecord, StartingUniverseRelationship, StartingUniverseTitle } from "./types";

export const STARTING_UNIVERSE_ACTIVATION_KEY = "wrestling-sim:starting-universe-activation:v1";

export type ActivationCategory = "Game" | "Match Engine" | "Worker Hub" | "Wrestler Profiles" | "Championships" | "Television" | "Teams & Relationships";
export type ActivationDisposition = "created" | "updated" | "preserved" | "skipped";

export interface ActivationCounts {
  created: number;
  updated: number;
  preserved: number;
  skipped: number;
}

export interface StartingUniverseActivationReport {
  universeId: string;
  companyId: string;
  companyName: string;
  gameDate: string;
  activatedAt: string;
  categories: Record<ActivationCategory, ActivationCounts>;
}

interface ActivationLedgerEntry {
  baseline: string;
  updatedAt: string;
}

export interface StartingUniverseActivationState {
  activeUniverseId: string;
  activeCompanyId: string;
  activeCompanyName: string;
  gameDate: string;
  activatedAt: string;
  nextShowId: string;
  ledger: Record<string, ActivationLedgerEntry>;
  lastReport: StartingUniverseActivationReport | null;
}

export interface StartingUniverseActivationData {
  matchEngine: MatchEngineUniverse;
  workers: WorkerUniverse;
  profiles: ProfileLibraryUniverse;
  championships: ChampionshipUniverse;
  schedule: PromotionScheduleUniverse;
  vault: SnapshotVaultUniverse;
  activation: StartingUniverseActivationState;
  report: StartingUniverseActivationReport;
}

function emptyCounts(): ActivationCounts {
  return { created: 0, updated: 0, preserved: 0, skipped: 0 };
}

function emptyReport(record: StartingUniverseRecord, timestamp: string): StartingUniverseActivationReport {
  const company = record.companies.find((item) => item.id === record.playableCompanyId);
  return {
    universeId: record.id,
    companyId: record.playableCompanyId,
    companyName: company?.name ?? "",
    gameDate: dateValue(record.source.gameDate),
    activatedAt: timestamp,
    categories: {
      "Game": emptyCounts(),
      "Match Engine": emptyCounts(),
      "Worker Hub": emptyCounts(),
      "Wrestler Profiles": emptyCounts(),
      "Championships": emptyCounts(),
      "Television": emptyCounts(),
      "Teams & Relationships": emptyCounts(),
    },
  };
}

export function emptyStartingUniverseActivationState(): StartingUniverseActivationState {
  return { activeUniverseId: "", activeCompanyId: "", activeCompanyName: "", gameDate: "", activatedAt: "", nextShowId: "", ledger: {}, lastReport: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadStartingUniverseActivationState(storage: Pick<Storage, "getItem">): StartingUniverseActivationState {
  const raw = storage.getItem(STARTING_UNIVERSE_ACTIVATION_KEY);
  if (!raw) return emptyStartingUniverseActivationState();
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return emptyStartingUniverseActivationState();
    const ledger = isRecord(value.ledger)
      ? Object.fromEntries(Object.entries(value.ledger).flatMap(([key, item]) => isRecord(item) && typeof item.baseline === "string" ? [[key, { baseline: item.baseline, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "" }]] : []))
      : {};
    return {
      activeUniverseId: typeof value.activeUniverseId === "string" ? value.activeUniverseId : "",
      activeCompanyId: typeof value.activeCompanyId === "string" ? value.activeCompanyId : "",
      activeCompanyName: typeof value.activeCompanyName === "string" ? value.activeCompanyName : "",
      gameDate: typeof value.gameDate === "string" ? value.gameDate : "",
      activatedAt: typeof value.activatedAt === "string" ? value.activatedAt : "",
      nextShowId: typeof value.nextShowId === "string" ? value.nextShowId : "",
      ledger,
      lastReport: isRecord(value.lastReport) ? value.lastReport as unknown as StartingUniverseActivationReport : null,
    };
  } catch {
    return emptyStartingUniverseActivationState();
  }
}

export function saveStartingUniverseActivationState(storage: Pick<Storage, "setItem">, state: StartingUniverseActivationState): void {
  storage.setItem(STARTING_UNIVERSE_ACTIVATION_KEY, JSON.stringify(state));
}

function dateValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(trimmed);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceId(record: StartingUniverseRecord, kind: string, id: string): string {
  return `starting-universe:${record.id}:${kind}:${id}`;
}

function count(report: StartingUniverseActivationReport, category: ActivationCategory, disposition: ActivationDisposition): void {
  report.categories[category][disposition] += 1;
}

function managedUpsert<T>(input: {
  key: string;
  existing: T | undefined;
  incoming: T;
  ledger: Record<string, ActivationLedgerEntry>;
  timestamp: string;
}): { value: T; disposition: Exclude<ActivationDisposition, "skipped"> } {
  const baseline = (value: T) => JSON.stringify(value, (key, item) => key === "updatedAt" ? undefined : item);
  const incomingBaseline = baseline(input.incoming);
  if (!input.existing) {
    input.ledger[input.key] = { baseline: incomingBaseline, updatedAt: input.timestamp };
    return { value: input.incoming, disposition: "created" };
  }
  const previous = input.ledger[input.key];
  if (previous && previous.baseline === baseline(input.existing)) {
    input.ledger[input.key] = { baseline: incomingBaseline, updatedAt: input.timestamp };
    return { value: input.incoming, disposition: incomingBaseline === previous.baseline ? "preserved" : "updated" };
  }
  return { value: input.existing, disposition: "preserved" };
}

function contractFor(record: StartingUniverseRecord, workerId: string): StartingUniverseContract | undefined {
  const decision = record.review.roster.find((item) => item.workerId === workerId);
  return record.contracts.find((item) => item.id === decision?.contractId)
    ?? record.contracts.find((item) => item.workerId === workerId && item.companyId === record.playableCompanyId);
}

function alignmentFor(contract: StartingUniverseContract | undefined): WorkerAlignment {
  if (!contract) return "Unspecified";
  return contract.babyface ? "Face" : "Heel";
}

function weekday(value: string): number {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const candidate = normalized(value);
  const index = names.findIndex((name) => candidate === name || candidate.startsWith(name.slice(0, 3)));
  return index >= 0 ? index : 0;
}

function titleDivision(title: StartingUniverseTitle): ChampionshipDivision {
  const description = normalized(`${title.style} ${title.function} ${title.importedName}`);
  if (description.includes("trio") || title.holderIds.length === 3) return "Trios";
  if (description.includes("tag") || title.holderIds.length === 2) return "Tag Team";
  return "Singles";
}

function titleClassification(title: StartingUniverseTitle): ChampionshipClassification {
  const value = normalized(`${title.level} ${title.function}`);
  if (value.includes("world") || value.includes("main event")) return "Primary";
  if (value.includes("tournament")) return "Tournament";
  if (value.includes("secondary") || value.includes("midcard")) return "Secondary";
  if (value.includes("special")) return "Specialty";
  return "Custom";
}

function relationshipType(source: StartingUniverseRelationship): WorkerRelationshipType | null {
  if (normalized(source.family) && normalized(source.family) !== "none") return "Family";
  if (normalized(source.mentorProtege) && normalized(source.mentorProtege) !== "none") return "Mentor / Student";
  const personal = normalized(`${source.personal} ${source.romantic}`);
  if (!personal || personal === "none") return null;
  if (/friend|loyal|positive|close/.test(personal)) return "Ally";
  if (/hate|dislike|negative|enemy/.test(personal)) return "Rival";
  if (/respect/.test(personal)) return "Respect";
  return "Other";
}

function importedProvenance(field: ProfileFieldKey, value: string | number, record: StartingUniverseRecord, timestamp: string): ProfileFieldProvenance {
  return {
    field,
    source: field === "overall" || field === "health" || field === "popularity" || field === "experience" || field === "fanReaction" || field === "gimmick" ? "Derived" : "Imported from TEW",
    sourceFile: record.source.fileName,
    sourceSheet: "Starting Universe",
    importSessionId: record.id,
    importedValue: value,
    manualOverrideValue: null,
    note: `Activated from Starting Universe ${record.name} (${record.source.fingerprint}).`,
    updatedAt: timestamp,
  };
}

export function activateStartingUniverseData(
  record: StartingUniverseRecord,
  current: Omit<StartingUniverseActivationData, "report">,
): StartingUniverseActivationData {
  if (record.status !== "Confirmed") throw new Error("Confirm the starting universe before activating it.");
  const timestamp = new Date().toISOString();
  const report = emptyReport(record, timestamp);
  const ledger = { ...current.activation.ledger };
  const company = record.companies.find((item) => item.id === record.playableCompanyId);
  if (!company) throw new Error("The selected playable company is missing from the Starting Universe.");

  const importedMatchProfiles = applyStartingRosterToMatchEngine(record, { profiles: [] }, true).universe.profiles;
  const matchProfiles = [...current.matchEngine.profiles];
  for (const imported of importedMatchProfiles) {
    const existingIndex = matchProfiles.findIndex((item) => item.workerKey === imported.workerKey);
    const existing = existingIndex >= 0 ? matchProfiles[existingIndex] : undefined;
    const incoming = { ...imported, id: existing?.id ?? imported.id, createdAt: existing?.createdAt ?? imported.createdAt, updatedAt: timestamp };
    const result = managedUpsert({ key: `match-engine:${record.id}:${imported.workerKey}`, existing, incoming, ledger, timestamp });
    if (existingIndex >= 0) matchProfiles[existingIndex] = result.value; else matchProfiles.push(result.value);
    count(report, "Match Engine", result.disposition);
  }
  const matchEngine = { ...current.matchEngine, profiles: matchProfiles };

  const profiles = [...current.workers.profiles];
  const workerProfileId = new Map<string, string>();
  for (const decision of record.review.roster.filter((item) => item.included)) {
    const worker = record.workers.find((item) => item.id === decision.workerId);
    const contract = contractFor(record, decision.workerId);
    if (!worker) { count(report, "Worker Hub", "skipped"); continue; }
    const id = sourceId(record, "worker", worker.id);
    const existingIndex = profiles.findIndex((item) => item.id === id || item.linkedTewWorkerId === worker.id);
    const existing = existingIndex >= 0 ? profiles[existingIndex] : undefined;
    const base = createWorkerProfile(profiles.length + 1, { key: worker.id, name: contract?.ringName || worker.name, source: "tew", tewWorkerId: worker.id, roles: [decision.primaryRole], brands: contract?.brand ? [contract.brand] : [], appearanceCount: 0 });
    const incoming: WorkerProfile = {
      ...base,
      id: existing?.id ?? id,
      displayName: contract?.ringName || worker.name,
      linkedTewWorkerId: worker.id,
      linkedTewWorkerName: worker.name,
      companyId: company.id,
      companyName: company.name,
      currentRole: decision.primaryRole,
      alignment: alignmentFor(contract),
      brand: contract?.brand ?? "",
      gimmickSummary: contract?.gimmick ?? "",
      privateNotes: `Imported from ${record.source.fileName}. Source worker ${worker.id}; contract ${contract?.id ?? "not found"}.`,
      arcs: existing?.arcs ?? [],
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const result = managedUpsert({ key: `worker:${id}`, existing, incoming, ledger, timestamp });
    if (existingIndex >= 0) profiles[existingIndex] = result.value; else profiles.push(result.value);
    workerProfileId.set(worker.id, result.value.id);
    count(report, "Worker Hub", result.disposition);
  }

  const relationships = [...current.workers.relationships];
  const includedWorkerIds = new Set(record.review.roster.filter((item) => item.included).map((item) => item.workerId));
  const addRelationship = (id: string, workerA: string, workerB: string, type: WorkerRelationshipType, description: string, notes: string) => {
    const workerAId = workerProfileId.get(workerA);
    const workerBId = workerProfileId.get(workerB);
    if (!workerAId || !workerBId || workerAId === workerBId) { count(report, "Teams & Relationships", "skipped"); return; }
    const existingIndex = relationships.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? relationships[existingIndex] : undefined;
    const base = createWorkerRelationship(workerAId, workerBId);
    const incoming: WorkerRelationship = { ...base, id, workerAId, workerBId, type, status: "Active", startDate: dateValue(record.source.gameDate), importance: type === "Tag Partner" ? 80 : type === "Stable Member" ? 60 : 50, publicDescription: description, privateNotes: notes, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    const result = managedUpsert({ key: `relationship:${id}`, existing, incoming, ledger, timestamp });
    if (existingIndex >= 0) relationships[existingIndex] = result.value; else relationships.push(result.value);
    count(report, "Teams & Relationships", result.disposition);
  };

  for (const decision of record.review.tagTeams.filter((item) => item.included)) {
    const variant = record.tagTeamVariants.find((item) => item.id === decision.selectedVariantId);
    if (!variant) { count(report, "Teams & Relationships", "skipped"); continue; }
    addRelationship(sourceId(record, "tag-team", decision.id), variant.worker1Id, variant.worker2Id, "Tag Partner", decision.gameName, `Imported tag team ${variant.id}; experience ${variant.experience}; finisher ${variant.finisher || "not supplied"}.`);
  }
  for (const decision of record.review.stables.filter((item) => item.included)) {
    const stable = record.stables.find((item) => item.id === decision.stableId);
    if (!stable) { count(report, "Teams & Relationships", "skipped"); continue; }
    const members = stable.members.filter((item) => includedWorkerIds.has(item.workerId));
    for (let index = 0; index < members.length; index += 1) for (let second = index + 1; second < members.length; second += 1) {
      addRelationship(sourceId(record, "stable", `${stable.id}:${members[index].workerId}:${members[second].workerId}`), members[index].workerId, members[second].workerId, "Stable Member", decision.gameName, `Imported stable ${stable.id}; roles: ${members[index].role || "member"} / ${members[second].role || "member"}.`);
    }
  }
  for (const source of record.relationships) {
    if (!includedWorkerIds.has(source.worker1Id) || !includedWorkerIds.has(source.worker2Id)) continue;
    const type = relationshipType(source);
    if (!type) continue;
    addRelationship(sourceId(record, "relationship", source.id), source.worker1Id, source.worker2Id, type, [source.family, source.personal, source.mentorProtege].filter(Boolean).join(" · "), `Imported relationship ${source.id} from ${record.source.fileName}.`);
  }
  const workers = { profiles, relationships };

  const titleRecords = [...current.championships.championships];
  for (const decision of record.review.titles.filter((item) => item.included)) {
    const title = record.titles.find((item) => item.id === decision.titleId);
    if (!title) { count(report, "Championships", "skipped"); continue; }
    const id = sourceId(record, "title", title.id);
    const existingIndex = titleRecords.findIndex((item) => item.id === id || item.linkedTewTitleId === title.id);
    const existing = existingIndex >= 0 ? titleRecords[existingIndex] : undefined;
    const champions = title.holderIds.map((workerId, index) => ({ id: workerProfileId.get(workerId) ?? workerId, name: contractFor(record, workerId)?.ringName || title.holderNames[index] || record.workers.find((item) => item.id === workerId)?.name || workerId }));
    const base = createChampionship(titleRecords.length + 1);
    const status: Championship["status"] = !title.active ? "Inactive" : champions.length ? "Active" : "Vacant";
    const incoming: Championship = { ...base, id: existing?.id ?? id, name: decision.gameName, company: company.name, division: titleDivision(title), classification: titleClassification(title), status, linkedTewTitleId: title.id, linkedTewTitleName: title.importedName, currentChampions: champions, dateWon: dateValue(title.reignBegan), defenses: Math.max(0, title.defences), privateNotes: `Imported from ${record.source.fileName}. Source title ${title.id}; prestige ${title.prestige}; level ${title.level || "not supplied"}.`, reigns: champions.length ? [{ ...createChampionshipReign(champions, [], dateValue(title.reignBegan)), id: sourceId(record, "reign", title.id), successfulDefenses: Math.max(0, title.defences), notes: `Imported current reign. Last defense: ${dateValue(title.lastDefence) || "not supplied"}.`, createdAt: existing?.reigns[0]?.createdAt ?? timestamp, updatedAt: timestamp }] : [], createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    const result = managedUpsert({ key: `title:${id}`, existing, incoming, ledger, timestamp });
    if (existingIndex >= 0) titleRecords[existingIndex] = result.value; else titleRecords.push(result.value);
    count(report, "Championships", result.disposition);
  }
  const championships = { championships: titleRecords };

  const series = [...current.schedule.series];
  for (const decision of record.review.tvShows.filter((item) => item.included)) {
    const show = record.tvShows.find((item) => item.id === decision.tvShowId);
    if (!show) { count(report, "Television", "skipped"); continue; }
    const id = sourceId(record, "television", show.id);
    const existingIndex = series.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? series[existingIndex] : undefined;
    const base = createShowSeries(series.length + 1);
    const incoming: ShowSeries = { ...base, id, name: decision.gameName, company: company.name, brand: show.brand, category: "Weekly Television", status: show.dormant || !show.currentlyOnAir ? "Inactive" : "Active", defaultMinutes: decision.lengthMinutes, recurrence: "Weekly", intervalDays: 7, defaultDayOfWeek: weekday(decision.showDay), startDate: dateValue(record.source.gameDate), namingPattern: "{series} #{episode}", productionNotes: `Imported from ${record.source.fileName}. Source television show ${show.id}; imported day ${decision.showDay}.`, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    const result = managedUpsert({ key: `television:${id}`, existing, incoming, ledger, timestamp });
    if (existingIndex >= 0) series[existingIndex] = result.value; else series.push(result.value);
    count(report, "Television", result.disposition);
  }
  const firstActivation = current.activation.activeUniverseId !== record.id;
  const schedule = { ...current.schedule, series, settings: firstActivation ? { ...current.schedule.settings, month: dateValue(record.source.gameDate).slice(0, 7), selectedSeriesId: series.find((item) => item.id.startsWith(sourceId(record, "television", "")))?.id ?? current.schedule.settings.selectedSeriesId } : current.schedule.settings };

  const existingProfileKeys = new Set(current.profiles.records.map((item) => item.workerKey));
  let profileLibrary = synchronizeProfileLibrary(matchEngine, current.profiles, null);
  profileLibrary = { ...profileLibrary, records: profileLibrary.records.map((libraryRecord) => {
    const profile = matchEngine.profiles.find((item) => item.workerKey === libraryRecord.workerKey);
    if (!profile || profile.workerSource !== "tew" || !includedWorkerIds.has(profile.workerId)) return libraryRecord;
    if (existingProfileKeys.has(libraryRecord.workerKey)) { count(report, "Wrestler Profiles", "preserved"); return libraryRecord; }
    const created = createProfileLibraryRecord(profile, null, libraryRecord);
    const fields = ["name", "tewWorkerId", "styleId", "overall", "health", "popularity", "experience", "fanReaction", "gimmick", ...Object.keys(profile.skills)] as ProfileFieldKey[];
    const provenance = { ...created.provenance };
    for (const field of fields) {
      const value = field === "name" ? profile.workerName : field === "tewWorkerId" ? profile.workerId : field === "styleId" ? profile.styleId : field in profile.skills ? profile.skills[field as keyof typeof profile.skills] : profile[field as keyof typeof profile] as string | number;
      provenance[field] = importedProvenance(field, value, record, timestamp);
    }
    count(report, "Wrestler Profiles", "created");
    return { ...created, identity: { status: "Confirmed", tewWorkerId: profile.workerId, tewWorkerName: record.workers.find((item) => item.id === profile.workerId)?.name ?? profile.workerName, candidateWorkerIds: [], method: "Exact worker ID", confirmedAt: timestamp }, provenance, updatedAt: timestamp };
  }) };

  const importedPromotion: PromotionIdentity = { ...current.vault.promotion, status: "Completed", promotionName: company.name, abbreviation: company.initials, defaultBrand: record.review.roster.map((item) => contractFor(record, item.workerId)?.brand).find(Boolean) ?? "", defaultWeeklyShow: record.review.tvShows.find((item) => item.included)?.gameName ?? "", defaultShowLength: record.review.tvShows.find((item) => item.included)?.lengthMinutes ?? current.vault.promotion.defaultShowLength, calendarStartDate: dateValue(record.source.gameDate), createdAt: current.vault.promotion.createdAt || timestamp, updatedAt: timestamp, completedAt: current.vault.promotion.completedAt || timestamp };
  const promotionResult = managedUpsert({ key: `game:${record.id}`, existing: current.vault.promotion.promotionName ? current.vault.promotion : undefined, incoming: importedPromotion, ledger, timestamp });
  count(report, "Game", promotionResult.disposition);
  const vault = { ...current.vault, promotion: promotionResult.value };

  const activation: StartingUniverseActivationState = { activeUniverseId: record.id, activeCompanyId: company.id, activeCompanyName: company.name, gameDate: dateValue(record.source.gameDate), activatedAt: timestamp, nextShowId: current.activation.nextShowId, ledger, lastReport: report };
  return { matchEngine, workers, profiles: profileLibrary, championships, schedule, vault, activation, report };
}

export function activateStartingUniverseInStorage(record: StartingUniverseRecord, storage: Storage): StartingUniverseActivationReport {
  const result = activateStartingUniverseData(record, {
    matchEngine: loadMatchEngineUniverse(storage),
    workers: loadWorkerUniverse(storage),
    profiles: loadProfileLibraryUniverse(storage),
    championships: loadChampionshipUniverse(storage),
    schedule: loadPromotionScheduleUniverse(storage),
    vault: loadSnapshotVaultUniverse(storage),
    activation: loadStartingUniverseActivationState(storage),
  });
  saveMatchEngineUniverse(storage, result.matchEngine);
  saveWorkerUniverse(storage, result.workers);
  saveProfileLibraryUniverse(storage, result.profiles);
  saveChampionshipUniverse(storage, result.championships);
  savePromotionScheduleUniverse(storage, result.schedule);
  saveSnapshotVaultUniverse(storage, result.vault);
  const quickStart = ensurePlayableFirstDayInStorage(storage, result.activation);
  saveStartingUniverseActivationState(storage, { ...result.activation, nextShowId: quickStart.nextShow?.id ?? result.activation.nextShowId });
  return result.report;
}
