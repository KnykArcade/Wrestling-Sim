import { createMatchEngineProfile } from "../matchEngine/model";
import type { MatchEngineProfile, MatchEngineUniverse, WrestlerSkill, WrestlerStyleId } from "../matchEngine/types";
import { APPROACH_FORMULA_CATALOG_VERSION, calculateWorkbookMetrics, skillRecord } from "./formulas";
import type { ParsedTewExport, RawTewRow, RawTewTables, RawTewValue } from "./parser";
import type {
  StartingRosterClass,
  StartingUniverseAttribute,
  StartingUniverseCompany,
  StartingUniverseContract,
  StartingUniverseManifestRecord,
  StartingUniverseRecord,
  StartingUniverseRelationship,
  StartingUniverseReview,
  StartingUniverseReviewIssue,
  StartingUniverseRosterDecision,
  StartingUniverseStable,
  StartingUniverseStableDecision,
  StartingUniverseTagTeamDecision,
  StartingUniverseTagTeamVariant,
  StartingUniverseTitle,
  StartingUniverseTitleDecision,
  StartingUniverseTvShow,
  StartingUniverseTvShowDecision,
  StartingUniverseWorker,
  StartingUniverseWorkerFlags,
} from "./types";

const WORKER_SKILLS: WrestlerSkill[] = [
  "Aerial", "Athleticism", "Basics", "Brawling", "Charisma", "Consistency", "Flashiness", "Hardcore", "Menace", "Power", "Psychology", "Puroresu", "Resilience", "Safety", "Selling", "Stamina", "Technical", "Toughness",
];

const POPULARITY_FIELDS = [
  "Great_Lakes", "Mid_Atlantic", "Mid_South", "Mid_West", "New_England", "North_West", "South_East", "South_West", "Tri_State", "Puerto_Rico", "Hawaii",
  "Maritimes", "Quebec", "Ontario", "Alberta", "Saskatchewan", "Manitoba", "British_Columbia", "Noreste", "Noroccidente", "Sureste", "Sur", "Centro", "Occidente",
  "Midlands", "Northern_England", "Scotland", "Southern_England", "Ireland", "Wales", "Tohoku", "Kanto", "Chubu", "Kinki", "Chugoku", "Shikoku", "Kyushu", "Hokkaido",
  "Western_Europe", "Iberia", "Southern_Med", "Southern_Europe", "Central_Europe", "Northern_Europe", "Eastern_Central_Europe", "Eastern_Europe",
  "New_South_Wales", "Queensland", "South_Australia", "Victoria", "Western_Australia", "Tasmania", "New_Zealand", "Northern_India", "Eastern_India", "Southern_India", "Western_India",
];

function now(): string {
  return new Date().toISOString();
}

export function startingUniverseId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value: RawTewValue | undefined, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function numeric(value: RawTewValue | undefined, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rating(value: RawTewValue | undefined, fallback = 0): number {
  const parsed = numeric(value, fallback);
  if (parsed < 0) return fallback;
  return parsed > 100 ? Math.round(parsed) / 10 : parsed;
}

function nullableRating(value: RawTewValue | undefined): number | null {
  const parsed = numeric(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed > 100 ? Math.round(parsed) / 10 : parsed;
}

function booleanValue(value: RawTewValue | undefined): boolean {
  if (typeof value === "number") return value !== 0;
  const normalized = text(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rowValue(row: RawTewRow, key: string): RawTewValue | undefined {
  if (key in row) return row[key];
  const actual = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return actual ? row[actual] : undefined;
}

function flags(row: RawTewRow): StartingUniverseWorkerFlags {
  return {
    wrestler: booleanValue(rowValue(row, "Wrestler")),
    occasionalWrestler: booleanValue(rowValue(row, "Occasional_Wrestler")),
    referee: booleanValue(rowValue(row, "Referee")),
    announcer: booleanValue(rowValue(row, "Announcer")),
    colourCommentator: booleanValue(rowValue(row, "Colour_Commentator")),
    manager: booleanValue(rowValue(row, "Manager")),
    onScreenPersonality: booleanValue(rowValue(row, "On_Screen_Personality")),
    roadAgent: booleanValue(rowValue(row, "Road_Agent")),
  };
}

function mapWorker(row: RawTewRow): StartingUniverseWorker {
  const popularity = Object.fromEntries(POPULARITY_FIELDS.map((field) => [field, rating(rowValue(row, field))]));
  const skillValues = Object.fromEntries(WORKER_SKILLS.map((skill) => [skill, rating(rowValue(row, skill))])) as Partial<Record<WrestlerSkill, number>>;
  return {
    id: text(rowValue(row, "UID")),
    name: text(rowValue(row, "Name"), "Unnamed Worker"),
    active: booleanValue(rowValue(row, "Active")),
    basedIn: text(rowValue(row, "Based_In")),
    status: text(rowValue(row, "Status")),
    style: text(rowValue(row, "Style")),
    bodyType: text(rowValue(row, "BodyType")),
    nationality: text(rowValue(row, "Nationality")),
    race: text(rowValue(row, "Race")),
    height: text(rowValue(row, "Height")),
    weight: numeric(rowValue(row, "Weight")),
    debut: text(rowValue(row, "Debut")),
    birthday: text(rowValue(row, "Birthday")),
    picture: text(rowValue(row, "Picture")),
    profile: text(rowValue(row, "Profile")),
    flags: flags(row),
    physical: {
      head: rating(rowValue(row, "Physical_Head"), 100),
      body: rating(rowValue(row, "Physical_Body"), 100),
      arms: rating(rowValue(row, "Physical_Arms"), 100),
      legs: rating(rowValue(row, "Physical_Legs"), 100),
    },
    skills: skillRecord(skillValues),
    looks: rating(rowValue(row, "Looks")),
    starQuality: rating(rowValue(row, "Star_Quality")),
    reputation: rating(rowValue(row, "Reputation")),
    respect: rating(rowValue(row, "Respect")),
    experience: rating(rowValue(row, "Experience")),
    popularity,
  };
}

function mapContract(row: RawTewRow): StartingUniverseContract {
  const companyId = text(rowValue(row, "CompanyUID"));
  const workerId = text(rowValue(row, "WorkerUID"));
  return {
    id: `${companyId}:${workerId}`,
    companyId,
    companyName: text(rowValue(row, "CompanyName")),
    workerId,
    workerName: text(rowValue(row, "WorkerName")),
    ringName: text(rowValue(row, "Name"), text(rowValue(row, "WorkerName"))),
    shortName: text(rowValue(row, "Shortname")),
    perception: text(rowValue(row, "Perception")),
    babyface: booleanValue(rowValue(row, "Babyface")),
    gimmick: text(rowValue(row, "Gimmick")),
    gimmickRating: nullableRating(rowValue(row, "Gimmick_Rating")),
    rosterUsage: text(rowValue(row, "RosterUsage")),
    intendedRole: text(rowValue(row, "IntendedRole")),
    brand: text(rowValue(row, "Brand")),
    momentum: rating(rowValue(row, "Momentum")),
    exclusive: booleanValue(rowValue(row, "Exclusive_Contract")),
    written: booleanValue(rowValue(row, "Written_Contract")),
    daysLeft: numeric(rowValue(row, "Days_Left")),
    datesLeft: numeric(rowValue(row, "Dates_Left")),
    amount: numeric(rowValue(row, "Amount")),
    downside: numeric(rowValue(row, "Downside")),
    contractBegan: text(rowValue(row, "Contract_Began")),
    debuted: text(rowValue(row, "Debuted")),
    flags: flags(row),
  };
}

function companyNameMap(tables: RawTewTables): Map<string, string> {
  const result = new Map<string, string>();
  for (const tableName of ["Contracts", "Title_Belts", "TV_Shows", "Tag_Teams", "Stables"]) {
    for (const row of tables[tableName] ?? []) {
      const id = text(rowValue(row, "CompanyUID"));
      const name = text(rowValue(row, tableName === "TV_Shows" ? "Company_Name" : "CompanyName"));
      if (id && name && normalize(name) !== "none") result.set(id, name);
    }
  }
  return result;
}

function mapCompanies(tables: RawTewTables): StartingUniverseCompany[] {
  const names = companyNameMap(tables);
  return (tables.Companies ?? []).map((row) => {
    const id = text(rowValue(row, "UID"));
    const initials = text(rowValue(row, "Initials"));
    const profile = text(rowValue(row, "Profile"));
    return {
      id,
      name: names.get(id) || profile || initials || `Company ${id}`,
      initials,
      profile,
      active: booleanValue(rowValue(row, "Currently_Open")),
      userControlled: booleanValue(rowValue(row, "User_Controlled")),
      basedIn: text(rowValue(row, "Based_In")),
      size: text(rowValue(row, "Size")),
      prestige: rating(rowValue(row, "Prestige")),
      ranking: numeric(rowValue(row, "Ranking")),
      momentum: rating(rowValue(row, "Momentum")),
      money: numeric(rowValue(row, "Money")),
      ownerName: text(rowValue(row, "Owner")),
      headBookerName: text(rowValue(row, "Headbooker")),
      styleName: text(rowValue(row, "Style_Name")),
      productBase: text(rowValue(row, "Product_Base")),
    };
  }).filter((company) => company.id).sort((left, right) => left.name.localeCompare(right.name));
}

function mapTitles(rows: RawTewRow[]): StartingUniverseTitle[] {
  return rows.map((row) => ({
    id: text(rowValue(row, "UID")),
    companyId: text(rowValue(row, "CompanyUID")),
    companyName: text(rowValue(row, "CompanyName")),
    importedName: text(rowValue(row, "Name"), "Unnamed Title"),
    style: text(rowValue(row, "BeltStyle")),
    level: text(rowValue(row, "BeltLevel")),
    prestige: rating(rowValue(row, "Prestige")),
    function: text(rowValue(row, "Function")),
    active: booleanValue(rowValue(row, "Active")),
    holderIds: ["Holder1", "Holder2", "Holder3"].map((key) => text(rowValue(row, key))).filter((value) => value && value !== "0"),
    holderNames: ["HolderName1", "HolderName2", "HolderName3"].map((key) => text(rowValue(row, key))).filter((value) => value && normalize(value) !== "none"),
    defences: numeric(rowValue(row, "Defences"), -1),
    annualTitle: booleanValue(rowValue(row, "Annual_Title")),
    annualEvent: text(rowValue(row, "Annual_Event")),
    reignBegan: text(rowValue(row, "Reign_Began")),
    lastDefence: text(rowValue(row, "Last_Defence")),
    genderLimit: text(rowValue(row, "Gender_Limit")),
    minimumWeight: numeric(rowValue(row, "Minimum_Weight")),
    maximumWeight: numeric(rowValue(row, "Maximum_Weight")),
  })).filter((title) => title.id);
}

function mapTvShows(rows: RawTewRow[]): StartingUniverseTvShow[] {
  return rows.map((row, index) => ({
    id: `${text(rowValue(row, "CompanyUID"))}:${text(rowValue(row, "Name")) || index}`,
    companyId: text(rowValue(row, "CompanyUID")),
    companyName: text(rowValue(row, "Company_Name")),
    importedName: text(rowValue(row, "Name"), "Unnamed TV Show"),
    prestige: rating(rowValue(row, "Prestige")),
    bShow: booleanValue(rowValue(row, "B_Show")),
    lengthMinutes: numeric(rowValue(row, "Length")),
    brand: text(rowValue(row, "Brand")),
    showDay: text(rowValue(row, "Showday")),
    currentlyOnAir: booleanValue(rowValue(row, "Currently_On_Air")),
    dormant: booleanValue(rowValue(row, "Dormant")),
    announcerNames: ["Announcer1_Name", "Announcer2_Name", "Announcer3_Name"].map((key) => text(rowValue(row, key))).filter((value) => value && normalize(value) !== "none"),
  }));
}

function mapTagTeams(rows: RawTewRow[]): StartingUniverseTagTeamVariant[] {
  return rows.map((row) => ({
    id: text(rowValue(row, "UID")),
    name: text(rowValue(row, "Name"), "Unnamed Team"),
    companyId: text(rowValue(row, "CompanyUID")),
    companyName: text(rowValue(row, "CompanyName")),
    worker1Id: text(rowValue(row, "Worker1")),
    worker1Name: text(rowValue(row, "WorkerName1")),
    worker2Id: text(rowValue(row, "Worker2")),
    worker2Name: text(rowValue(row, "WorkerName2")),
    teamType: text(rowValue(row, "Team_Type")),
    experience: rating(rowValue(row, "Experience")),
    finisher: text(rowValue(row, "Finisher")),
    active: booleanValue(rowValue(row, "Active")),
    formed: text(rowValue(row, "Formed")),
  })).filter((team) => team.id && team.worker1Id && team.worker2Id);
}

function mapStables(rows: RawTewRow[]): StartingUniverseStable[] {
  return rows.map((row, index) => {
    const members: StartingUniverseStable["members"] = [];
    for (let memberIndex = 1; memberIndex <= 20; memberIndex += 1) {
      const workerId = text(rowValue(row, `Member${memberIndex}`));
      if (!workerId || workerId === "0") continue;
      members.push({
        workerId,
        workerName: text(rowValue(row, `MemberName${memberIndex}`), text(rowValue(row, `Name${memberIndex}`))),
        role: text(rowValue(row, `Role${memberIndex}`)),
      });
    }
    return {
      id: `${text(rowValue(row, "CompanyUID"))}:${text(rowValue(row, "Name")) || index}`,
      name: text(rowValue(row, "Name"), "Unnamed Stable"),
      companyId: text(rowValue(row, "CompanyUID")),
      companyName: text(rowValue(row, "CompanyName")),
      active: booleanValue(rowValue(row, "Active")),
      type: text(rowValue(row, "Type")),
      members,
    };
  }).filter((stable) => stable.members.length > 0);
}

function mapRelationships(rows: RawTewRow[]): StartingUniverseRelationship[] {
  return rows.map((row, index) => ({
    id: `${text(rowValue(row, "WorkerUID1"))}:${text(rowValue(row, "WorkerUID2"))}:${index}`,
    worker1Id: text(rowValue(row, "WorkerUID1")),
    worker1Name: text(rowValue(row, "Worker1_Name")),
    worker2Id: text(rowValue(row, "WorkerUID2")),
    worker2Name: text(rowValue(row, "Worker2_Name")),
    family: text(rowValue(row, "Family_Relationship")),
    personal: text(rowValue(row, "Personal_Relationship")),
    romantic: text(rowValue(row, "Romantic_Relationship")),
    mentorProtege: text(rowValue(row, "Mentor_And_Protege")),
  })).filter((relationship) => relationship.worker1Id && relationship.worker2Id);
}

function mapAttributes(rows: RawTewRow[]): StartingUniverseAttribute[] {
  return rows.map((row) => ({
    workerId: text(rowValue(row, "WorkerUID")),
    workerName: text(rowValue(row, "Worker_Name")),
    attribute: text(rowValue(row, "Attribute")),
    hidden: booleanValue(rowValue(row, "Hidden")),
  })).filter((attribute) => attribute.workerId && attribute.attribute);
}

function rosterClass(worker: StartingUniverseWorker, contract: StartingUniverseContract): StartingRosterClass {
  const wrestler = contract.flags.wrestler || contract.flags.occasionalWrestler || worker.flags.wrestler || worker.flags.occasionalWrestler;
  const staff = contract.flags.referee || contract.flags.announcer || contract.flags.colourCommentator || contract.flags.manager || contract.flags.onScreenPersonality || contract.flags.roadAgent || worker.flags.referee || worker.flags.announcer || worker.flags.colourCommentator || worker.flags.manager || worker.flags.onScreenPersonality || worker.flags.roadAgent;
  return wrestler && staff ? "Dual Role" : wrestler ? "Wrestler" : "Staff";
}

function primaryRole(worker: StartingUniverseWorker, contract: StartingUniverseContract, company: StartingUniverseCompany): string {
  if (normalize(worker.name) === normalize(company.ownerName)) return "Owner";
  if (normalize(worker.name) === normalize(company.headBookerName)) return "Head Booker";
  if (contract.flags.roadAgent || worker.flags.roadAgent) return "Road Agent";
  if (contract.flags.announcer || worker.flags.announcer) return "Announcer";
  if (contract.flags.colourCommentator || worker.flags.colourCommentator) return "Colour Commentator";
  if (contract.flags.referee || worker.flags.referee) return "Referee";
  if (contract.flags.manager || worker.flags.manager) return "Manager";
  if (contract.flags.onScreenPersonality || worker.flags.onScreenPersonality) return "On-Screen Personality";
  return "Wrestler";
}

function buildRoster(record: StartingUniverseRecord, companyId: string, previous: StartingUniverseRosterDecision[] = []): StartingUniverseRosterDecision[] {
  const company = record.companies.find((item) => item.id === companyId);
  if (!company) return [];
  const workers = new Map(record.workers.map((worker) => [worker.id, worker]));
  const previousByWorker = new Map(previous.map((decision) => [decision.workerId, decision]));
  return record.contracts.filter((contract) => contract.companyId === companyId).flatMap((contract) => {
    const worker = workers.get(contract.workerId);
    if (!worker) return [];
    const existing = previousByWorker.get(worker.id);
    return [{
      workerId: worker.id,
      contractId: contract.id,
      included: existing?.included ?? true,
      rosterClass: existing?.rosterClass ?? rosterClass(worker, contract),
      primaryRole: existing?.primaryRole ?? primaryRole(worker, contract, company),
      addedFromWorld: existing?.addedFromWorld ?? false,
      note: existing?.note ?? "",
      workbookMetrics: calculateWorkbookMetrics(worker, contract),
    }];
  }).sort((left, right) => {
    const leftWorker = workers.get(left.workerId)?.name ?? "";
    const rightWorker = workers.get(right.workerId)?.name ?? "";
    return leftWorker.localeCompare(rightWorker);
  });
}

function bestTeamVariant(variants: StartingUniverseTagTeamVariant[], companyId: string): StartingUniverseTagTeamVariant {
  return [...variants].sort((left, right) => {
    const leftScore = (left.companyId === companyId ? 1000 : left.companyId === "0" ? 500 : 0) + (left.active ? 100 : 0) + left.experience;
    const rightScore = (right.companyId === companyId ? 1000 : right.companyId === "0" ? 500 : 0) + (right.active ? 100 : 0) + right.experience;
    return rightScore - leftScore || left.name.localeCompare(right.name);
  })[0];
}

function buildTeamDecisions(record: StartingUniverseRecord, companyId: string, roster: StartingUniverseRosterDecision[], previous: StartingUniverseTagTeamDecision[] = []): StartingUniverseTagTeamDecision[] {
  const includedIds = new Set(roster.filter((decision) => decision.included).map((decision) => decision.workerId));
  const workerNames = new Map(record.workers.map((worker) => [worker.id, worker.name]));
  const grouped = new Map<string, StartingUniverseTagTeamVariant[]>();
  for (const variant of record.tagTeamVariants) {
    if (!includedIds.has(variant.worker1Id) || !includedIds.has(variant.worker2Id)) continue;
    const pair = [variant.worker1Id, variant.worker2Id].sort();
    const key = pair.join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), variant]);
  }
  const previousById = new Map(previous.map((decision) => [decision.id, decision]));
  return [...grouped.entries()].map(([id, variants]) => {
    const selected = bestTeamVariant(variants, companyId);
    const pair = id.split(":") as [string, string];
    const existing = previousById.get(id);
    return {
      id,
      workerIds: pair,
      workerNames: [workerNames.get(pair[0]) ?? selected.worker1Name, workerNames.get(pair[1]) ?? selected.worker2Name],
      selectedVariantId: existing?.selectedVariantId && variants.some((variant) => variant.id === existing.selectedVariantId) ? existing.selectedVariantId : selected.id,
      included: existing?.included ?? true,
      gameName: existing?.gameName ?? selected.name,
      acknowledged: existing?.acknowledged ?? variants.length === 1,
      variantIds: variants.map((variant) => variant.id),
      note: existing?.note ?? "",
    };
  }).sort((left, right) => left.gameName.localeCompare(right.gameName));
}

function buildStableDecisions(record: StartingUniverseRecord, companyId: string, roster: StartingUniverseRosterDecision[], previous: StartingUniverseStableDecision[] = []): StartingUniverseStableDecision[] {
  const includedIds = new Set(roster.filter((decision) => decision.included).map((decision) => decision.workerId));
  const previousById = new Map(previous.map((decision) => [decision.stableId, decision]));
  return record.stables.filter((stable) => stable.companyId === companyId || stable.members.filter((member) => includedIds.has(member.workerId)).length >= 2).map((stable) => {
    const existing = previousById.get(stable.id);
    return {
      stableId: stable.id,
      included: existing?.included ?? stable.companyId === companyId,
      gameName: existing?.gameName ?? stable.name,
      acknowledged: existing?.acknowledged ?? stable.companyId === companyId,
    };
  });
}

function reviewIssues(record: StartingUniverseRecord, companyId: string, review: Omit<StartingUniverseReview, "issues">): StartingUniverseReviewIssue[] {
  const company = record.companies.find((item) => item.id === companyId);
  if (!company) return [{ id: "no-company", severity: "Blocking", area: "Company", message: "No playable company is selected", detail: "Choose one imported company before reviewing a starting roster.", relatedId: "" }];
  const issues: StartingUniverseReviewIssue[] = record.source.warnings.map((warning, index) => ({ id: `source:${index}`, severity: "Important", area: "Source", message: warning, detail: "The importer preserved all available supported tables and did not invent the missing data.", relatedId: "" }));
  const includedRoster = review.roster.filter((decision) => decision.included);
  const wrestlers = includedRoster.filter((decision) => decision.rosterClass !== "Staff");
  const staff = includedRoster.filter((decision) => decision.rosterClass !== "Wrestler");
  if (wrestlers.length < 2) issues.push({ id: "too-few-wrestlers", severity: "Blocking", area: "Roster", message: "The playable company needs at least two included wrestlers", detail: "Add imported workers from the world or restore roster contracts before confirming the universe.", relatedId: companyId });
  issues.push({ id: "roster-summary", severity: "Information", area: "Roster", message: `${wrestlers.length} wrestler-enabled roster members and ${staff.length} staff-enabled roster members`, detail: `${includedRoster.length} total imported contracts are currently included for ${company.name}.`, relatedId: companyId });
  const globalTitle = review.titles.find((decision) => normalize(record.titles.find((title) => title.id === decision.titleId)?.importedName ?? "").includes("global championship"));
  const nationalTitle = review.titles.find((decision) => normalize(decision.gameName).includes("national championship"));
  if (globalTitle && !nationalTitle) issues.push({ id: `global-title:${globalTitle.titleId}`, severity: "Important", area: "Titles", message: "The TEW export contains a Global Championship but no National Championship", detail: "The title name is not changed automatically. Rename or exclude it during title review if the standalone game should begin with the National Championship.", relatedId: globalTitle.titleId });
  const companySpecificTeams = record.tagTeamVariants.filter((team) => team.companyId === companyId);
  if (review.tagTeams.length > 0 && companySpecificTeams.length === 0) issues.push({ id: "global-team-candidates", severity: "Information", area: "Tag Teams", message: "No company-specific tag-team rows were found", detail: "The review shows global and other-company variants whose two members are both on the selected roster. Every team remains subject to confirmation.", relatedId: companyId });
  for (const decision of review.tagTeams.filter((item) => item.variantIds.length > 1 && !item.acknowledged)) issues.push({ id: `team-variants:${decision.id}`, severity: "Important", area: "Tag Teams", message: `${decision.workerNames.join(" and ")} have multiple imported team variants`, detail: "Choose the intended team identity and acknowledge the decision before confirming the universe.", relatedId: decision.id });
  if (review.stables.length === 0) issues.push({ id: "no-stables", severity: "Information", area: "Stables", message: "No stable is currently assigned to the playable company", detail: "This reflects the imported TEW data. The standalone universe begins without a stable unless an imported candidate is deliberately included.", relatedId: companyId });
  issues.push({ id: "sixteen-formulas", severity: "Information", area: "Formulas", message: "All 16 distinct Excel approach formulas are retained", detail: "Counter Specialist remains separate, and the workbook Ring General formula is preserved as Pace Controller for the later standalone outcome engine.", relatedId: APPROACH_FORMULA_CATALOG_VERSION });
  return issues;
}

function buildReview(record: StartingUniverseRecord, companyId: string, previous?: StartingUniverseReview): StartingUniverseReview {
  const roster = buildRoster(record, companyId, previous?.roster);
  const companyTitles = record.titles.filter((title) => title.companyId === companyId);
  const previousTitles = new Map(previous?.titles.map((decision) => [decision.titleId, decision]) ?? []);
  const titles: StartingUniverseTitleDecision[] = companyTitles.map((title) => {
    const existing = previousTitles.get(title.id);
    return { titleId: title.id, included: existing?.included ?? title.active, gameName: existing?.gameName ?? title.importedName, acknowledged: existing?.acknowledged ?? false, note: existing?.note ?? "" };
  });
  const previousShows = new Map(previous?.tvShows.map((decision) => [decision.tvShowId, decision]) ?? []);
  const tvShows: StartingUniverseTvShowDecision[] = record.tvShows.filter((show) => show.companyId === companyId).map((show) => {
    const existing = previousShows.get(show.id);
    return { tvShowId: show.id, included: existing?.included ?? show.currentlyOnAir, gameName: existing?.gameName ?? show.importedName, lengthMinutes: existing?.lengthMinutes ?? show.lengthMinutes, showDay: existing?.showDay ?? show.showDay, acknowledged: existing?.acknowledged ?? false };
  });
  const tagTeams = buildTeamDecisions(record, companyId, roster, previous?.tagTeams);
  const stables = buildStableDecisions(record, companyId, roster, previous?.stables);
  const draft = {
    roster,
    titles,
    tvShows,
    tagTeams,
    stables,
    rosterAcknowledged: previous?.rosterAcknowledged ?? false,
    titlesAcknowledged: previous?.titlesAcknowledged ?? false,
    teamsAcknowledged: previous?.teamsAcknowledged ?? false,
  };
  return { ...draft, issues: reviewIssues(record, companyId, draft) };
}

function preferredCompany(companies: StartingUniverseCompany[], contracts: StartingUniverseContract[]): string {
  const user = companies.find((company) => company.userControlled);
  if (user) return user.id;
  const pwl = companies.find((company) => normalize(company.initials) === "pwl" || normalize(company.name) === "pro wrestling league");
  if (pwl) return pwl.id;
  const counts = new Map<string, number>();
  for (const contract of contracts) counts.set(contract.companyId, (counts.get(contract.companyId) ?? 0) + 1);
  return [...companies].sort((left, right) => (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0))[0]?.id ?? "";
}

export function createStartingUniverse(parsed: ParsedTewExport): StartingUniverseRecord {
  const tables = parsed.tables;
  const companies = mapCompanies(tables);
  const workers = (tables.Workers ?? []).map(mapWorker).filter((worker) => worker.id);
  const contracts = (tables.Contracts ?? []).map(mapContract).filter((contract) => contract.companyId && contract.workerId);
  const databaseInfo = tables.Database_Info?.[0] ?? {};
  const saveInfo = tables.Save_Game_Info?.[0] ?? {};
  const timestamp = now();
  const record: StartingUniverseRecord = {
    id: startingUniverseId("starting-universe"),
    name: "Imported TEW Starting Universe",
    mode: "Standalone Universe",
    status: "Imported",
    source: {
      format: parsed.format,
      fileName: parsed.fileName,
      fileSize: parsed.fileSize,
      fingerprint: parsed.fingerprint,
      importedAt: timestamp,
      gameDate: text(rowValue(saveInfo, "Current_Date")),
      gameStartDate: text(rowValue(saveInfo, "Game_Start")),
      databaseTitle: text(rowValue(databaseInfo, "Database_Title")),
      databaseVersion: text(rowValue(databaseInfo, "Version_Number")),
      tableNames: parsed.tableNames,
      warnings: parsed.warnings,
    },
    playableCompanyId: "",
    companies,
    workers,
    contracts,
    titles: mapTitles(tables.Title_Belts ?? []),
    tvShows: mapTvShows(tables.TV_Shows ?? []),
    tagTeamVariants: mapTagTeams(tables.Tag_Teams ?? []),
    stables: mapStables(tables.Stables ?? []),
    relationships: mapRelationships(tables.Worker_Relationships ?? []),
    attributes: mapAttributes(tables.Attributes ?? []),
    review: { roster: [], titles: [], tvShows: [], tagTeams: [], stables: [], issues: [], rosterAcknowledged: false, titlesAcknowledged: false, teamsAcknowledged: false },
    approachFormulaVersion: APPROACH_FORMULA_CATALOG_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: "",
  };
  const companyId = preferredCompany(companies, contracts);
  record.playableCompanyId = companyId;
  record.name = `${companies.find((company) => company.id === companyId)?.name ?? "Imported"} Starting Universe`;
  record.review = buildReview(record, companyId);
  record.status = "Review Required";
  return record;
}

export function selectStartingUniverseCompany(record: StartingUniverseRecord, companyId: string): StartingUniverseRecord {
  if (!record.companies.some((company) => company.id === companyId)) return record;
  const next = { ...record, playableCompanyId: companyId, status: "Review Required" as const, confirmedAt: "", updatedAt: now() };
  return { ...next, name: `${next.companies.find((company) => company.id === companyId)?.name ?? "Imported"} Starting Universe`, review: buildReview(next, companyId) };
}

export function rebuildStartingUniverseReview(record: StartingUniverseRecord, review: StartingUniverseReview): StartingUniverseRecord {
  const next = { ...record, review, status: record.status === "Confirmed" ? "Review Required" as const : record.status, confirmedAt: record.status === "Confirmed" ? "" : record.confirmedAt, updatedAt: now() };
  return { ...next, review: { ...review, issues: reviewIssues(next, next.playableCompanyId, review) } };
}

export function addWorldWorkerToRoster(record: StartingUniverseRecord, workerId: string): StartingUniverseRecord {
  if (record.review.roster.some((decision) => decision.workerId === workerId)) return record;
  const worker = record.workers.find((item) => item.id === workerId);
  const company = record.companies.find((item) => item.id === record.playableCompanyId);
  if (!worker || !company) return record;
  const contract: StartingUniverseContract = {
    id: `added:${record.playableCompanyId}:${worker.id}`,
    companyId: record.playableCompanyId,
    companyName: company.name,
    workerId: worker.id,
    workerName: worker.name,
    ringName: worker.name,
    shortName: worker.name,
    perception: "To Be Decided",
    babyface: true,
    gimmick: "",
    gimmickRating: null,
    rosterUsage: "Whatever's Needed",
    intendedRole: "Normal",
    brand: "",
    momentum: 50,
    exclusive: false,
    written: false,
    daysLeft: 0,
    datesLeft: 0,
    amount: 0,
    downside: 0,
    contractBegan: record.source.gameDate,
    debuted: "",
    flags: worker.flags,
  };
  const classification: StartingRosterClass = worker.flags.wrestler || worker.flags.occasionalWrestler ? "Wrestler" : "Staff";
  const decision: StartingUniverseRosterDecision = {
    workerId,
    contractId: contract.id,
    included: true,
    rosterClass: classification,
    primaryRole: classification === "Wrestler" ? "Wrestler" : worker.flags.roadAgent ? "Road Agent" : worker.flags.manager ? "Manager" : "Staff",
    addedFromWorld: true,
    note: "Added from the imported TEW world during starting-roster review.",
    workbookMetrics: calculateWorkbookMetrics(worker, contract),
  };
  const next = { ...record, contracts: [...record.contracts, contract], review: { ...record.review, roster: [...record.review.roster, decision].sort((left, right) => (record.workers.find((item) => item.id === left.workerId)?.name ?? "").localeCompare(record.workers.find((item) => item.id === right.workerId)?.name ?? "")), rosterAcknowledged: false } };
  return rebuildStartingUniverseReview(next, { ...next.review, tagTeams: buildTeamDecisions(next, next.playableCompanyId, next.review.roster, next.review.tagTeams), stables: buildStableDecisions(next, next.playableCompanyId, next.review.roster, next.review.stables) });
}

export function confirmStartingUniverse(record: StartingUniverseRecord): StartingUniverseRecord {
  const blocking = record.review.issues.filter((issue) => issue.severity === "Blocking");
  const unacknowledgedTeams = record.review.tagTeams.some((decision) => decision.included && !decision.acknowledged);
  if (blocking.length) throw new Error(blocking[0].message);
  if (!record.review.rosterAcknowledged || !record.review.titlesAcknowledged || !record.review.teamsAcknowledged) throw new Error("Acknowledge the roster, titles and television, and teams and stables reviews before confirming the starting universe.");
  if (unacknowledgedTeams) throw new Error("Acknowledge every included tag-team identity before confirming the starting universe.");
  const timestamp = now();
  return { ...record, status: "Confirmed", confirmedAt: timestamp, updatedAt: timestamp };
}

function styleId(value: string): WrestlerStyleId {
  const normalized = normalize(value);
  if (normalized.includes("comedy")) return "comedy-performer";
  if (normalized.includes("daredevil") || normalized.includes("psychopath")) return "daredevil";
  if (normalized.includes("entertainer")) return "entertainer";
  if (normalized.includes("luchador")) return "luchador";
  if (normalized.includes("high flyer")) return "high-flyer";
  if (normalized.includes("powerhouse")) return "heavyweight-powerhouse";
  if (normalized.includes("mma")) return "mma-crossover";
  if (normalized.includes("technician flyer")) return "hybrid-technician-flyer";
  if (normalized.includes("technician striker")) return "hybrid-technician-striker";
  if (normalized.includes("technician")) return "pure-technician";
  if (normalized.includes("striker") || normalized.includes("impactful")) return "impact-striker";
  if (normalized.includes("brawler") || normalized.includes("hardcore")) return "brawler";
  return "all-rounder";
}

function untouchedProfile(profile: MatchEngineProfile): boolean {
  return profile.overall === 60 && profile.health === 100 && profile.popularity === 50 && profile.experience === 50 && profile.fanReaction === 3 && profile.gimmick === 3 && Object.values(profile.skills).every((value) => value === 60);
}

export function applyStartingRosterToMatchEngine(
  record: StartingUniverseRecord,
  universe: MatchEngineUniverse,
  replaceExisting = false,
): { universe: MatchEngineUniverse; created: number; updated: number; preserved: number } {
  if (record.status !== "Confirmed") throw new Error("Confirm the starting universe before applying its roster ratings to the Match Engine.");
  const workers = new Map(record.workers.map((worker) => [worker.id, worker]));
  const byKey = new Map(universe.profiles.map((profile) => [profile.workerKey, profile]));
  const profiles = [...universe.profiles];
  let created = 0;
  let updated = 0;
  let preserved = 0;
  for (const decision of record.review.roster.filter((item) => item.included && item.rosterClass !== "Staff")) {
    const worker = workers.get(decision.workerId);
    if (!worker) continue;
    const base = createMatchEngineProfile({ id: worker.id, name: worker.name, source: "tew" });
    const existing = byKey.get(base.workerKey);
    if (existing && !replaceExisting && !untouchedProfile(existing)) {
      preserved += 1;
      continue;
    }
    const profile: MatchEngineProfile = {
      ...(existing ?? base),
      workerId: worker.id,
      workerName: worker.name,
      workerSource: "tew",
      styleId: styleId(worker.style),
      overall: decision.workbookMetrics.overallRating,
      health: decision.workbookMetrics.matchHealth,
      popularity: decision.workbookMetrics.popularityRating,
      experience: decision.workbookMetrics.realInRingExperience,
      fanReaction: Math.max(1, Math.min(5, decision.workbookMetrics.perceptionRating || 1)),
      gimmick: Math.max(1, Math.min(5, decision.workbookMetrics.gimmickStarRating || 1)),
      skills: worker.skills,
      notes: [existing?.notes, `Imported from ${record.source.fileName}.`, `All 16 Excel approach ratings retained in Starting Universe ${record.id}.`, `Formula catalog: ${record.approachFormulaVersion}.`].filter(Boolean).join("\n"),
      updatedAt: now(),
    };
    if (existing) {
      const index = profiles.findIndex((item) => item.workerKey === existing.workerKey);
      profiles[index] = profile;
      updated += 1;
    } else {
      profiles.push(profile);
      byKey.set(profile.workerKey, profile);
      created += 1;
    }
  }
  return { universe: { ...universe, profiles }, created, updated, preserved };
}

export function startingUniverseManifest(record: StartingUniverseRecord): StartingUniverseManifestRecord {
  const company = record.companies.find((item) => item.id === record.playableCompanyId);
  const roster = record.review.roster.filter((decision) => decision.included);
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    mode: record.mode,
    playableCompanyId: record.playableCompanyId,
    playableCompanyName: company?.name ?? "",
    sourceFormat: record.source.format,
    sourceFileName: record.source.fileName,
    sourceFingerprint: record.source.fingerprint,
    gameDate: record.source.gameDate,
    companyCount: record.companies.length,
    workerCount: record.workers.length,
    contractCount: record.contracts.length,
    rosterCount: roster.length,
    titleCount: record.review.titles.filter((decision) => decision.included).length,
    tagTeamCount: record.review.tagTeams.filter((decision) => decision.included).length,
    approachFormulaVersion: record.approachFormulaVersion,
    estimatedBytes: JSON.stringify(record).length * 2,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    confirmedAt: record.confirmedAt,
  };
}
